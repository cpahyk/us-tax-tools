import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as crypto from 'node:crypto';
import { z } from 'zod';

function login(reserved, rpcError = null) {
  let sends = 0;
  let reservation;
  const exports = {};
  const source = fs.readFileSync(new URL('../src/app/login/actions.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, process: { env: {} },
    require(name) {
      if (name === 'node:crypto') return crypto;
      if (name === 'zod') return { z };
      if (name === '@/lib/supabase/admin') return { createAdminClient: () => ({ rpc: async (name, args) => { reservation = { name, args }; return { data: reserved, error: rpcError }; } }) };
      if (name === '@/lib/supabase/server') return { createClient: async () => ({ auth: { signInWithOtp: async () => { sends++; return { error: null }; } } }) };
      if (name === '@/lib/auth-email-errors') return { authEmailFailure: () => ({ error: 'Provider error' }) };
      throw new Error(name);
    },
  });
  return { run: email => exports.signIn({ status: 'idle' }, { get: () => email }), sends: () => sends, reservation: () => reservation };
}

test('login sends only after reserving a normalized, hashed email', async () => {
  const action = login(true);
  assert.equal((await action.run(' OWNER@EXAMPLE.COM ')).status, 'sent');
  assert.equal(action.sends(), 1);
  assert.equal(action.reservation().args.p_email_hash, crypto.createHash('sha256').update('owner@example.com').digest('hex'));
});

test('cooldown rejection and database failures prevent email sends', async () => {
  for (const action of [login(false), login(null, { code: 'PGRST202' })]) {
    assert.equal((await action.run('owner@example.com')).status, 'error');
    assert.equal(action.sends(), 0);
  }
});

test('invalid email does not reserve a cooldown or send mail', async () => {
  const action = login(true);
  assert.equal((await action.run('bad email')).status, 'error');
  assert.equal(action.reservation(), undefined);
  assert.equal(action.sends(), 0);
});
