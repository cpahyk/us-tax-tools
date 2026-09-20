-- US Tax Tools — migration 0003: save_organizer_response()
-- Run after 0001_init.sql and 0002_send_organizer.sql.

-- Clients already have direct INSERT/UPDATE RLS access to
-- organizer_responses (responses_insert_client / responses_update_client
-- in 0001), so this function doesn't strictly need to touch that table on
-- their behalf. What it DOES need to do that plain RLS can't: flip the
-- parent organizer from 'sent' to 'in_progress' on first answer, and
-- clients have no UPDATE policy on organizers at all (by design — see
-- submit_organizer). So: security DEFINER, with the same "check ownership
-- yourself since RLS won't" pattern as submit_organizer.
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
  v_response organizer_responses;
begin
  select o.id, o.client_id, o.status
    into v_organizer_id, v_client_id, v_status
  from organizer_items oi
  join organizers o on o.id = oi.organizer_id
  where oi.id = p_organizer_item_id;

  if v_organizer_id is null then
    raise exception 'Question not found';
  end if;

  if v_client_id <> private.current_client_id() then
    raise exception 'Not authorized to answer this question';
  end if;

  if v_status not in ('sent', 'in_progress') then
    raise exception 'This organizer is no longer accepting changes (status: %)', v_status;
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
