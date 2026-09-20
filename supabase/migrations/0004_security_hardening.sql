-- Security hardening: apply after 0003. Existing invalid relationships fail closed.
begin;

-- A user must never be able to change their authorization attributes.
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- Clients may see themselves and the staff member assigned to their organizer,
-- not the names and email addresses of every other client in the firm.
drop policy profiles_select_same_firm on public.profiles;
create policy profiles_select_authorized on public.profiles for select to authenticated using (
  id = auth.uid() or (private.is_firm_staff() and firm_id = private.current_firm_id())
  or (firm_id = private.current_firm_id() and role in ('firm_admin', 'firm_staff') and exists (
    select 1 from public.organizers o where o.created_by = profiles.id and o.client_id = private.current_client_id()
  ))
);

-- Answers must use the validated, serialized RPC path.
drop policy responses_insert_client on public.organizer_responses;
drop policy responses_update_client on public.organizer_responses;
revoke insert, update on public.organizer_responses from authenticated;

create or replace function private.current_client_id()
returns uuid language sql security definer stable set search_path = public as $$
  select c.id from clients c join profiles p on p.id = c.profile_id
  where p.id = auth.uid() and p.role = 'client' and c.firm_id = p.firm_id;
$$;
create unique index clients_profile_id_unique on public.clients(profile_id) where profile_id is not null;

-- Enforce tenant relationships even when callers bypass application RPCs.
alter table public.clients add constraint clients_id_firm_unique unique (id, firm_id);
alter table public.organizer_templates add constraint templates_id_firm_unique unique (id, firm_id);
alter table public.organizers add constraint organizers_id_client_firm_unique unique (id, client_id, firm_id);
alter table public.organizer_items add constraint items_id_organizer_unique unique (id, organizer_id);
alter table public.organizers add constraint organizers_client_firm_fk foreign key (client_id, firm_id) references public.clients(id, firm_id);
alter table public.organizers add constraint organizers_template_firm_fk foreign key (template_id, firm_id) references public.organizer_templates(id, firm_id);
alter table public.documents add constraint documents_client_firm_fk foreign key (client_id, firm_id) references public.clients(id, firm_id);
alter table public.documents add constraint documents_organizer_scope_fk foreign key (organizer_id, client_id, firm_id) references public.organizers(id, client_id, firm_id);
alter table public.documents add constraint documents_item_scope_fk foreign key (organizer_item_id, organizer_id) references public.organizer_items(id, organizer_id);
alter table public.documents add constraint documents_item_requires_organizer check (organizer_item_id is null or organizer_id is not null);
alter table public.documents add constraint documents_path_scope check (split_part(storage_path, '/', 1) = firm_id::text and split_part(storage_path, '/', 2) = client_id::text);

-- Validate linked profiles and prevent staff from associating foreign identities.
create function private.validate_client_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from profiles where id = new.profile_id and firm_id = new.firm_id and role = 'client'
  ) then raise exception 'Invalid client profile'; end if;
  return new;
end;
$$;
create trigger clients_validate_profile before insert or update on public.clients
for each row execute function private.validate_client_profile();

-- Invite metadata is accepted only on an admin-created invite. Ordinary signup
-- must use server-controlled app metadata; user metadata alone cannot grant roles.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_metadata jsonb;
  v_firm_id uuid;
  v_role profile_role;
begin
  v_metadata := case when new.invited_at is not null then new.raw_user_meta_data else new.raw_app_meta_data end;
  v_firm_id := (v_metadata->>'firm_id')::uuid;
  v_role := (v_metadata->>'role')::profile_role;
  if v_firm_id is null or v_role is null then
    raise exception 'An authorized invitation is required';
  end if;
  insert into profiles (id, firm_id, role, full_name, email)
  values (new.id, v_firm_id, v_role, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);
  if v_role = 'client' then
    update clients set profile_id = new.id, status = 'active'
    where firm_id = v_firm_id and lower(email) = lower(new.email) and profile_id is null;
    if not found then raise exception 'No matching client invitation'; end if;
  end if;
  return new;
end;
$$;

-- File answers refer to registered, existing objects belonging to the question.
create function private.answer_is_valid(p_item organizer_items, p_value jsonb)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(case p_item.response_type
    when 'file' then exists (
      select 1 from documents d join storage.objects s on s.bucket_id = 'client-documents' and s.name = d.storage_path
      where d.organizer_item_id = p_item.id and d.organizer_id = p_item.organizer_id
    )
    when 'text' then jsonb_typeof(p_value) = 'string' and length(btrim(p_value #>> '{}')) > 0
    when 'number' then jsonb_typeof(p_value) = 'number'
    when 'boolean' then jsonb_typeof(p_value) = 'boolean'
    when 'select' then jsonb_typeof(p_value) = 'string' and (p_item.options->'choices') @> jsonb_build_array(p_value)
    else false end, false);
$$;

-- Serialize document registration against submission using the same parent lock.
create function private.validate_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  if new.organizer_id is not null then
    select status into v_status from organizers where id = new.organizer_id for update;
    if not private.is_firm_staff() and v_status not in ('sent', 'in_progress') then
      raise exception 'This organizer is no longer accepting changes';
    end if;
  end if;
  if new.organizer_item_id is not null and not exists (
    select 1 from organizer_items where id = new.organizer_item_id and response_type = 'file'
  ) then raise exception 'This question does not accept files'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'client-documents' and name = new.storage_path) then
    raise exception 'Uploaded object not found';
  end if;
  return new;
end;
$$;
create trigger documents_validate before insert or update on public.documents
for each row execute function private.validate_document();

drop policy storage_insert on storage.objects;
create policy storage_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'client-documents' and exists (
    select 1 from public.clients c where c.id::text = (storage.foldername(name))[2]
    and c.firm_id::text = (storage.foldername(name))[1]
    and c.firm_id = private.current_firm_id()
    and (private.is_firm_staff() or c.id = private.current_client_id())
  )
);
create or replace function public.save_organizer_response(
  p_organizer_item_id uuid,
  p_value jsonb
)
returns organizer_responses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_organizer_id uuid;
  v_client_id uuid;
  v_status text;
  v_response organizer_responses; v_item organizer_items;
begin
  select o.id, o.client_id, o.status
    into v_organizer_id, v_client_id, v_status
  from organizer_items oi
  join organizers o on o.id = oi.organizer_id
  where oi.id = p_organizer_item_id for update of o;

  if v_organizer_id is null then
    raise exception 'Question not found';
  end if;

  if auth.uid() is null or v_client_id is distinct from private.current_client_id() then
    raise exception 'Not authorized to answer this question';
  end if;

  if v_status not in ('sent', 'in_progress') then
    raise exception 'This organizer is no longer accepting changes (status: %)', v_status;
  end if;

  select * into v_item from organizer_items where id = p_organizer_item_id;
  if jsonb_typeof(p_value) = 'string' and length(btrim(p_value #>> '{}')) = 0 then
    p_value := 'null'::jsonb;
  end if;
  if p_value is not null and p_value <> 'null'::jsonb
    and not private.answer_is_valid(v_item, p_value) then
    raise exception 'Invalid answer for this question';
  end if;

  insert into organizer_responses (organizer_item_id, value, responded_by, responded_at)
  values (p_organizer_item_id, p_value, auth.uid(), now())
  on conflict (organizer_item_id)
  do update set value = excluded.value, responded_by = excluded.responded_by, responded_at = now()
  returning * into v_response;

  if v_status = 'sent' then
    update organizers set status = 'in_progress' where id = v_organizer_id;
  end if;

  return v_response;
end;
$$;

grant execute on function public.save_organizer_response(uuid, jsonb) to authenticated;

create or replace function public.submit_organizer(p_organizer_id uuid)
returns organizers language plpgsql security definer set search_path = public as $$
declare
  v_organizer organizers;
  v_missing_count int;
begin
  select * into v_organizer from organizers where id = p_organizer_id for update;

  if v_organizer.id is null then
    raise exception 'Organizer not found';
  end if;

  if auth.uid() is null or v_organizer.client_id is distinct from private.current_client_id() then
    raise exception 'Not authorized to submit this organizer';
  end if;

  if v_organizer.status not in ('sent', 'in_progress') then
    raise exception 'Organizer is not in a submittable state (current: %)', v_organizer.status;
  end if;

  select count(*) into v_missing_count
  from organizer_items oi
  left join organizer_responses r on r.organizer_item_id = oi.id
  where oi.organizer_id = p_organizer_id
    and oi.is_required
    and not private.answer_is_valid(oi, r.value);

  if v_missing_count > 0 then
    raise exception 'Cannot submit: % required item(s) are unanswered', v_missing_count;
  end if;

  update organizers set status = 'submitted', submitted_at = now()
  where id = p_organizer_id
  returning * into v_organizer;

  insert into audit_log (firm_id, actor_id, action, target_type, target_id)
  values (v_organizer.firm_id, auth.uid(), 'organizer.submitted', 'organizer', p_organizer_id);

  return v_organizer;
end;
$$;


revoke all on function public.save_organizer_response(uuid, jsonb), public.submit_organizer(uuid), public.send_organizer(uuid, uuid, int, text) from public, anon;
grant execute on function public.save_organizer_response(uuid, jsonb), public.submit_organizer(uuid), public.send_organizer(uuid, uuid, int, text) to authenticated;
revoke all on function private.answer_is_valid(organizer_items, jsonb), private.validate_document(), private.validate_client_profile(), public.handle_new_user() from public, anon, authenticated;
commit;
