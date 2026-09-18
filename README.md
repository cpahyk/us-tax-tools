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
- **Documents:** stored in a private Supabase Storage bucket
  (`client-documents`), never public. Storage policies mirror the database
  ones, keyed off the `{firm_id}/{client_id}/...` path prefix, so access is
  enforced by Storage itself, not just by the app choosing not to show a
  link.
- **Audit log:** append-only — there's a `select` policy for staff, but no
  `update`/`delete` policy for anyone, and inserts happen through
  security-definer functions rather than being open to the app role
  directly. Document uploads are logged automatically via a trigger;
  organizer submission is logged inside `submit_organizer()`.
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
2. In the SQL Editor, run `supabase/migrations/0001_init.sql` (or use the
   Supabase CLI: `supabase link` then `supabase db push`).
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
4. Copy `.env.example` to `.env.local` and fill in the values from Project
   Settings → API Keys (`NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) plus
   `NEXT_PUBLIC_SITE_URL`.
5. `npm install`
6. `npm run dev`, open `http://localhost:3000`, and you should land on
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

**Built:** schema, RLS policies, storage bucket + policies, auth session
plumbing (browser/server Supabase clients, `src/proxy.ts` for session
refresh — Next.js 16 renamed `middleware.ts` to `proxy.ts`), the controlled
organizer-submission function, and the full sign-in loop: passwordless
email link → `/auth/confirm` → routed to `/dashboard` (staff) or `/portal`
(client) based on `profiles.role`, with `/` and both destination pages
redirecting signed-out visitors back to `/login`. Both destinations are
still stubs — real content is next.

**Auth approach:** email magic link only, no passwords, for both staff and
clients — simplest to build correctly and nothing to leak or reuse. Route
protection is per-page (`getCurrentProfile()` in `src/lib/auth.ts`, called
at the top of each protected page), not centralized in the proxy — the
proxy's only job is refreshing the session cookie. Password or SSO login
can be added later without touching the data model.

**Next, roughly in order:**
1. Firm staff: create a client, build an organizer template, send an
   organizer.
2. Client-facing organizer form + document upload.
3. Staff dashboard: status per client, view responses and documents, post a
   follow-up request.
4. AI-assisted extraction from uploaded documents (later — v1 is intentionally
   manual/reliable first, AI-enhanced second).

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
