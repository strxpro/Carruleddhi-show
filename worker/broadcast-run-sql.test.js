import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('0050 DB-clock runs, frozen replay, duplicate/reordered commands and service-only privileges', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table site_settings(id boolean primary key,data jsonb not null);
      insert into site_settings values(true,'{"sponsors":[{"name":"Original","url":"","logo":"/assets/logo.png"}]}');
      create table registrations(id uuid primary key,first_name text,last_name text,town text,race_number integer,status text);
      create table participants(id uuid primary key,registration_id uuid references registrations(id),
        first_name text,last_name text,project_name text,category text,start_number integer,active boolean,image_path text);
      create function bump_stream_hearts(integer) returns integer language sql as 'select $1';
      create table voting_editions(id uuid primary key); create table voting_settings(id boolean primary key);
    `);
    for (const file of ['0047_broadcast_state.sql', '0048_participant_race_time.sql', '0050_broadcast_run_control.sql']) {
      const sql = await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8');
      await db.exec(sql);
      if (file.startsWith('0050')) await db.exec(sql);
    }
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    const rid = '33333333-3333-4333-8333-333333333333';
    for (const [id, n] of [[a, 1], [b, 2]]) {
      await db.query("insert into registrations values($1,'First','Last','Town',$2,'confirmed')", [id, n]);
      await db.query("insert into participants values($1,$1,'First','Last','Cart','art',$2,true,null,null,null)", [id, n]);
    }
    const command = async (action, payload = {}) => (await db.query(
      'select to_jsonb(broadcast_command($1,$2::jsonb)) state', [action, JSON.stringify(payload)])).rows[0].state;
    const snapshot = async () => (await db.query('select broadcast_snapshot() snapshot')).rows[0].snapshot;
    assert.equal((await snapshot()).state.run_status, 'IDLE');
    await assert.rejects(command('stop'), /RUN_NOT_RUNNING/);
    await assert.rejects(command('start', { id: rid }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    const start = await command('start', { id: a, runId: rid, elapsed_ms: 999, started_at: '1900-01-01' });
    assert.equal(start.current_participant_id, a);
    assert.equal(start.run_id, rid);
    assert.equal(start.elapsed_ms, 0);
    assert.equal(start.stopped_at, null);
    assert.ok(Date.parse(start.started_at) > Date.parse('2026-01-01'));
    assert.deepEqual(await command('on-air', { id: a }), start);
    await assert.rejects(db.query('update participants set race_time_ms=3 where id=$1', [a]), /RUN_ALREADY_RUNNING/);
    await assert.rejects(db.query('delete from participants where id=$1', [a]), /RUN_ALREADY_RUNNING/);
    await assert.rejects(command('start', { id: b }), /RUN_ALREADY_RUNNING/);
    await assert.rejects(command('stop', { runId: b }), /RUN_ID_MISMATCH/);
    for (const action of ['hide','show','clear','show-participant','show-sponsors','hide-sponsors']) {
      const state = await command(action);
      assert.equal(state.run_id, rid);
      assert.equal(state.started_at, start.started_at);
      assert.equal(state.run_status, 'RUNNING');
    }
    // Set only the embedded test DB clock anchor, never accept a browser duration.
    await db.exec("update broadcast_state set started_at=clock_timestamp()-interval '1.234 seconds'");
    const beforeFailedStop = (await snapshot()).state;
    await db.exec(`create function reject_test_time() returns trigger language plpgsql as $$
      begin raise exception 'TEST_TIME_WRITE_FAILED'; end $$;
      create trigger reject_test_time before update of race_time_ms on participants for each row execute function reject_test_time();`);
    await assert.rejects(command('stop', { runId: rid }), /TEST_TIME_WRITE_FAILED/);
    assert.deepEqual((await snapshot()).state, beforeFailedStop);
    await db.exec('drop trigger reject_test_time on participants; drop function reject_test_time()');
    const finish = await command('stop', { runId: rid });
    assert.equal(finish.run_status, 'FINISHED');
    assert.ok(finish.elapsed_ms >= 1234 && finish.elapsed_ms < 2000);
    assert.equal(finish.last_finished_elapsed_ms, finish.elapsed_ms);
    assert.equal(finish.last_finished_participant.raceTimeMs, finish.elapsed_ms);
    assert.equal(finish.last_finished_participant_id, a);
    assert.equal((await db.query('select race_time_ms from participants where id=$1', [a])).rows[0].race_time_ms, finish.elapsed_ms);
    assert.deepEqual(await command('stop'), finish);
    assert.deepEqual(await command('stop', { runId: rid }), finish);
    assert.deepEqual(await command('start', { id: a, runId: rid }), finish);
    await db.query("update participants set first_name='Edited',race_time_ms=42 where id=$1", [a]);
    await db.query("update registrations set town='Edited town' where id=$1", [a]);
    assert.deepEqual((await snapshot()).state.last_finished_participant, finish.last_finished_participant);
    await db.query("update participants set image_path='participants/original.png' where id=$1", [b]);
    await assert.rejects(command('start', { id: b }), /BROADCAST_PHOTO_SOURCE_CONFLICT/);
    const preparedPhoto = 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/prepared.png';
    const startB = await command('on-air', { id: b, sourcePath: 'participants/original.png', preparedPhoto });
    assert.equal(startB.participant.photo, preparedPhoto);
    assert.equal(startB.current_participant_id, b);
    assert.notEqual(startB.run_id, rid);
    assert.deepEqual(startB.last_finished_participant, finish.last_finished_participant);
    assert.deepEqual(await command('on-air', { id: a, mode: 'replay' }), startB);
    await assert.rejects(command('stop', { runId: rid }), /RUN_ID_MISMATCH/);
    assert.equal((await snapshot()).state.run_status, 'RUNNING');
    const finishB = await command('stop');
    assert.equal(finishB.last_finished_participant_id, b);
    assert.deepEqual(await command('stop'), finishB);
    await command('participant-photo', { id: b, photo: 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/later-crop.png' });
    assert.equal((await snapshot()).state.last_finished_participant.photo, preparedPhoto);
    const again = await command('start', { id: a });
    await db.query("update registrations set status='withdrawn' where id=$1", [a]);
    assert.equal((await snapshot()).state.participant_visible, false);
    assert.equal((await snapshot()).state.run_id, again.run_id);
    assert.equal((await command('stop', { runId: again.run_id })).last_finished_participant_id, a);
    // Restore B as the last completed participant for the remaining assertions.
    await command('start', { id: b });
    const finalB = await command('stop');
    assert.deepEqual((await command('clear')).last_finished_participant, finalB.last_finished_participant);
    // Existing sponsor actions still use canonical settings and CAS, not another authority.
    const sponsors = (await db.query('select data from site_settings')).rows[0].data.sponsors;
    await command('sponsor-save', { sponsor: { ...sponsors[0], name: 'Changed' }, expectedSponsor: sponsors[0] });
    await assert.rejects(command('sponsor-save', { sponsor: sponsors[0], expectedSponsor: sponsors[0] }), /BROADCAST_SPONSOR_CONFLICT/);
    assert.equal((await snapshot()).state.sponsors[0].name, 'Changed');
    assert.deepEqual((await snapshot()).state.last_finished_participant, finalB.last_finished_participant);
    const populated = (await snapshot()).state;
    await db.exec(await readFile(new URL('../supabase/migrations/0050_broadcast_run_control.sql', import.meta.url), 'utf8'));
    assert.deepEqual((await snapshot()).state, populated);
    assert.ok(Date.parse((await snapshot()).serverNow) >= Date.parse(finishB.stopped_at));
    await db.exec('set role anon');
    await db.query('select * from broadcast_state');
    await assert.rejects(db.query("select broadcast_command('start','{}')"), /permission denied/);
    await assert.rejects(db.query('select broadcast_snapshot()'), /permission denied/);
    await assert.rejects(db.query("update broadcast_state set elapsed_ms=1"), /permission denied/);
    await db.exec('reset role; set role service_role');
    await assert.rejects(db.query("select broadcast_legacy_command_0048('on-air','{}')"), /permission denied/);
    await db.query('select broadcast_snapshot()');
    await db.query("select broadcast_command('show','{}')");
  } finally { await db.close(); }
});
