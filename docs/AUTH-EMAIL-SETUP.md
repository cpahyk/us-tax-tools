# Resolving Auth email rate limits

Sign-in links and portal invitations are sent by Supabase Auth. The app's
`RESEND_API_KEY` and `EMAIL_FROM` configure organizer notifications only;
they do not configure Supabase Auth's sender.

## Existing email provider

1. Open the relevant Supabase project's **Authentication → SMTP Settings**
   (under **Sign In / Providers** in some dashboard versions).
2. Enable custom SMTP and enter your provider's SMTP host, port, username,
   password, and a sender address on its verified domain. An HTTP API key is
   not automatically an SMTP password; use your provider's documented values.
3. Save, then inspect **Authentication → Rate Limits**. Custom SMTP starts with
   a low sending limit; set an appropriate quota within your provider's limits.
   Leave abuse protections and the per-user retry interval enabled.
4. If custom SMTP is already configured, inspect Auth logs and the provider's
   delivery logs for which quota was reached, rejected credentials, or sender
   verification errors. Raising an Auth quota does not raise a provider quota.
5. Preserve the magic-link/invite email templates and redirect configuration
   documented in README. Disable link tracking that rewrites auth URLs.
6. After the relevant sending window resets, test one sign-in to an existing
   account. Verify delivery and link completion before retrying repeatedly.

Do not paste SMTP passwords into source control or client-side environment
variables. Configure them in Supabase's hosted SMTP settings.

## Resend example (only if this is your provider)

Use `smtp.resend.com`, port `465`, username `resend`, and your Resend API key
as the SMTP password. Use a sender on your verified domain.

## Application behavior

Sign-in and invitation rate-limit errors now have specific messages and a
60-second minimum UI retry delay. The delay is not the provider's quota reset
time. The email sending cap can remain active longer. The UI cooldown resets on navigation. The login action also reserves a
60-second cooldown atomically through a service-only database function, keyed
by the SHA-256 digest of the normalized email. Database failures prevent sending.
This supplements Supabase rate limits; direct Auth requests and attacks using
many different addresses still require provider-side abuse protection. The app
does not automatically retry or bypass Auth email limits.

## Deployment verification — September 21, 2026

Project `bftekjewrpcvkvogxbic` had no public application tables. Applied
repository migrations 0001–0004 together in a transaction through the SQL
editor and recorded their versions in `supabase_migrations.schema_migrations`.
Created the user-approved initial firm and administrator profile, with an
`account.admin_bootstrapped` audit entry. A real authenticated request returned
HTTP 200 from `/dashboard` with the administrator role and no error boundary.

Profile database errors now throw a server error rather than pretending the
session is signed out. Authenticated users without a profile go to
`/auth/setup-required`. Four regression tests cover those states.

The portal remains a local Next.js application at `http://localhost:3000`.
Publishing a public portal requires a Next.js host; then update Supabase's
Site URL, redirect allowlist, and the deployed `NEXT_PUBLIC_SITE_URL` together.
The existing marketing domain is not evidence that the portal is deployed.

## References

- [Supabase SMTP configuration](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Resend SMTP configuration](https://resend.com/changelog/smtp-service)

## Additional migrations applied — September 21, 2026

- 0005_document_extraction: staff can update only review columns; clients have
  no extraction access.
- 0006_otp_cooldown: atomic service-only email reservation, one-day retention,
  and a private document bucket limited to 20 MiB PDF/JPEG/PNG/WebP/GIF uploads.
- 0007_organizer_suggestions: typed JSON values, same-organizer document scope,
  protected source references, and atomic acceptance through the existing
  validated response RPC. Direct suggestion updates are disallowed.

All three migrations and their version records were applied in one transaction.
Live checks verified that all tables are reachable, the first cooldown request
succeeds, the next is rejected, anonymous callers cannot reserve requests, and
storage limits are present. The database suite now discovers every migration
and rejects duplicate versions. Login tests cover hashing, cooldown denial,
database failure, and invalid email input.

AI extraction remains disabled at the owner's request: no worker, provider
calls, automatic document transmission, or AI suggestion UI is enabled. These
tables and RPCs are preparation for a separately approved extraction workflow.
