import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('0049 locks/checks/spends atomically, rolls back failed writes, rejects replay, and restricts RPC access', async () => {
  const db = new PGlite();
  const id = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create table registrations(id uuid primary key,email text,first_name text,last_name text,
        status text,is_minor boolean,phone text check(phone <> 'FAIL'),address text,town text,
        cart_name text,team_name text,cart_notes text,category text,wants_print boolean,self_updated_at timestamptz);
      create table verification_codes(id uuid primary key default gen_random_uuid(),email text,purpose text,
        code_hash text,entry_id uuid,created_at timestamptz default clock_timestamp(),
        expires_at timestamptz default now()+interval '10 minutes',attempts integer default 0,consumed_at timestamptz);
      create table reminder_subscribers(email text,status text);
      insert into registrations(id,email,first_name,last_name,status,is_minor,phone,category,wants_print)
        values('${id}','rider@example.org','Legal','Identity','confirmed',false,'old','classic',true),
        ('${other}','rider@example.org','Other','Identity','confirmed',false,'other','art',true);
      insert into reminder_subscribers values('rider@example.org','active');
    `);
    const migration = await readFile(new URL('../supabase/migrations/0049_atomic_entry_manage.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    const issue = async (purpose = 'edit-entry', hash = 'correct') => (await db.query(
      'insert into verification_codes(email,purpose,code_hash,entry_id) values($1,$2,$3,$4) returning id',
      ['rider@example.org', purpose, hash, id])).rows[0].id;
    const check = async (hash = 'correct', entryId = id) => (await db.query(
      'select verification_code_check($1,$2,$3,$4) result', ['rider@example.org', 'edit-entry', hash, entryId])).rows[0].result;
    const command = async (action, patch = {}, hash = 'correct', entryId = id) => (await db.query(
      'select entry_manage_with_code($1,$2,$3,$4,$5::jsonb) result',
      ['rider@example.org', hash, entryId, action, JSON.stringify(patch)])).rows[0].result;
    const registration = async () => (await db.query('select * from registrations where id=$1', [id])).rows[0];
    const code = async (codeId) => (await db.query('select * from verification_codes where id=$1', [codeId])).rows[0];

    const first = await issue();
    assert.equal((await check()).ok, true);
    assert.equal((await code(first)).consumed_at, null, 'view/check does not consume');
    assert.equal((await check('correct', other)).code, 'ENTRY_NO_CODE', 'entry binding');
    assert.equal((await command('withdraw')).code, 'ENTRY_NO_CODE', 'purpose binding');
    assert.equal((await command('print', { wants_print: false })).ok, true);
    assert.equal((await registration()).wants_print, false);
    assert.equal((await code(first)).consumed_at, null);
    assert.equal((await command('print', { wants_print: true })).ok, true);
    assert.equal((await command('print', { wants_print: 'false' })).code, 'ENTRY_BAD_PRINT');

    await assert.rejects(command('update', { phone: 'FAIL' }), /check constraint/);
    assert.equal((await code(first)).consumed_at, null, 'failed write did not burn code');
    assert.equal((await registration()).phone, 'old');
    const competing = await Promise.all([
      command('update', { phone: null, wants_print: false }), command('update', { phone: 'second' })
    ]);
    assert.equal(competing.filter((r) => r.ok).length, 1);
    assert.equal(competing.filter((r) => r.code === 'ENTRY_NO_CODE').length, 1);
    assert.equal((await registration()).phone, null);
    assert.equal((await registration()).wants_print, false);
    assert.ok((await code(first)).consumed_at);
    assert.equal((await registration()).first_name, 'Legal');

    const attempts = await issue();
    const wrong = await Promise.all(Array.from({ length: 5 }, () => check('wrong')));
    assert.deepEqual(wrong.map((r) => r.left), [4, 3, 2, 1, 0]);
    assert.equal((await check()).code, 'ENTRY_TOO_MANY_TRIES');
    assert.equal((await code(attempts)).attempts, 5);
    const expired = await issue();
    await db.query("update verification_codes set expires_at=now()-interval '1 minute' where id=$1", [expired]);
    assert.equal((await check()).code, 'ENTRY_CODE_EXPIRED');

    const next = await issue();
    for (const forbidden of ['first_name', 'last_name', 'birth_date', 'email', 'consent', 'status']) {
      assert.equal((await command('update', { [forbidden]: 'no' })).code, 'ENTRY_BAD_FIELD');
    }
    assert.equal((await code(next)).consumed_at, null);
    await db.query('update registrations set is_minor=true where id=$1', [id]);
    assert.equal((await command('update', { phone: 'new' })).code, 'ENTRY_MINOR_ORGANISER');
    await db.query("update registrations set is_minor=false,status='withdrawn' where id=$1", [id]);
    assert.equal((await command('print', { wants_print: false })).code, 'ENTRY_WITHDRAWN');
    await db.query("update registrations set status='confirmed' where id=$1", [id]);

    const cancellation = await issue('cancel-entry');
    await db.exec(`create function reject_reminder() returns trigger language plpgsql as $$begin raise exception 'reminder write failed'; end$$;
      create trigger reject_reminder before update on reminder_subscribers for each row execute function reject_reminder();`);
    await assert.rejects(command('withdraw'), /reminder write failed/);
    assert.equal((await registration()).status, 'confirmed');
    assert.equal((await code(cancellation)).consumed_at, null);
    await db.exec('drop trigger reject_reminder on reminder_subscribers');
    assert.equal((await command('withdraw')).ok, true);
    assert.equal((await registration()).status, 'withdrawn');
    assert.equal((await db.query('select status from reminder_subscribers')).rows[0].status, 'unsubscribed');
    assert.ok((await code(cancellation)).consumed_at);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(check(), /permission denied/);
      await assert.rejects(command('update', { phone: 'no' }), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    assert.equal((await check()).ok, true);
    await db.exec('reset role');
  } finally { await db.close(); }
});
