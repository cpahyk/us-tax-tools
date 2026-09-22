import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real server loader with only its framework and network edges mocked.
function loadProfile({ claims, profile, error = null }) {
  let queried = false;
  const client = {
    auth: { getClaims: async () => ({ data: { claims }, error: null }) },
    from() {
      queried = true;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: profile, error }) }) }) };
    },
  };
  const source = fs.readFileSync(new URL('../src/lib/auth.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    console: { error() {} },
    require(name) {
      if (name === 'server-only') return {};
      if (name === 'react') return { cache: fn => fn };
      if (name === 'next/navigation') return { redirect: path => { throw new Error(`redirect:${path}`); } };
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return { run: exports.getCurrentProfile, queried: () => queried };
}

test('signed-out visitors do not query a profile', async () => {
  const loader = loadProfile({ claims: null });
  assert.equal(await loader.run(), null);
  assert.equal(loader.queried(), false);
});

test('database errors cannot masquerade as signed-out sessions', async () => {
  const loader = loadProfile({ claims: { sub: 'user' }, error: { code: 'PGRST205' } });
  await assert.rejects(loader.run(), /Unable to load your account/);
});

test('an authenticated user without a profile reaches account setup', async () => {
  const loader = loadProfile({ claims: { sub: 'user' }, profile: null });
  await assert.rejects(loader.run(), /redirect:\/auth\/setup-required/);
});

test('a provisioned account returns its profile', async () => {
  const profile = { id: 'user', firm_id: 'firm', role: 'firm_admin', full_name: 'Owner', email: 'owner@example.com' };
  assert.equal(await loadProfile({ claims: { sub: 'user' }, profile }).run(), profile);
});
