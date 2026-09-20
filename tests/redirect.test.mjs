import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeRedirectPath } from '../src/lib/safe-redirect.ts';
test('redirects stay on the application origin', () => {
  for (const value of [null, '//evil.test', '/\\evil.test', '/\n/evil.test', 'https://evil.test']) assert.equal(safeRedirectPath(value), null);
  assert.equal(safeRedirectPath('/portal?tab=all'), '/portal?tab=all');
});
