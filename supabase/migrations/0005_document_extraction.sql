-- US Tax Tools — migration 0005: AI document extraction (disabled until configured)
-- Run after 0001-0004.
--
-- Access model: this table is written only by trusted server-side code
-- using the secret key once an approved extraction worker is implemented — there's no
-- INSERT policy for `authenticated` at all. Staff can read and mark
-- reviewed via normal RLS; clients get no policy on this table, full stop
-- — extracted data is a staff efficiency tool, not something shown to
-- clients before a human has checked it.

create table document_extractions (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null unique references documents(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','completed','failed','unsupported')),
  document_type text,
  tax_year      int,
  fields        jsonb,
  flags         jsonb,
  summary       text,
  error_message text,
  reviewed_by   uuid references profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger document_extractions_set_updated_at before update on document_extractions
  for each row execute function private.set_updated_at();

alter table document_extractions enable row level security;

create policy "extractions_select_staff" on document_extractions
  for select using (
    exists (
      select 1 from documents d
      where d.id = document_id
      and private.is_firm_staff()
      and d.firm_id = private.current_firm_id()
    )
  );

-- Scoped narrowly to the "mark reviewed" action — a staff member can only
-- ever set reviewed_by to their own id (checked in the with check below,
-- mirroring the audit_log_insert_staff pattern from migration 0002), not
-- attribute a review to a colleague.
create policy "extractions_update_staff" on document_extractions
  for update using (
    exists (
      select 1 from documents d
      where d.id = document_id
      and private.is_firm_staff()
      and d.firm_id = private.current_firm_id()
    )
  )
  with check (reviewed_by is null or reviewed_by = auth.uid());

revoke all on document_extractions from anon, authenticated;
grant select on document_extractions to authenticated;
grant update (reviewed_by, reviewed_at) on document_extractions to authenticated;
