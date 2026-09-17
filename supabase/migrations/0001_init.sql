-- US Tax Tools — initial schema: tenancy, tax organizers, documents, audit log
-- Design: every tenant-owned table carries firm_id; Row Level Security enforces
-- that a firm's staff only ever see their own firm's rows, and a client only
-- ever sees their own records within that firm. See README.md for the full
-- security model and rationale.

create extension if not exists "pgcrypto";
create schema if not exists private;

-- ============================================================================
-- TENANCY
-- ============================================================================

create table firms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create type profile_role as enum ('firm_admin', 'firm_staff', 'client');

-- One row per authenticated user (staff or client), created automatically
-- on signup by the handle_new_user trigger below.
create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  firm_id    uuid not null references firms(id) on delete cascade,
  role       profile_role not null,
  full_name  text not null,
  email      text not null,
  created_at timestamptz not null default now()
);

create index profiles_firm_id_idx on profiles(firm_id);

-- The business record for a client. Created by firm staff, often before the
-- client has an account — profile_id is filled in once they accept an invite
-- and sign up.
create table clients (
  id                  uuid primary key default gen_random_uuid(),
  firm_id             uuid not null references firms(id) on delete cascade,
  profile_id          uuid references profiles(id) on delete set null,
  primary_contact_name text not null,
  email               text not null,
  client_type         text not null default 'individual' check (client_type in ('individual', 'business')),
  status              text not null default 'invited' check (status in ('invited', 'active', 'archived')),
  created_by          uuid not null references profiles(id),
  created_at          timestamptz not null default now()
);

create index clients_firm_id_idx on clients(firm_id);
create unique index clients_firm_email_idx on clients(firm_id, lower(email));

-- ============================================================================
-- TAX ORGANIZERS
-- ============================================================================

-- Reusable question sets a firm can send out year after year.
create table organizer_templates (
  id         uuid primary key default gen_random_uuid(),
  firm_id    uuid not null references firms(id) on delete cascade,
  name       text not null,
  tax_year   int not null,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table organizer_template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references organizer_templates(id) on delete cascade,
  sort_order    int not null default 0,
  section_title text,
  prompt        text not null,
  help_text     text,
  response_type text not null check (response_type in ('text','number','boolean','select','file')),
  options       jsonb,
  is_required   boolean not null default true
);

create index organizer_template_items_template_id_idx on organizer_template_items(template_id);

-- A template, sent to one specific client for one tax year. Items are copied
-- from the template at send time so later template edits don't retroactively
-- change an organizer a client is already filling out.
create table organizers (
  id           uuid primary key default gen_random_uuid(),
  firm_id      uuid not null references firms(id) on delete cascade,
  client_id    uuid not null references clients(id) on delete cascade,
  template_id  uuid references organizer_templates(id),
  tax_year     int not null,
  title        text not null,
  status       text not null default 'draft' check (status in ('draft','sent','in_progress','submitted','reviewed')),
  created_by   uuid not null references profiles(id),
  sent_at      timestamptz,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index organizers_firm_id_idx on organizers(firm_id);
create index organizers_client_id_idx on organizers(client_id);

create table organizer_items (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references organizers(id) on delete cascade,
  sort_order    int not null default 0,
  section_title text,
  prompt        text not null,
  help_text     text,
  response_type text not null check (response_type in ('text','number','boolean','select','file')),
  options       jsonb,
  is_required   boolean not null default true
);

create index organizer_items_organizer_id_idx on organizer_items(organizer_id);

create table organizer_responses (
  id                uuid primary key default gen_random_uuid(),
  organizer_item_id uuid not null unique references organizer_items(id) on delete cascade,
  value             jsonb,
  responded_by      uuid references profiles(id),
  responded_at      timestamptz,
  updated_at        timestamptz not null default now()
);

-- Lightweight request/reply thread per organizer, for "we still need your
-- 1099-B" type back-and-forth between staff and client.
create table organizer_messages (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references organizers(id) on delete cascade,
  author_id    uuid not null references profiles(id),
  body         text not null,
  created_at   timestamptz not null default now()
);

create index organizer_messages_organizer_id_idx on organizer_messages(organizer_id);

-- ============================================================================
-- DOCUMENTS
-- ============================================================================

create table documents (
  id                uuid primary key default gen_random_uuid(),
  firm_id           uuid not null references firms(id) on delete cascade,
  client_id         uuid not null references clients(id) on delete cascade,
  organizer_id      uuid references organizers(id) on delete set null,
  organizer_item_id uuid references organizer_items(id) on delete set null,
  uploaded_by       uuid not null references profiles(id),
  storage_path      text not null,
  file_name         text not null,
  mime_type         text,
  size_bytes        bigint,
  status            text not null default 'pending_review' check (status in ('pending_review','reviewed')),
  created_at        timestamptz not null default now()
);

create index documents_firm_id_idx on documents(firm_id);
create index documents_client_id_idx on documents(client_id);

-- ============================================================================
-- AUDIT LOG (append-only)
-- ============================================================================

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  firm_id     uuid not null references firms(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_firm_id_idx on audit_log(firm_id);

-- ============================================================================
-- HELPER FUNCTIONS — used inside RLS policies
-- security definer + a fixed search_path so these can read `profiles`/`clients`
-- without recursing into the RLS policies defined on those tables.
-- ============================================================================

create or replace function private.current_firm_id()
returns uuid language sql security definer stable set search_path = public as $$
  select firm_id from profiles where id = auth.uid();
$$;

create or replace function private.is_firm_staff()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role in ('firm_admin', 'firm_staff')
  );
$$;

create or replace function private.current_client_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from clients where profile_id = auth.uid();
$$;

create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizers_set_updated_at before update on organizers
  for each row execute function private.set_updated_at();
create trigger organizer_responses_set_updated_at before update on organizer_responses
  for each row execute function private.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table firms enable row level security;
alter table profiles enable row level security;
alter table clients enable row level security;
alter table organizer_templates enable row level security;
alter table organizer_template_items enable row level security;
alter table organizers enable row level security;
alter table organizer_items enable row level security;
alter table organizer_responses enable row level security;
alter table organizer_messages enable row level security;
alter table documents enable row level security;
alter table audit_log enable row level security;

create policy "firms_select_own" on firms
  for select using (id = private.current_firm_id());

create policy "profiles_select_same_firm" on profiles
  for select using (firm_id = private.current_firm_id());
create policy "profiles_update_self" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "clients_select_staff" on clients
  for select using (private.is_firm_staff() and firm_id = private.current_firm_id());
create policy "clients_select_self" on clients
  for select using (profile_id = auth.uid());
create policy "clients_insert_staff" on clients
  for insert with check (private.is_firm_staff() and firm_id = private.current_firm_id());
create policy "clients_update_staff" on clients
  for update using (private.is_firm_staff() and firm_id = private.current_firm_id())
  with check (private.is_firm_staff() and firm_id = private.current_firm_id());

create policy "templates_all_staff" on organizer_templates
  for all using (private.is_firm_staff() and firm_id = private.current_firm_id())
  with check (private.is_firm_staff() and firm_id = private.current_firm_id());

create policy "template_items_all_staff" on organizer_template_items
  for all using (exists (
    select 1 from organizer_templates t
    where t.id = template_id and private.is_firm_staff() and t.firm_id = private.current_firm_id()
  ));

create policy "organizers_select_staff" on organizers
  for select using (private.is_firm_staff() and firm_id = private.current_firm_id());
create policy "organizers_select_client" on organizers
  for select using (client_id = private.current_client_id());
-- Staff can create/edit organizers freely within their firm. Clients never get
-- raw UPDATE on this table — status changes go through submit_organizer() below
-- so a client can't, say, rewrite firm_id or jump straight to 'reviewed'.
create policy "organizers_write_staff" on organizers
  for all using (private.is_firm_staff() and firm_id = private.current_firm_id())
  with check (private.is_firm_staff() and firm_id = private.current_firm_id());

create policy "organizer_items_select" on organizer_items
  for select using (exists (
    select 1 from organizers o where o.id = organizer_id
    and (
      (private.is_firm_staff() and o.firm_id = private.current_firm_id())
      or o.client_id = private.current_client_id()
    )
  ));
create policy "organizer_items_write_staff" on organizer_items
  for all using (exists (
    select 1 from organizers o where o.id = organizer_id
    and private.is_firm_staff() and o.firm_id = private.current_firm_id()
  ));

create policy "responses_select" on organizer_responses
  for select using (exists (
    select 1 from organizer_items oi join organizers o on o.id = oi.organizer_id
    where oi.id = organizer_item_id
    and (
      (private.is_firm_staff() and o.firm_id = private.current_firm_id())
      or o.client_id = private.current_client_id()
    )
  ));
create policy "responses_insert_client" on organizer_responses
  for insert with check (exists (
    select 1 from organizer_items oi join organizers o on o.id = oi.organizer_id
    where oi.id = organizer_item_id and o.client_id = private.current_client_id()
  ));
create policy "responses_update_client" on organizer_responses
  for update using (exists (
    select 1 from organizer_items oi join organizers o on o.id = oi.organizer_id
    where oi.id = organizer_item_id and o.client_id = private.current_client_id()
  ));

create policy "messages_select" on organizer_messages
  for select using (exists (
    select 1 from organizers o where o.id = organizer_id
    and (
      (private.is_firm_staff() and o.firm_id = private.current_firm_id())
      or o.client_id = private.current_client_id()
    )
  ));
create policy "messages_insert" on organizer_messages
  for insert with check (
    author_id = auth.uid() and exists (
      select 1 from organizers o where o.id = organizer_id
      and (
        (private.is_firm_staff() and o.firm_id = private.current_firm_id())
        or o.client_id = private.current_client_id()
      )
    )
  );

create policy "documents_select_staff" on documents
  for select using (private.is_firm_staff() and firm_id = private.current_firm_id());
create policy "documents_select_client" on documents
  for select using (client_id = private.current_client_id());
create policy "documents_insert" on documents
  for insert with check (
    uploaded_by = auth.uid() and (
      (private.is_firm_staff() and firm_id = private.current_firm_id())
      or client_id = private.current_client_id()
    )
  );
create policy "documents_update_staff" on documents
  for update using (private.is_firm_staff() and firm_id = private.current_firm_id());

-- Append-only from the client app's point of view: readable by staff, no
-- update/delete policy exists for anyone, writes happen via security-definer
-- functions (see submit_organizer and log_document_upload).
create policy "audit_log_select_staff" on audit_log
  for select using (private.is_firm_staff() and firm_id = private.current_firm_id());

-- ============================================================================
-- CONTROLLED STATE TRANSITIONS (security definer RPCs)
-- ============================================================================

-- The only way a client can move an organizer to 'submitted'. Validates
-- ownership and that every required item has an answer, then logs it.
create or replace function public.submit_organizer(p_organizer_id uuid)
returns organizers language plpgsql security definer set search_path = public as $$
declare
  v_organizer organizers;
  v_missing_count int;
begin
  select * into v_organizer from organizers where id = p_organizer_id;

  if v_organizer.id is null then
    raise exception 'Organizer not found';
  end if;

  if v_organizer.client_id <> private.current_client_id() then
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
    and (r.value is null or r.value = 'null'::jsonb);

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

create or replace function private.log_document_upload()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (firm_id, actor_id, action, target_type, target_id, metadata)
  values (new.firm_id, new.uploaded_by, 'document.uploaded', 'document', new.id,
          jsonb_build_object('file_name', new.file_name));
  return new;
end;
$$;

create trigger documents_log_upload after insert on documents
  for each row execute function private.log_document_upload();

-- ============================================================================
-- PROFILE PROVISIONING — runs when someone accepts an invite and signs up.
-- Expects firm_id / role / full_name in the new user's raw_user_meta_data,
-- set when the invite is created (see README "Inviting users").
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_firm_id uuid := (new.raw_user_meta_data->>'firm_id')::uuid;
  v_role    profile_role := coalesce((new.raw_user_meta_data->>'role')::profile_role, 'client');
begin
  insert into profiles (id, firm_id, role, full_name, email)
  values (new.id, v_firm_id, v_role, coalesce(new.raw_user_meta_data->>'full_name', new.email), new.email);

  if v_role = 'client' then
    update clients set profile_id = new.id, status = 'active'
    where firm_id = v_firm_id and lower(email) = lower(new.email) and profile_id is null;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- GRANTS — table/function-level privileges for the `authenticated` role.
-- These control which *operations* are allowed at all; RLS policies above
-- still gate which *rows* each operation can see or touch. No DELETE is
-- granted anywhere yet — v1 has no user-facing delete flow.
-- ============================================================================

grant usage on schema public to authenticated;

grant select, insert, update on
  firms, profiles, clients,
  organizer_templates, organizer_template_items,
  organizers, organizer_items, organizer_responses, organizer_messages,
  documents, audit_log
to authenticated;

grant execute on function
  private.current_firm_id(), private.is_firm_staff(), private.current_client_id(),
  public.submit_organizer(uuid)
to authenticated;

-- ============================================================================
-- STORAGE — private bucket, path convention: {firm_id}/{client_id}/{filename}
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create policy "storage_select_staff" on storage.objects
  for select using (
    bucket_id = 'client-documents' and private.is_firm_staff()
    and (storage.foldername(name))[1] = private.current_firm_id()::text
  );
create policy "storage_select_client" on storage.objects
  for select using (
    bucket_id = 'client-documents'
    and (storage.foldername(name))[2] = private.current_client_id()::text
  );
create policy "storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'client-documents' and (
      (private.is_firm_staff() and (storage.foldername(name))[1] = private.current_firm_id()::text)
      or (storage.foldername(name))[2] = private.current_client_id()::text
    )
  );
