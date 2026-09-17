# US Tax Tools — Tax Organizer & Client Portal (v0.1 scaffold)

This is the first module of US Tax Tools: a secure portal where a firm sends
a tax organizer to a client, the client answers questions and uploads
documents, and staff track progress and follow up on anything missing.

This scaffold sets up the foundation everything else will sit on: the
database schema, tenant isolation, and auth wiring. The organizer builder,
client-facing forms, and staff dashboard are not built yet — see "What's
next."

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
- **Secrets:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS entirely and must
  only ever be used server-side (e.g. for admin actions like sending
  invites) — never in a Client Component, never logged, never committed.

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
3. Copy `.env.example` to `.env.local` and fill in the three values from
   Project Settings → API.
4. `npm install`
5. `npm run dev` and open `http://localhost:3000` — you should see a
   confirmation page once the app can reach Supabase.

### Inviting users

There's no invite UI yet. Until there is, invite someone from a trusted
server context (e.g. the Supabase dashboard's "Invite user" or the admin
API) and pass `firm_id`, `role`, and `full_name` in the invited user's
metadata — the `handle_new_user` trigger reads those to create their
`profiles` row and, for clients, link them to an existing `clients` row by
matching email within the firm.

## What's built vs. what's next

**Built:** schema, RLS policies, storage bucket + policies, auth session
plumbing (browser/server Supabase clients, `src/proxy.ts` for session
refresh — Next.js 16 renamed `middleware.ts` to `proxy.ts`), the controlled
organizer-submission function, and a running app shell.

**Next, roughly in order:**
1. Auth pages (sign in, accept-invite/set-password) and a route-level check
   that sends signed-out users to sign in.
2. Firm staff: create a client, build an organizer template, send an
   organizer.
3. Client-facing organizer form + document upload.
4. Staff dashboard: status per client, view responses and documents, post a
   follow-up request.
5. AI-assisted extraction from uploaded documents (later — v1 is intentionally
   manual/reliable first, AI-enhanced second).

## Before this touches real client data

This is a first pass, not a security review. Before any real taxpayer data
goes anywhere near it:
- Write tests that actually try to breach tenant isolation (client A reading
  client B's organizer, a client hitting a staff-only table directly) rather
  than only testing the happy path.
- Add rate limiting on auth endpoints.
- Decide whether any single field (SSN, EIN) needs application-level
  encryption in addition to Supabase's at-rest encryption, since that
  affects whether/how those fields can be searched or indexed.
- Write the firm's actual WISP — this codebase can be one input to it, not a
  substitute for it.
