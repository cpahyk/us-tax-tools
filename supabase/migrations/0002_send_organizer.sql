-- US Tax Tools — migration 0002: staff audit-log inserts, send_organizer()
-- Run this after 0001_init.sql (including against a project that already
-- has 0001 applied — this file only adds new objects).

-- 0001 gave staff SELECT on audit_log but no way to write to it directly
-- (only submit_organizer(), a security-definer function, could insert).
-- Staff actions like "sent an organizer" want to log too, without every
-- single one needing its own security-definer wrapper — so give staff a
-- real (but tightly scoped) insert path: their own firm only, attributed
-- to themselves only, and still with no update/delete policy for anyone,
-- so the log stays append-only.
create policy "audit_log_insert_staff" on audit_log
  for insert with check (
    private.is_firm_staff()
    and firm_id = private.current_firm_id()
    and actor_id = auth.uid()
  );

-- Needed to call private.* functions directly (as send_organizer does below)
-- — RLS policy expressions that reference these same functions don't
-- require it, but a plain function body calling them does. The 0001
-- migration granted EXECUTE on the individual functions but missed this.
grant usage on schema private to authenticated;

-- Sends a template to a client: copies the template's items into a fresh
-- organizer_items set (so later template edits don't retroactively change
-- an organizer a client already has) and logs it, as one transaction.
--
-- Deliberately security INVOKER (the default) rather than definer: staff
-- already have full RLS-backed access to organizers/organizer_items/
-- audit_log within their own firm, so this function doesn't need to
-- bypass anything — it just needs the two inserts to succeed or fail
-- together, which any function does for its caller regardless of definer
-- vs invoker. Running as invoker means RLS keeps applying normally, so a
-- bug here can't accidentally grant more access than the caller already had.
create or replace function public.send_organizer(
  p_client_id uuid,
  p_template_id uuid,
  p_tax_year int,
  p_title text
)
returns organizers
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_organizer organizers;
  v_firm_id uuid := private.current_firm_id();
begin
  -- organizers.firm_id and organizers.client_id are independent foreign
  -- keys with nothing enforcing they agree — without this check, passing
  -- another firm's client_id would create a row this firm can see (via
  -- firm_id) that the OTHER firm's real client can also see (via
  -- client_id, since organizers_select_client only checks that column).
  if not exists (select 1 from clients where id = p_client_id and firm_id = v_firm_id) then
    raise exception 'Client not found in your firm';
  end if;

  if not exists (select 1 from organizer_templates where id = p_template_id and firm_id = v_firm_id) then
    raise exception 'Template not found in your firm';
  end if;

  insert into organizers (firm_id, client_id, template_id, tax_year, title, status, created_by, sent_at)
  values (v_firm_id, p_client_id, p_template_id, p_tax_year, p_title, 'sent', auth.uid(), now())
  returning * into v_organizer;

  insert into organizer_items (organizer_id, sort_order, section_title, prompt, help_text, response_type, options, is_required)
  select v_organizer.id, sort_order, section_title, prompt, help_text, response_type, options, is_required
  from organizer_template_items
  where template_id = p_template_id
  order by sort_order;

  insert into audit_log (firm_id, actor_id, action, target_type, target_id, metadata)
  values (v_organizer.firm_id, auth.uid(), 'organizer.sent', 'organizer', v_organizer.id,
          jsonb_build_object('client_id', p_client_id, 'template_id', p_template_id));

  return v_organizer;
end;
$$;

grant execute on function public.send_organizer(uuid, uuid, int, text) to authenticated;
