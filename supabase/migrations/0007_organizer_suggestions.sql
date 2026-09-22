-- US Tax Tools — migration 0007: organizer answer suggestions from extraction
-- Run after 0001-0006.
--
-- When a client uploads a document, extraction (migration 0005) can also
-- notice that the document answers OTHER questions in the same organizer
-- (e.g. a W-2 upload answering "What were your total wages?") and propose
-- a value for them. This table holds those proposals. Nothing here ever
-- writes to organizer_responses directly — a suggestion becomes a real
-- answer only when the client accepts it via save_organizer_response(),
-- the same controlled path a manually-typed answer goes through. That's
-- the whole point: "AI-generated tax outputs must be treated as
-- suggestions requiring verification," so a suggestion table that only
-- becomes a response when confirmed is the model, not a shortcut.

create table organizer_item_suggestions (
  id                uuid primary key default gen_random_uuid(),
  organizer_item_id uuid not null references organizer_items(id) on delete cascade,
  document_id       uuid not null references documents(id) on delete cascade,
  suggested_value   jsonb not null,
  based_on          text not null,
  status            text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index organizer_item_suggestions_item_idx on organizer_item_suggestions(organizer_item_id);

-- Reserved for a future approved extraction worker using an admin client — same
-- access model as document_extractions. No INSERT policy for anyone.
alter table organizer_item_suggestions enable row level security;

create policy "suggestions_select" on organizer_item_suggestions
  for select using (
    exists (
      select 1 from organizer_items oi join organizers o on o.id = oi.organizer_id
      where oi.id = organizer_item_id
      and (
        (private.is_firm_staff() and o.firm_id = private.current_firm_id())
        or o.client_id = private.current_client_id()
      )
    )
  );

-- No direct updates: acceptance and response saving must commit together.
revoke all on organizer_item_suggestions from anon, authenticated;
grant select on organizer_item_suggestions to authenticated;

create function private.validate_suggestion_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from organizer_items i join organizers o on o.id = i.organizer_id
    join documents d on d.id = new.document_id
    where i.id = new.organizer_item_id and d.organizer_id = o.id
      and d.client_id = o.client_id and d.firm_id = o.firm_id
  ) then raise exception 'Suggestion source must belong to the same organizer'; end if;
  return new;
end;
$$;
create trigger suggestions_validate_scope before insert or update on organizer_item_suggestions
for each row execute function private.validate_suggestion_scope();
-- Preserve scope if a referenced document or question is moved later.
create function private.preserve_suggestion_scope() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'documents' then
    if (new.organizer_id,new.client_id,new.firm_id) is distinct from
       (old.organizer_id,old.client_id,old.firm_id)
       and exists(select 1 from organizer_item_suggestions where document_id=old.id)
    then raise exception 'Document has linked suggestions'; end if;
  elsif new.organizer_id is distinct from old.organizer_id
    and exists(select 1 from organizer_item_suggestions where organizer_item_id=old.id)
  then raise exception 'Question has linked suggestions'; end if;
  return new;
end;
$$;
create trigger documents_preserve_suggestion_scope before update on documents
for each row execute function private.preserve_suggestion_scope();
create trigger items_preserve_suggestion_scope before update on organizer_items
for each row execute function private.preserve_suggestion_scope();

create function public.resolve_organizer_suggestion(p_suggestion_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_suggestion organizer_item_suggestions; v_organizer organizers;
begin
  -- Lock parent first, matching response saving and submission lock order.
  select o.* into v_organizer from organizers o
  join organizer_items i on i.organizer_id=o.id
  join organizer_item_suggestions s on s.organizer_item_id=i.id
  where s.id=p_suggestion_id for update of o;
  if auth.uid() is null or v_organizer.id is null or
     v_organizer.client_id is distinct from private.current_client_id()
  then raise exception 'Not authorized'; end if;
  if v_organizer.status not in ('sent','in_progress')
  then raise exception 'This organizer is no longer accepting changes'; end if;
  select * into v_suggestion from organizer_item_suggestions where id=p_suggestion_id for update;
  if v_suggestion.status <> 'pending' or p_accept is null
  then raise exception 'Suggestion is already resolved or decision is invalid'; end if;
  if p_accept then
    perform public.save_organizer_response(v_suggestion.organizer_item_id,v_suggestion.suggested_value);
  end if;
  update organizer_item_suggestions
  set status=case when p_accept then 'accepted' else 'dismissed' end, resolved_at=now()
  where id=p_suggestion_id;
end;
$$;
revoke all on function private.validate_suggestion_scope(), private.preserve_suggestion_scope() from public, anon, authenticated;
revoke all on function public.resolve_organizer_suggestion(uuid,boolean) from public, anon;
grant execute on function public.resolve_organizer_suggestion(uuid,boolean) to authenticated;
