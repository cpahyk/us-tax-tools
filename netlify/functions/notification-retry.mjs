// Netlify invokes scheduled functions only on the published deployment.
// Keep credentials in the Functions environment, never in netlify.toml.
export default async function notificationRetry() {
  const secret = process.env.NOTIFICATION_CRON_SECRET;
  const siteUrl = process.env.URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!secret || !siteUrl) throw new Error('Notification scheduler is not configured');
  const origin = new URL(siteUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password) {
    throw new Error('Notification scheduler requires an HTTPS portal URL');
  }
  const response = await fetch(new URL('/api/notifications/dispatch', origin.origin), {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}` },
    redirect: 'error',
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`Notification dispatch failed (${response.status})`);
  const result = await response.json();
  if (result.configured !== true) throw new Error('Notification email is not configured');
  console.info(`[notifications] Retry completed: ${Number(result.processed) || 0} processed`);
}
