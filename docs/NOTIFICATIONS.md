# Notifications

Staff and clients have an unread inbox. Messages refresh every 15 seconds while the page is visible; notifications refresh every 30 seconds. Incoming message alerts are marked read when the newest message is visible.

New messages notify the other party. Organizer issue, review, correction requests, and title/year changes notify the client. Starting and submitting an organizer notify the staff member who created it. Individual answer saves do not each send email. Email contains a generic activity summary and a portal link, without message content or tax answers.

Database migration `0009_notifications.sql` records events atomically with the underlying activity. Delivery uses leased queue entries, stable provider idempotency keys, and bounded retries. Provider acceptance is recorded as sent; delivery status is available in Resend.

## Configuration

Set these server-side environment values on the app host:

- `RESEND_API_KEY`: sending-only key restricted to the verified sender domain.
- `EMAIL_FROM`: verified sender, such as `US Tax Tools <noreply@taxpreparertools.com>`.
- `NEXT_PUBLIC_SITE_URL`: the public portal origin, including HTTPS.
- `NOTIFICATION_CRON_SECRET`: a random secret for the dispatch endpoint.

Never commit credentials. Authentication SMTP in Supabase is configured separately from these app notification credentials.

Actions and inbox refreshes attempt queued delivery. For retries when nobody is using the app, configure the hosting scheduler to POST to `/api/notifications/dispatch` every five minutes with `Authorization: Bearer <NOTIFICATION_CRON_SECRET>`. Store this authorization value in the scheduler's secret store. No hosting scheduler is configured yet.

## Verified September 24, 2026

- Migration 0009 applied to project `bftekjewrpcvkvogxbic`.
- Restricted Resend key saved to ignored `.env.local`; setup email delivered to the administrator's approved test address.
- Administrator inbox and organizer page verified in the signed-in browser.
- Live message triggers route to the correct party; test inserts were rolled back.
- Anonymous table and worker access denied; dispatch returns 401 without its secret and 200 with it.
- 17 automated tests and lint pass; production build passed during implementation.

The portal currently runs locally. Before external client use, deploy it to a server-capable host, set the public origin and notification secrets there, update Supabase Auth redirect URLs, and configure the scheduler. A static marketing site cannot run this Next.js server application.

On this Windows machine, Node needs the system certificate store for outbound HTTPS. The verified development launch used PowerShell `$env:NODE_OPTIONS='--use-system-ca'` followed by `npm run dev`. Keep TLS verification enabled.

AI document extraction remains disabled.
