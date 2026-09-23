import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jsx from 'react/jsx-runtime';

function page({ missing = false, error = null } = {}) {
  const organizer = { id: 'organizer', title: 'Test organizer', tax_year: 2025, status: 'sent', submitted_at: null, client_id: 'client', clients: { primary_contact_name: 'Test client' } };
  const client = { from(table) {
    let selection;
    const query = {
      select(value) { selection = value; return query; },
      eq() { return query; }, in() { return query; }, order() { return query; },
      async maybeSingle() {
        // Reproduce PostgREST's ambiguity when both client foreign keys exist.
        if (table === 'organizers' && !selection.includes('clients!organizers_client_firm_fk(')) return { data: null, error: { code: 'PGRST201' } };
        return { data: missing || error ? null : organizer, error };
      },
      then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
    };
    return query;
  } };
  const exports = {};
  const source = fs.readFileSync(new URL('../src/app/dashboard/organizers/[id]/page.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, console: { error() {} },
    require(name) {
      if (name === 'react/jsx-runtime') return jsx;
      if (name === 'next/link') return { default: () => null };
      if (name === 'next/navigation') return { notFound() { throw new Error('NOT_FOUND'); } };
      if (name === '@/lib/auth') return { getCurrentProfile: async () => ({ id: 'staff' }) };
      if (name === '@/lib/supabase/server') return { createClient: async () => client };
      if (name === '@/lib/documents') return { withSignedUrls: async (_, docs) => docs };
      if (name === '@/components/message-thread') return { MessageThread: () => null };
      if (name === './request-changes') return { RequestChanges: () => null };
      if (name === './mark-reviewed-button') return { MarkReviewedButton: () => null };
      throw new Error(name);
    },
  });
  return () => exports.default({ params: Promise.resolve({ id: 'organizer' }) });
}

test('staff organizer renders with the explicit tenant-aware client relationship', async () => {
  const result = await page()();
  assert.match(JSON.stringify(result), /Test organizer/);
  assert.match(JSON.stringify(result), /Test client/);
});

test('a missing or inaccessible organizer remains a 404', async () => {
  await assert.rejects(page({ missing: true })(), /NOT_FOUND/);
});

test('database failures are not disguised as a missing organizer', async () => {
  await assert.rejects(page({ error: { code: 'PGRST201' } })(), /Unable to load this organizer/);
});
