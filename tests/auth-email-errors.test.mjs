import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authEmailFailure } from '../src/lib/auth-email-errors.ts';

test('email quota failures explain the problem without promising a reset time', () => {
  for (const error of [
    { code: 'over_email_send_rate_limit', status: 429 },
    { message: 'Email rate limit exceeded' },
  ]) {
    const result = authEmailFailure(error, 'client');
    assert.match(result.error, /sending limit/);
    assert.doesNotMatch(result.error, /SMTP|60|one minute/);
    assert.equal(result.cooldownSeconds, 60);
    assert.match(authEmailFailure(error, 'staff').error, /SMTP/);
  }
});

test('request throttling and unknown provider failures remain distinct', () => {
  for (const error of [{ status: 429 }, { code: 'over_request_rate_limit' }]) {
    const result = authEmailFailure(error, 'client');
    assert.match(result.error, /Too many requests/);
    assert.equal(result.cooldownSeconds, 60);
  }
  const result = authEmailFailure({ message: 'private upstream details' }, 'client');
  assert.doesNotMatch(result.error, /private upstream details/);
  assert.equal(result.cooldownSeconds, 0);
});
