-- Notifications are committed with the event. Email delivery is an independent
-- leased outbox; failures cannot lose an event or roll back a saved message.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete cascade,
  target_client_id uuid references public.clients(id) on delete cascade,
  recipient_email text not null,
  kind text not null check(kind in ('message','organizer_sent','organizer_started','organizer_submitted','organizer_reviewed','changes_requested','organizer_updated')),
  event_key text not null unique,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  email_status text not null default 'pending' check(email_status in ('pending','processing','sent','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  email_error text,
  check(num_nonnulls(recipient_id,target_client_id)=1)
);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create index notifications_client_idx on public.notifications(target_client_id,created_at desc);
create index notifications_queue_idx on public.notifications(next_attempt_at) where email_status in ('pending','processing');
alter table public.notifications enable row level security;
create policy notifications_select_recipient on public.notifications for select to authenticated using (
  (recipient_id=auth.uid() or target_client_id=private.current_client_id())
  and exists(select 1 from public.organizers o where o.id=organizer_id)
);
revoke all on public.notifications from anon,authenticated;
grant select(id,organizer_id,kind,created_at,read_at) on public.notifications to authenticated;
grant all on public.notifications to service_role;

create function public.mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update notifications n set read_at=coalesce(read_at,now())
  where n.id=p_id and (n.recipient_id=auth.uid() or n.target_client_id=private.current_client_id());
end;
$$;
create function public.mark_message_notifications_read(p_organizer_id uuid,p_through timestamptz)
returns void language plpgsql security definer set search_path=public as $$
begin
  update notifications n set read_at=coalesce(read_at,now())
  where n.organizer_id=p_organizer_id and n.kind='message' and n.created_at<=p_through
    and (n.recipient_id=auth.uid() or n.target_client_id=private.current_client_id());
end;
$$;

create function private.queue_organizer_notification(p_organizer_id uuid,p_kind text,p_event_key text,p_for_client boolean,p_created_at timestamptz)
returns void language plpgsql security definer set search_path=public as $$
declare v_o organizers; v_email text;
begin
  select * into strict v_o from organizers where id=p_organizer_id;
  if p_for_client then
    select email into v_email from clients where id=v_o.client_id and firm_id=v_o.firm_id;
    insert into notifications(organizer_id,target_client_id,recipient_email,kind,event_key,created_at)
    values(v_o.id,v_o.client_id,v_email,p_kind,p_event_key,p_created_at) on conflict(event_key) do nothing;
  else
    select email into v_email from profiles where id=v_o.created_by and firm_id=v_o.firm_id and role in ('firm_admin','firm_staff');
    if v_email is not null then
      insert into notifications(organizer_id,recipient_id,recipient_email,kind,event_key,created_at)
      values(v_o.id,v_o.created_by,v_email,p_kind,p_event_key,p_created_at) on conflict(event_key) do nothing;
    end if;
  end if;
end;
$$;
create function private.notify_organizer_event() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_kind text; v_for_client boolean;
begin
  if tg_op='INSERT' then
    if new.status='sent' then v_kind:='organizer_sent'; v_for_client:=true; end if;
  elsif new.status is distinct from old.status then
    case new.status
      when 'sent' then v_kind:=case when old.status in ('submitted','reviewed') then 'changes_requested' else 'organizer_sent' end; v_for_client:=true;
      when 'in_progress' then v_kind:='organizer_started'; v_for_client:=false;
      when 'submitted' then v_kind:='organizer_submitted'; v_for_client:=false;
      when 'reviewed' then v_kind:='organizer_reviewed'; v_for_client:=true;
      else null;
    end case;
  elsif new.title is distinct from old.title or new.tax_year is distinct from old.tax_year then
    v_kind:='organizer_updated'; v_for_client:=true;
  end if;
  if v_kind is not null then
    perform private.queue_organizer_notification(new.id,v_kind,gen_random_uuid()::text,v_for_client,now());
  end if;
  return new;
end;
$$;
create trigger organizers_notify after insert or update on public.organizers
for each row execute function private.notify_organizer_event();
create function private.notify_organizer_message() returns trigger
language plpgsql security definer set search_path=public as $$
declare v_role profile_role;
begin
  select role into v_role from profiles where id=new.author_id;
  perform private.queue_organizer_notification(new.organizer_id,'message','message:'||new.id::text,v_role<>'client',new.created_at);
  return new;
end;
$$;
create trigger messages_notify after insert on public.organizer_messages
for each row execute function private.notify_organizer_message();

alter table public.organizer_messages add column request_id uuid;
create unique index messages_request_unique on public.organizer_messages(author_id,request_id);
alter table public.organizer_messages add constraint message_body_length check(length(btrim(body)) between 1 and 5000) not valid;
create function public.post_organizer_message(p_organizer_id uuid,p_body text,p_request_id uuid)
returns organizer_messages language plpgsql security invoker set search_path=public as $$
declare v_message organizer_messages;
begin
  if auth.uid() is null or p_request_id is null then raise exception 'Not authorized'; end if;
  insert into organizer_messages(organizer_id,author_id,body,request_id)
  values(p_organizer_id,auth.uid(),btrim(p_body),p_request_id)
  on conflict(author_id,request_id) do nothing returning * into v_message;
  if v_message.id is null then
    select * into v_message from organizer_messages where author_id=auth.uid() and request_id=p_request_id;
    if v_message.id is null or v_message.organizer_id<>p_organizer_id or v_message.body<>btrim(p_body)
    then raise exception 'Request does not match the saved message'; end if;
  end if;
  return v_message;
end;
$$;

alter table public.organizers add column change_request_reason text;
create function public.request_organizer_changes(p_organizer_id uuid,p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare v_o organizers;
begin
  if auth.uid() is null or not private.is_firm_staff() then raise exception 'Not authorized'; end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 5000 then raise exception 'Enter a reason (up to 5000 characters)'; end if;
  select * into v_o from organizers where id=p_organizer_id and firm_id=private.current_firm_id() for update;
  if v_o.id is null then raise exception 'Organizer not found'; end if;
  if v_o.status not in ('submitted','reviewed') then raise exception 'Organizer is not awaiting review'; end if;
  update organizers set status='sent',submitted_at=null,change_request_reason=btrim(p_reason) where id=v_o.id;
  insert into audit_log(firm_id,actor_id,action,target_type,target_id)
  values(v_o.firm_id,auth.uid(),'organizer.changes_requested','organizer',v_o.id);
end;
$$;

create function public.claim_notification_emails(p_organizer_id uuid default null)
returns setof notifications language plpgsql security definer set search_path=public as $$
begin
  -- Stop uncertain retries before the provider's idempotency retention expires.
  update notifications set email_status='failed',email_error='retry_window_expired'
  where email_status in ('pending','processing') and attempts>0
    and (created_at<now()-interval '23 hours' or (attempts>=5 and next_attempt_at<=now()));
  return query with candidates as (
    select id from notifications where email_status in ('pending','processing')
      and next_attempt_at<=now() and attempts<5
      and (p_organizer_id is null or organizer_id=p_organizer_id)
    order by created_at for update skip locked limit 20
  ) update notifications n set email_status='processing',attempts=n.attempts+1,
      lease_id=gen_random_uuid(),next_attempt_at=now()+interval '5 minutes'
    from candidates c where n.id=c.id returning n.*;
end;
$$;
create function public.finish_notification_email(p_id uuid,p_lease_id uuid,p_sent boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  update notifications set email_status=case when p_sent then 'sent' when attempts>=5 then 'failed' else 'pending' end,
    email_error=case when p_sent then null else 'provider_error' end,
    next_attempt_at=now()+interval '5 minutes',lease_id=null
  where id=p_id and lease_id=p_lease_id and email_status='processing';
end;
$$;
revoke all on function private.queue_organizer_notification(uuid,text,text,boolean,timestamptz),private.notify_organizer_event(),private.notify_organizer_message() from public,anon,authenticated;
revoke all on function public.mark_notification_read(uuid),public.mark_message_notifications_read(uuid,timestamptz),public.post_organizer_message(uuid,text,uuid),public.request_organizer_changes(uuid,text) from public,anon;
grant execute on function public.mark_notification_read(uuid),public.mark_message_notifications_read(uuid,timestamptz),public.post_organizer_message(uuid,text,uuid),public.request_organizer_changes(uuid,text) to authenticated;
revoke all on function public.claim_notification_emails(uuid),public.finish_notification_email(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_notification_emails(uuid),public.finish_notification_email(uuid,uuid,boolean) to service_role;
