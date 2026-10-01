import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('0048 duration, replay, archive/prizes, privacy and repeat-safe migration', async () => {
  const db = new PGlite();
  const id = '11111111-1111-4111-8111-111111111111';
  const registrationId = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table site_settings(id boolean primary key,data jsonb not null);
      insert into site_settings values(true,'{"sponsors":[]}');
      create table registrations(id uuid primary key,town text,race_number integer,status text,email text);
      create table participants(id uuid primary key,registration_id uuid references registrations(id),
        first_name text,last_name text,project_name text,category text,start_number integer,active boolean,image_path text);
      create function bump_stream_hearts(integer) returns integer language sql security definer as 'select $1';
      create table voting_settings(id boolean primary key,status text,race_starts_at timestamptz,
        voting_started_at timestamptz,voting_ends_at timestamptz,duration_minutes integer);
      insert into voting_settings values(true,'open',now(),now(),now()+interval '1 day',30);
      create table voting_editions(id uuid primary key default gen_random_uuid(),edition_key text unique,event_name text,
        event_date timestamptz,event_location text,status text,results jsonb default '[]',prizes jsonb default '[]',
        participant_count integer,vote_count integer,archived_at timestamptz);
      insert into voting_editions(edition_key,event_name,event_date,event_location,status)
        values('2026','Race','2026-08-01','Town','active');
      create table votes(id uuid primary key default gen_random_uuid(),participant_id uuid references participants(id),
        category text,score integer,notify_results boolean,voter_name text,voter_email text,voter_locale text,result_notified_at timestamptz);
      create table voting_result_notifications(edition_id uuid,vote_id uuid,voter_name text,voter_email text,voter_locale text,
        unique(edition_id,vote_id));
      create table prize_winners(edition_id uuid references voting_editions(id),participant_id uuid references participants(id) on delete set null,
        prize_key text,winner_label text,note text);
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/0047_broadcast_state.sql', import.meta.url), 'utf8'));
    const migration = await readFile(new URL('../supabase/migrations/0048_participant_race_time.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const command = async (action, payload = {}) => (await db.query(
      'select to_jsonb(broadcast_command($1,$2::jsonb)) state', [action, JSON.stringify(payload)])).rows[0].state;
    const snapshot = async () => (await db.query('select * from broadcast_state')).rows[0];
    await db.query('insert into registrations values($1,$2,7,$3,$4)', [registrationId, 'Town', 'confirmed', 'private@example.org']);
    await db.query(`insert into participants(id,registration_id,first_name,last_name,project_name,category,start_number,active)
      values($1,$2,'First','Last','Cart','art',7,true)`, [id, registrationId]);
    assert.equal((await command('on-air', { id })).participant.raceTimeMs, null);
    assert.equal((await snapshot()).participant_mode, 'live');
    for (const value of [0, 12345, 2147483647, null]) {
      const before = await snapshot();
      await db.query('update participants set race_time_ms=$1 where id=$2', [value, id]);
      const after = await snapshot();
      assert.equal(after.participant.raceTimeMs, value);
      assert.ok(after.revision > before.revision);
    }
    for (const value of [-1, 2147483648]) {
      await assert.rejects(db.query('update participants set race_time_ms=$1 where id=$2', [value, id]));
    }
    await db.query('update participants set race_time_ms=98765 where id=$1', [id]);
    const live = await command('on-air', { id, mode: 'live' });
    const replay = await command('on-air', { id, mode: 'replay' });
    assert.equal(replay.participant.id, live.participant.id);
    assert.equal(replay.participant_mode, 'replay');
    assert.ok(replay.revision > live.revision);
    assert.equal(replay.participant.raceTimeMs, 98765);
    for (const mode of [null, true, '', 'LIVE', 'unknown', 1, {}]) {
      await assert.rejects(command('on-air', { id, mode }), /BROADCAST_BAD_MODE/);
    }
    await command('sponsors-toggle', { enabled: true });
    await command('sponsor-save', { sponsor: { name: 'Sponsor', url: '', logo: '/assets/logo.png' } });
    assert.equal((await snapshot()).participant_mode, 'replay');
    const photo = 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/crop.png';
    await command('participant-photo', { id, photo });
    assert.equal((await snapshot()).participant_mode, 'replay');
    assert.equal((await snapshot()).participant.photo, photo);
    assert.equal((await command('hide')).participant_mode, 'replay');
    assert.equal((await snapshot()).participant_visible, false);
    assert.equal((await snapshot()).sponsors_enabled, true);
    await db.exec(migration);
    assert.equal((await snapshot()).participant_mode, 'replay');
    assert.equal((await snapshot()).participant.raceTimeMs, 98765);
    const defaultLive = await command('on-air', { id });
    assert.equal(defaultLive.participant_mode, 'live');
    assert.equal(defaultLive.sponsors_enabled, true);
    await command('on-air', { id, mode: 'replay' });
    const cleared = await command('clear');
    assert.equal(cleared.participant, null);
    assert.equal(cleared.participant_mode, 'live');
    assert.equal(cleared.sponsors_enabled, true);
    await command('on-air', { id, mode: 'replay' });
    await db.exec('set role anon');
    assert.doesNotMatch(JSON.stringify((await db.query('select * from broadcast_state')).rows), /registration|private@example|image_path/);
    await assert.rejects(db.query('select race_time_ms from participants'), /permission denied/);
    await assert.rejects(db.query("select rollover_voting_edition('No','2027-08-01','Town')"), /permission denied/);
    await assert.rejects(db.query('select broadcast_participant($1)', [id]), /permission denied/);
    await db.exec('reset role');
    await db.query(`insert into votes(participant_id,category,score,notify_results,voter_name,voter_email,voter_locale)
      values($1,'public-choice',8,true,'Private','voter@example.org','it'),($1,'public-choice',10,false,null,null,null)`, [id]);
    await db.query(`insert into prize_winners select id,$1,'prize-2',null,'Jury note' from voting_editions where edition_key='2026'`, [id]);
    const rollover = async (year, name = 'Race') => (await db.query(
      'select rollover_voting_edition($1,$2::timestamptz,$3) result', [name, `${year}-08-01`, 'Town'])).rows[0].result;
    await assert.rejects(rollover('2027', ''), /INVALID_EDITION/);
    await assert.rejects(rollover('2027'), /VOTING_EDITION_NOT_CLOSED/);
    await db.exec("update voting_editions set status='archived' where edition_key='2026'");
    await assert.rejects(rollover('2027'), /ACTIVE_EDITION_MISSING/);
    await db.exec("update voting_editions set status='active' where edition_key='2026'");
    assert.equal((await db.query('select count(*) n from participants')).rows[0].n, 1);
    const same = await rollover('2026');
    assert.equal(same.staleVotes, 2);
    assert.equal(same.rolledOver, false);
    assert.equal((await db.query('select race_time_ms from participants')).rows[0].race_time_ms, 98765);
    await db.exec("update voting_settings set status='closed'");
    const result = await rollover('2027');
    assert.equal(result.prizeCount, 1);
    assert.equal(result.voteCount, 2);
    const archived = (await db.query("select * from voting_editions where edition_key='2026'")).rows[0];
    assert.equal(archived.results[0].raceTimeMs, 98765);
    assert.equal(archived.results[0].totalScore, 18);
    assert.equal(archived.results[0].averageScore, 9);
    assert.equal(archived.results[0].place, 1);
    assert.deepEqual(archived.prizes, [{ prizeKey: 'prize-2', startNumber: 7, projectName: 'Cart', riderName: 'First Last', note: 'Jury note' }]);
    assert.doesNotMatch(JSON.stringify(archived), /private@example|voter@example|registration_id/);
    assert.equal((await db.query('select count(*) n from participants')).rows[0].n, 0);
    assert.equal((await db.query('select count(*) n from votes')).rows[0].n, 0);
    assert.equal((await db.query('select count(*) n from voting_result_notifications')).rows[0].n, 1);
    assert.equal((await snapshot()).participant, null);
    await assert.rejects(rollover('2026'), /EDITION_ALREADY_EXISTS/);
    await db.exec(migration);
    assert.deepEqual((await db.query("select results from voting_editions where edition_key='2026'")).rows[0].results, archived.results);
  } finally { await db.close(); }
});
