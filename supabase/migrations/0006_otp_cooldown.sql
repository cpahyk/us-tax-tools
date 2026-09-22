-- US Tax Tools — migration 0006: OTP request cooldown
-- Run after 0001-0005.
--
-- This is a narrow, code-level defense-in-depth measure, not a full
-- rate-limiting solution — see README "Before this touches real client
-- data" for what it does and does not protect against (in short: it stops
-- one email being spammed with resends, it does not stop an attacker with
-- many different email addresses from exhausting the project's shared
-- email quota — that needs CAPTCHA on the sign-in form, which is
-- configuration, not something this migration can do).
--
-- No RLS policies at all: this table is never queried by anything except
-- the admin client from src/app/login/actions.ts, so there's nothing for
-- `authenticated` or `anon` to be granted access to.
create table otp_request_log (
  email_hash   text primary key check (email_hash ~ '^[0-9a-f]{64}$'),
  requested_at timestamptz not null default now()
);

alter table otp_request_log enable row level security;
revoke all on otp_request_log from anon, authenticated;

-- Atomic reservation prevents concurrent requests from both sending a link.
-- The caller supplies a SHA-256 digest of the normalized email, never the email.
create function public.reserve_otp_request(p_email_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_reserved boolean;
begin
  delete from otp_request_log where requested_at < now() - interval '1 day';
  insert into otp_request_log(email_hash, requested_at) values(p_email_hash, now())
  on conflict (email_hash) do update set requested_at = excluded.requested_at
  where otp_request_log.requested_at <= now() - interval '60 seconds'
  returning true into v_reserved;
  return coalesce(v_reserved, false);
end;
$$;
revoke all on function public.reserve_otp_request(text) from public, anon, authenticated;
grant execute on function public.reserve_otp_request(text) to service_role;

-- Server-side enforcement to match the client-side check in
-- organizer-form.tsx (which is only a UX nicety — this is what actually
-- stops an oversized or unexpected file type, regardless of what any
-- client does or doesn't check before uploading).
update storage.buckets
set file_size_limit = 20 * 1024 * 1024, -- 20MB
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'client-documents';
