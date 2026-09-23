import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('database authorization and organizer lifecycle', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema storage;
      create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, invited_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth, storage to authenticated, anon;
      create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
      alter table storage.objects enable row level security;
      grant select, insert on storage.objects to authenticated;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
    `);
    const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(f => f.endsWith('.sql')).sort();
    assert.equal(new Set(files.map(f => f.split('_')[0])).size, files.length, 'Migration versions must be unique');
    for (const file of files) {
      const sql = (await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8')).replace('create extension if not exists "pgcrypto";', '');
      await db.exec(sql);
    }
    // Seed pre-existing accounts independently of the provisioning trigger.
    await db.exec(`
      alter table auth.users disable trigger on_auth_user_created;
      insert into firms(id,name) values ('${id(1)}','A'),('${id(2)}','B');
      insert into auth.users(id,email) values ('${id(10)}','staff@a.test'),('${id(11)}','client@a.test'),('${id(12)}','client@b.test');
      insert into profiles(id,firm_id,role,full_name,email) values
        ('${id(10)}','${id(1)}','firm_staff','Staff','staff@a.test'),
        ('${id(11)}','${id(1)}','client','Client A','client@a.test'),
        ('${id(12)}','${id(2)}','client','Client B','client@b.test');
      insert into clients(id,firm_id,profile_id,primary_contact_name,email,created_by) values
        ('${id(20)}','${id(1)}','${id(11)}','A','client@a.test','${id(10)}'),
        ('${id(21)}','${id(2)}','${id(12)}','B','client@b.test','${id(12)}');
      insert into organizers(id,firm_id,client_id,tax_year,title,status,created_by) values
        ('${id(30)}','${id(1)}','${id(20)}',2025,'Tax','sent','${id(10)}');
      insert into organizer_items(id,organizer_id,prompt,response_type) values
        ('${id(40)}','${id(30)}','Name','text'),
        ('${id(41)}','${id(30)}','File','file'),
        ('${id(42)}','${id(30)}','Yes/no','boolean');
      alter table auth.users enable trigger on_auth_user_created;
    `);
    async function asUser(user, sql, role = 'authenticated') {
      await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${user ?? ''}', false)`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    }
    const denied = (user, sql, pattern, role) => assert.rejects(asUser(user, sql, role), pattern);
    await denied(id(11), `update profiles set role='firm_admin' where id='${id(11)}'`, /permission denied/);
    await asUser(id(11), `update profiles set full_name='Updated' where id='${id(11)}'`);
    await denied(id(10), `select save_organizer_response('${id(40)}','"x"')`, /Not authorized/);
    await denied(id(12), `select submit_organizer('${id(30)}')`, /Not authorized/);
    await denied(null, `select submit_organizer('${id(30)}')`, /permission denied/, 'anon');
    await denied(id(11), `insert into organizer_responses(organizer_item_id,value) values ('${id(40)}','"x"')`, /permission denied/);
    await denied(id(11), `select save_organizer_response('${id(40)}','123')`, /Invalid answer/);
    await asUser(id(11), `select save_organizer_response('${id(40)}','"   "')`);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /required item/);
    await asUser(id(11), `select save_organizer_response('${id(40)}','"Answer"')`);
    await asUser(id(11), `select save_organizer_response('${id(42)}','false')`);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /required item/);
    await denied(id(10), `insert into organizers(firm_id,client_id,tax_year,title,created_by) values ('${id(1)}','${id(21)}',2025,'Bad','${id(10)}')`, /foreign key/);
    const path = `${id(1)}/${id(20)}/test.pdf`;
    await denied(id(11), `insert into storage.objects(bucket_id,name) values ('client-documents','${id(2)}/${id(20)}/bad.pdf')`, /row-level security/);
    await asUser(id(11), `insert into storage.objects(bucket_id,name) values ('client-documents','${path}')`);
    await asUser(id(11), `insert into documents(firm_id,client_id,organizer_id,organizer_item_id,uploaded_by,storage_path,file_name) values ('${id(1)}','${id(20)}','${id(30)}','${id(41)}','${id(11)}','${path}','test.pdf')`);
    await asUser(id(11), `select submit_organizer('${id(30)}')`);
    await denied(id(11), `select save_organizer_response('${id(40)}','"Changed"')`, /no longer accepting/);
    await denied(id(11), `select submit_organizer('${id(30)}')`, /submittable state/);
    await denied(id(11), `insert into documents(firm_id,client_id,organizer_id,organizer_item_id,uploaded_by,storage_path,file_name) values ('${id(1)}','${id(20)}','${id(30)}','${id(41)}','${id(11)}','${path}','late.pdf')`, /no longer accepting/);
    assert.equal((await asUser(id(12), `select * from organizers`)).rows.length, 0);
    await assert.rejects(db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${id(99)}','evil@test', '{"firm_id":"${id(1)}","role":"firm_admin"}')`), /authorized invitation/);
    await db.exec(`insert into clients(id,firm_id,primary_contact_name,email,created_by) values ('${id(22)}','${id(1)}','Invited','invited@a.test','${id(10)}')`);
    await db.exec(`insert into auth.users(id,email,raw_user_meta_data,invited_at) values ('${id(13)}','invited@a.test','{"firm_id":"${id(1)}","role":"client","full_name":"Invited"}',now())`);
    assert.equal((await db.query(`select profile_id from clients where id='${id(22)}'`)).rows[0].profile_id, id(13));
    assert.equal((await asUser(id(11), `select * from profiles where id='${id(13)}'`)).rows.length, 0);
    assert.equal((await asUser(id(11), `select * from profiles where id='${id(10)}'`)).rows.length, 1);
    const documentId = (await db.query('select id from documents limit 1')).rows[0].id;
    await db.query("insert into document_extractions(document_id,status,fields) values ($1,'completed','{}')", [documentId]);
    await denied(id(10), "update document_extractions set fields='{}'", /permission denied/);
    await denied(id(10), "update document_extractions set status='failed'", /permission denied/);
    await asUser(id(10), `update document_extractions set reviewed_by='${id(10)}',reviewed_at=now()`);
    assert.equal((await asUser(id(11), 'select * from document_extractions')).rows.length, 0);
    await db.query("insert into organizer_item_suggestions(id,organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,$3,$4,'Source')", [id(70),id(40),documentId,JSON.stringify('Suggested')]);
    await denied(id(11), "update organizer_item_suggestions set suggested_value='null',status='accepted'", /permission denied/);
    await denied(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`, /no longer accepting/);
    await denied(id(12), `select resolve_organizer_suggestion('${id(70)}',true)`, /Not authorized/);
    await db.exec(`update organizers set status='sent' where id='${id(30)}'`);
    await asUser(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`);
    assert.equal((await db.query(`select value from organizer_responses where organizer_item_id='${id(40)}'`)).rows[0].value, 'Suggested');
    await denied(id(11), `select resolve_organizer_suggestion('${id(70)}',true)`, /already resolved/);
    await db.query("insert into organizer_item_suggestions(id,organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,$3,'123','Invalid text')", [id(71),id(40),documentId]);
    await denied(id(11), `select resolve_organizer_suggestion('${id(71)}',true)`, /Invalid answer/);
    assert.equal((await db.query(`select status from organizer_item_suggestions where id='${id(71)}'`)).rows[0].status, 'pending');
    await asUser(id(11), `select resolve_organizer_suggestion('${id(71)}',false)`);
    await db.exec(`insert into organizers(id,firm_id,client_id,tax_year,title,status,created_by) values ('${id(80)}','${id(2)}','${id(21)}',2025,'Other','sent','${id(12)}'); insert into organizer_items(id,organizer_id,prompt,response_type) values ('${id(81)}','${id(80)}','Other','text')`);
    await assert.rejects(db.query("insert into organizer_item_suggestions(organizer_item_id,document_id,suggested_value,based_on) values ($1,$2,'123','Bad source')", [id(81),documentId]), /same organizer/);
    await assert.rejects(db.exec(`update organizer_items set organizer_id='${id(80)}' where id='${id(40)}'`), /linked suggestions/);
    const hash = 'a'.repeat(64);
    await denied(id(11), `select reserve_otp_request('${hash}')`, /permission denied/);
    const reservations = await Promise.all([asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role'), asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role')]);
    assert.equal(reservations.filter(r=>r.rows[0].reserved).length, 1);
    await db.exec("update otp_request_log set requested_at=now()-interval '61 seconds'");
    assert.equal((await asUser(null, `select reserve_otp_request('${hash}') as reserved`, 'service_role')).rows[0].reserved, true);
    assert.equal((await db.query("select file_size_limit from storage.buckets where id='client-documents'")).rows[0].file_size_limit, 20971520);
    await denied(id(11), `select prepare_client_invitation('${id(20)}')`, /Not authorized/);
    await denied(id(10), `select prepare_client_invitation('${id(21)}')`, /Client not found/);
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(20)}') as mode`)).rows[0].mode,'signin');
    await db.exec(`alter table auth.users disable trigger on_auth_user_created;
      insert into auth.users(id,email) values ('${id(90)}','existing@a.test');
      alter table auth.users enable trigger on_auth_user_created;
      insert into clients(id,firm_id,primary_contact_name,email,created_by) values
      ('${id(91)}','${id(1)}','Existing','existing@a.test','${id(10)}'),
      ('${id(92)}','${id(1)}','New','new@a.test','${id(10)}'),
      ('${id(93)}','${id(1)}','Staff conflict','staff@a.test','${id(10)}'),
      ('${id(94)}','${id(1)}','Other firm','client@b.test','${id(10)}')`);
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(91)}') as mode`)).rows[0].mode,'signin');
    assert.equal((await db.query(`select profile_id from clients where id='${id(91)}'`)).rows[0].profile_id,id(90));
    assert.equal((await db.query(`select role from profiles where id='${id(90)}'`)).rows[0].role,'client');
    assert.equal((await asUser(id(10), `select prepare_client_invitation('${id(92)}') as mode`)).rows[0].mode,'invite');
    await denied(id(10), `select prepare_client_invitation('${id(93)}')`, /different access/);
    await denied(id(10), `select prepare_client_invitation('${id(94)}')`, /different access/);
    await db.exec(`update clients set status='archived' where id='${id(91)}'`);
    await denied(id(10), `select prepare_client_invitation('${id(91)}')`, /Restore this client/);
  } finally { await db.close(); }
});
