import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { timingSafeEqual } from 'node:crypto';

function load(path, modules, env = {}) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, process: { env }, Buffer, Request, Response, console,
    require(name) {
      if (name === 'server-only') return {};
      if (name in modules) return modules[name];
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return exports;
}

test('notification worker retains unconfigured queues and acknowledges provider outcomes with the claimed lease', async () => {
  let configured = false;
  const calls = [], sends = [];
  const rows = [true, false].map((_, i) => ({ id: `event-${i}`, lease_id: `lease-${i}`, recipient_email: 'test@example.com', kind: 'message', organizer_id: 'organizer', target_client_id: 'client' }));
  const worker = load('../src/lib/notifications.ts', {
    'next/server': { after() {} },
    '@/lib/supabase/admin': { createAdminClient() { return { async rpc(name, args) { calls.push({ name, args }); return { data: name === 'claim_notification_emails' ? rows : null, error: null }; } }; } },
    '@/lib/email': { notificationEmailConfigured: () => configured, async sendNotificationEmail(input) { sends.push(input); return sends.length === 1; } },
    '@/lib/notification-content': { notificationContent: () => ({ subject: 'New activity', text: 'Visit portal' }) },
  }, { NEXT_PUBLIC_SITE_URL: 'https://portal.example.com' });
  assert.equal((await worker.dispatchNotificationEmails()).configured, false);
  assert.equal(calls.length, 0);
  configured = true;
  assert.equal((await worker.dispatchNotificationEmails('organizer')).processed, 2);
  assert.equal(calls[0].args.p_organizer_id, 'organizer');
  assert.equal(calls[1].args.p_lease_id, 'lease-0');
  assert.equal(calls[1].args.p_sent, true);
  assert.equal(calls[2].args.p_sent, false);
  assert.equal(sends[0].idempotencyKey, 'notification/event-0');
});

test('email transport passes stable idempotency keys and safely handles rate limits and network failures', async () => {
  let failure = null, options;
  const email = load('../src/lib/email.ts', {
    resend: { Resend: class { emails = { send: async (_, opts) => { options = opts; if (failure instanceof Error) throw failure; return { error: failure }; } }; } },
  }, { RESEND_API_KEY: 'test', EMAIL_FROM: 'test@example.com', NEXT_PUBLIC_SITE_URL: 'https://portal.example.com' });
  const input = { to: 'recipient@example.com', subject: 'Activity', text: 'Visit portal', idempotencyKey: 'event/1' };
  assert.equal(await email.sendNotificationEmail(input), true);
  assert.equal(options.idempotencyKey, input.idempotencyKey);
  failure = { name: 'rate_limit_exceeded' };
  assert.equal(await email.sendNotificationEmail(input), false);
  failure = new Error('Network unavailable');
  assert.equal(await email.sendNotificationEmail(input), false);
});

test('dispatch endpoint rejects absent or incorrect credentials without processing email', async () => {
  let calls = 0;
  const route = load('../src/app/api/notifications/dispatch/route.ts', {
    'node:crypto': { timingSafeEqual },
    '@/lib/notifications': { async dispatchNotificationEmails() { calls++; return { configured: true, processed: 0 }; } },
  }, { NOTIFICATION_CRON_SECRET: 'test-secret' });
  for (const token of ['', 'Bearer wrong', 'Bearer test-secrex']) {
    assert.equal((await route.POST(new Request('https://portal.example.com/api/notifications/dispatch', { method: 'POST', headers: { authorization: token } }))).status, 401);
  }
  assert.equal(calls, 0);
  assert.equal((await route.POST(new Request('https://portal.example.com/api/notifications/dispatch', { method: 'POST', headers: { authorization: 'Bearer test-secret' } }))).status, 200);
  assert.equal(calls, 1);
});
