# US Tax Tools — Tax Organizer & Client Portal (v0.1 scaffold)

This is the first module of US Tax Tools: a secure portal where a firm sends
a tax organizer to a client, the client answers questions and uploads
documents, and staff track progress and follow up on anything missing.

This scaffold sets up the foundation everything else will sit on: the
database schema, tenant isolation, and a working sign-in flow. The
organizer builder, client-facing forms, and the real staff/client dashboard
content are not built yet — see "What's next."

## Architecture

**Stack:** Next.js (App Router, TypeScript) + Supabase (Postgres, Auth,
Storage) + Tailwind CSS, deployed on Vercel with Supabase's managed Postgres.

**Why Supabase instead of assembling Postgres + a separate auth provider +
S3:** the biggest security requirement for this product is that Firm A can
never see Firm B's data, and a client can never see another client's data —
even if there's a bug in the application code. Postgres Row Level Security
(RLS) enforces that at the database layer, so it holds regardless of what a
future API route or background job gets wrong. Supabase gives us Postgres +
RLS-aware Auth + RLS-aware Storage as one product, which means:
- One set of users (`auth.users`) and one identity flows through to both
  database rows and file storage — no separate mapping to keep in sync.
- Fewer services for a small team to operate, patch, and pay for.
- A generous free tier while there's no revenue yet.

**Alternatives considered:**
- *Postgres + NextAuth + S3, hand-rolled:* more control, but tenant isolation
  would live only in application code (every query needs a manual `WHERE
  firm_id = ...`), which is one missed `WHERE` clause away from a data leak.
  More moving parts to wire together and secure ourselves.
- *Prisma on top of Supabase's Postgres:* fine for the schema itself, but
  Prisma typically connects with a role that bypasses RLS, which would mean
  re-implementing tenant checks in code anyway and losing the database-level
  guarantee. Went with hand-written SQL migrations instead so RLS is the
  actual enforcement point, not just documentation.

**Trade-off to revisit:** RLS policies are real code and need real tests —
a wrong policy fails silently (either over- or under-sharing data) rather
than throwing an error during development. See "Before this touches real
client data" below.

## Data model

- **firms** — one row per accounting firm (tenant).
- **profiles** — one row per authenticated person (staff or client), with a
  `role` (`firm_admin` / `firm_staff` / `client`) and `firm_id`. Created
  automatically on signup.
- **clients** — the business record for a firm's client. Created by staff,
  often before the client has an account; links to `profiles` once they
  accept an invite.
- **organizer_templates** / **organizer_template_items** — reusable question
  sets a firm can reuse every tax year.
- **organizers** — a template sent to one client for one tax year.
- **organizer_items** / **organizer_responses** — the questions on a specific
  organizer and the client's answers. Items are copied from the template at
  send time, so editing the template later doesn't change organizers already
  in a client's hands.
- **organizer_messages** — a simple thread per organizer for "we still need
  your 1099-B" style follow-ups.
- **documents** — uploaded files, linked to a client and optionally to a
  specific organizer question.
- **audit_log** — append-only record of sensitive actions.

Full definitions, constraints, and indexes are in
`supabase/migrations/0001_init.sql`.

## Security model

- **Tenant isolation:** every tenant-owned table has RLS enabled. Staff
  policies check `firm_id = private.current_firm_id()`; client policies check
  `client_id = private.current_client_id()`, which is narrower — a client
  only ever sees rows tied to their own client record, never their firm's
  other clients.
- **No direct status manipulation:** a client never gets raw `UPDATE` access
  to `organizers`. Submitting one goes through `submit_organizer()`, a
  database function that checks ownership, checks the organizer is in a
  submittable state, checks every required question is answered, and only
  then flips the status and writes an audit log entry. This closes off
  things like a client setting `status = 'reviewed'` directly or editing
  another client's `firm_id`.
- **Sending an organizer validates both ends:** `organizers.firm_id` and
  `organizers.client_id` are independent foreign keys with nothing enforcing
  they agree — a naive "insert with my firm_id" would let staff send an
  organizer using another firm's `client_id`, and that firm's real client
  would then see it via `organizers_select_client`, which only checks
  `client_id`. `send_organizer()` (migration 0002) explicitly checks that
  both the client and the template belong to the caller's own firm before
  doing anything — caught by a test written specifically to try this, not
  by inspection.
- **Answering a question also goes through a function, not raw RLS:**
  clients already have direct INSERT/UPDATE RLS access to
  `organizer_responses`, but flipping the parent organizer from `sent` to
  `in_progress` on the first answer needs to touch `organizers`, which
  clients have no UPDATE policy on at all. `save_organizer_response()`
  (migration 0003) is security definer for that reason, and — like
  `submit_organizer()` — re-checks that the question actually belongs to
  the caller's own organizer and that the organizer is still in an
  editable state before writing anything.
- **Documents:** stored in a private Supabase Storage bucket
  (`client-documents`), never public. Storage policies mirror the database
  ones, keyed off the `{firm_id}/{client_id}/...` path prefix, so access is
  enforced by Storage itself, not just by the app choosing not to show a
  link. Viewing one goes through a signed URL (`src/lib/documents.ts`),
  generated per-viewer with their own session and a one-hour expiry — the
  signing call itself still goes through the same storage policies, so it
  can't be used to see a file that viewer couldn't otherwise reach.
- **Audit log:** append-only — everyone gets `select` scoped to their own
  firm, but there's no `update`/`delete` policy for anyone. Staff can
  `insert` directly, but only rows for their own firm attributed to
  themselves (`firm_id`/`actor_id` both checked); clients can't insert at
  all — their actions are logged via `submit_organizer()`, a
  security-definer function, instead. Document uploads are logged
  automatically via a trigger.
- **Secrets:** `SUPABASE_SECRET_KEY` bypasses RLS entirely and must
  only ever be used server-side (e.g. for admin actions like sending
  invites) — never in a Client Component, never logged, never committed.
- **Session verification:** both `src/proxy.ts` and `getCurrentProfile()`
  use `getClaims()` rather than `getUser()` — it verifies the JWT locally
  against the project's cached JWKS instead of a network round-trip to the
  Auth server on every request, which is Supabase's current guidance for
  this. Either way, what a query actually returns is still decided by RLS,
  not by which of these two functions read the JWT.

**Regulatory context:** paid tax preparers are required to maintain a
Written Information Security Plan (WISP) under IRS Publication 4557 and the
FTC Safeguards Rule (Gramm-Leach-Bliley Act) — this covers encryption,
access controls, a designated qualified individual, a risk assessment, and
an incident response plan. This scaffold's RLS-based tenant isolation,
private document storage, and audit logging map onto pieces of that safeguards
program, but a WISP is an organizational/written document as much as a
technical one — it isn't satisfied by code alone. That document itself is a
separate deliverable from the software.

## Setup

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run `0001_init.sql`, `0002_send_organizer.sql`, and
   `0003_save_organizer_response.sql`, in order (or use the Supabase CLI:
   `supabase link` then `supabase db push`, which applies every migration
   file in order automatically).
3. **Configure email templates — required, easy to miss.** By default,
   Supabase's magic-link/invite emails point to Supabase's own verification
   endpoint, which isn't compatible with `src/app/auth/confirm/route.ts`
   (that route expects `token_hash` + `type` directly). In Authentication →
   Email Templates:
   - **Magic Link:** point the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/`
   - **Invite user:** point the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/`

   Then in Authentication → URL Configuration, set Site URL to match
   `NEXT_PUBLIC_SITE_URL` below (`http://localhost:3000` for local dev) and
   add it to the redirect allow list. Skip this step and the sign-in email
   will look fine but the link will 404 or land somewhere unexpected.
4. **Know the email sending limit before you start testing.** Supabase's
   built-in email service (what you're using until you set up your own) is
   capped at 2 emails/hour, is best-effort with no delivery guarantee, and
   — unless you configure custom SMTP — will only deliver to addresses that
   are members of your Supabase organization. You will hit this limit
   almost immediately just by testing the sign-in flow a few times in a
   row; the error looks like `Error message: email rate limit exceeded` or
   `AuthApiError: Email rate limit exceeded`, and it is not a bug in this
   app. Fix: Authentication → Sign In / Providers → SMTP Settings, add a
   provider (Resend, Postmark, SendGrid, and similar all work and are
   quick to set up), which also raises the limit to 30/hour by default
   (adjustable in Authentication → Rate Limits) and lifts the
   team-members-only restriction. Do this before inviting a real client to
   test the client role, or their invite email will silently never arrive.
5. **Notification emails (optional).** Separate from steps 3–4, which are
   about Supabase Auth's own emails: this app also sends its own
   notifications (organizer submitted, new message) via
   [Resend](https://resend.com) directly — reusing the same Resend account
   from step 4 if you set one up there is the easiest path. Without a
   `RESEND_API_KEY`, the app still works fine; it just skips sending these
   and logs a warning instead.
6. Copy `.env.example` to `.env.local` and fill in the values from Project
   Settings → API Keys (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) plus
   `NEXT_PUBLIC_SITE_URL` and, if you did step 5, `RESEND_API_KEY` /
   `EMAIL_FROM`.
7. `npm install`
8. `npm run dev`, open `http://localhost:3000`, and you should land on
   `/login`. Signing in emails a link; clicking it should land you on
   `/dashboard` or `/portal` depending on role.

### Inviting users

There's no invite UI yet. Until there is, invite someone from a trusted
server context (the Supabase dashboard's "Invite user," or
`supabase.auth.admin.inviteUserByEmail()` from a server-only script using
`SUPABASE_SECRET_KEY`) and pass `firm_id`, `role`, and `full_name` in the
invited user's metadata — the `handle_new_user` trigger reads those
immediately to create their `profiles` row (and, for clients, link an
existing `clients` row by matching email within the firm). The invite email
then carries them through the same `/auth/confirm` route as a normal
sign-in, just with `type=invite`.

## What's built vs. what's next

**Built:** schema across three migrations (0001: tenancy/organizers/
documents/RLS; 0002: staff audit-log inserts + `send_organizer()`; 0003:
`save_organizer_response()`), storage bucket + policies, the full sign-in
loop, and both sides of the organizer loop end to end:

- **Staff:** add a client, build a template, send an organizer, invite to
  the portal, then open `/dashboard/organizers/[id]` to see every answer
  and a real (signed, expiring) link to each uploaded file, read/post in
  that organizer's message thread, and mark a submitted one reviewed (an
  atomic status-guarded update, logged to `audit_log`).
- **Client:** `/portal` lists their organizers; `/portal/organizers/[id]`
  is the fill-out form — per-field autosave (text, number, yes/no, choice,
  file upload straight to Storage from the browser), the same message
  thread as staff sees, and a submit button wired to `submit_organizer()`
  (required-item validation included). Once submitted, the page becomes
  genuinely read-only, with the same signed-URL links for anything they
  uploaded.
- **Notifications:** email via Resend (`src/lib/email.ts`) when a client
  submits (to the staff member who sent it) and whenever either side posts
  a message (to whoever didn't post it), each with a direct link back to
  the organizer. Optional — with no `RESEND_API_KEY` set, these calls log a
  warning and skip sending rather than failing the submission or message
  they're attached to, which still succeed either way.

Signed URLs (`src/lib/documents.ts`) are generated with each viewer's own
session, so they only work for documents that viewer's RLS/storage
policies already permit — an hour-long expiry, regenerated on every page
load.

**Auth approach:** email magic link only, no passwords, for both staff and
clients — simplest to build correctly and nothing to leak or reuse. Both
`/dashboard` and `/portal` centralize their auth check in their own
`layout.tsx` (`getCurrentProfile()` from `src/lib/auth.ts`, memoized
per-request with React's `cache()`). The proxy's only job is refreshing the
session cookie, not gating routes.

**Known gap (closed):** the template builder now has a choices editor for
"Choice" questions — add/remove/edit choices inline when that response
type is selected, written to `organizer_items.options` as
`{"choices": [...]}`, which the client-side form already knew how to read.

**Not built yet:** editing a template or organizer after creation, and
deleting anything.

**Next:** AI-assisted extraction from uploaded documents — the last item
on the original v1 roadmap for this module. Everything before it (schema,
auth, the full send → fill out → submit → review → mark reviewed loop,
messaging, notifications) is built and tested.

## Before this touches real client data

This is a first pass, not a security review. Before any real taxpayer data
goes anywhere near it:
- Write tests that actually try to breach tenant isolation (client A reading
  client B's organizer, a client hitting a staff-only table directly) rather
  than only testing the happy path.
- Confirm Supabase's default auth rate limiting is sufficient for
  `signInWithOtp`, or add your own — right now anyone can request unlimited
  sign-in emails to any address.
- `src/app/error.tsx` currently shows the raw exception message to whoever
  hits the error. Fine for now; before launch, log the real message
  server-side and show clients/staff something generic instead.
- Decide whether any single field (SSN, EIN) needs application-level
  encryption in addition to Supabase's at-rest encryption, since that
  affects whether/how those fields can be searched or indexed.
- Write the firm's actual WISP — this codebase can be one input to it, not a
  substitute for it.
