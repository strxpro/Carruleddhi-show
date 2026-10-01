import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Embedded PostgreSQL only: no production DB, credentials or old migrations.
test('Broadcast migration executes twice and enforces SQL behavior and privileges', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table public.site_settings(id boolean primary key default true,data jsonb not null);
      insert into public.site_settings values(true,'{"sponsors":[{"name":"Original","url":"https://example.org","logo":"/assets/logo.png"}],"showWall":true}');
      create table public.registrations(id uuid primary key,first_name text,last_name text,town text,race_number integer,status text);
      create table public.participants(id uuid primary key,registration_id uuid references public.registrations(id) on delete set null,
        first_name text,last_name text,project_name text,category text,start_number integer,active boolean,image_path text);
      create function public.bump_stream_hearts(integer) returns integer language sql security definer as 'select $1';
    `);
    const sql = await readFile(new URL('../supabase/migrations/0047_broadcast_state.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    const command = async (action, payload = {}) => (await db.query(
      'select to_jsonb(public.broadcast_command($1,$2::jsonb)) as state', [action, JSON.stringify(payload)])).rows[0].state;
    const snapshot = async () => (await db.query("select * from public.broadcast_state where id='main'")).rows[0];
    const id = '11111111-1111-4111-8111-111111111111';
    const rId = '22222222-2222-4222-8222-222222222222';
    await db.query('insert into registrations values ($1,$2,$3,$4,7,$5)', [rId, 'Name', 'Surname', 'Town', 'confirmed']);
    await db.query('insert into participants(id,registration_id,first_name,last_name,project_name,category,start_number,active) values ($1,$2,$3,$4,$5,$6,7,true)', [id, rId, 'Name', 'Surname', 'Cart', 'art']);
    const live = await command('on-air', { id });
    assert.equal(live.participant.city, 'Town');
    assert.equal(live.participant_visible, true);
    assert.deepEqual(Object.keys(live.participant).sort(), ['id','firstName','lastName','city','startNumber','category','projectName','photo'].sort());
    const switched = await command('sponsors-toggle', { enabled: true });
    assert.equal(switched.participant.id, id);
    assert.ok(switched.revision > live.revision);
    const hidden = await command('hide');
    assert.equal(hidden.participant.id, id);
    assert.equal(hidden.participant_visible, false);
    assert.equal(hidden.sponsors_enabled, true);
    await command('on-air', { id });
    await db.query("update registrations set town='New town' where id=$1", [rId]);
    assert.equal((await snapshot()).participant.city, 'New town');
    await db.query("update participants set project_name='Edited cart' where id=$1", [id]);
    assert.equal((await snapshot()).participant.projectName, 'Edited cart');
    await db.query("update registrations set status='withdrawn',race_number=null where id=$1", [rId]);
    assert.equal((await snapshot()).participant, null);
    assert.equal((await snapshot()).participant_visible, false);
    assert.equal((await db.query('select public.broadcast_photo_source($1) source',[id])).rows[0].source,null);
    await assert.rejects(command('on-air', { id }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    assert.equal((await db.query('select active from participants where id=$1', [id])).rows[0].active, true);
    const replacementRegistration = '33333333-3333-4333-8333-333333333333';
    const replacementParticipant = '44444444-4444-4444-8444-444444444444';
    await db.query('insert into registrations values ($1,$2,$3,$4,7,$5)', [replacementRegistration, 'Same', 'Number', 'New town', 'confirmed']);
    await db.query('insert into participants(id,registration_id,first_name,last_name,project_name,category,start_number,active) values ($1,$2,$3,$4,$5,$6,7,true)', [replacementParticipant, replacementRegistration, 'Same', 'Number', 'Replacement', 'art']);
    await assert.rejects(command('on-air', { id }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    assert.equal((await command('on-air', { id: replacementParticipant })).participant.id, replacementParticipant);
    assert.equal((await command('hide')).participant.id, replacementParticipant);
    const restored = await command('on-air', { id: replacementParticipant });
    assert.equal(restored.participant_visible, true);
    assert.equal(restored.sponsors_enabled, true);
    assert.doesNotMatch(JSON.stringify(restored), /registrationId|registration_id/);
    await assert.rejects(command('on-air', { id: '55555555-5555-4555-8555-555555555555' }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    await db.query('delete from participants where id=$1', [replacementParticipant]);
    await db.query('delete from registrations where id=$1', [replacementRegistration]);
    await db.query("update registrations set status='new',race_number=7 where id=$1", [rId]);
    await assert.rejects(command('on-air', { id }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    await db.query("update registrations set status='confirmed',race_number=8 where id=$1", [rId]);
    await assert.rejects(command('on-air', { id }), /BROADCAST_PARTICIPANT_INELIGIBLE/);
    await db.query("update registrations set race_number=7 where id=$1", [rId]);
    await db.query("update participants set image_path='participants/original.png' where id=$1", [id]);
    const source=(await db.query('select public.broadcast_photo_source($1) source',[id])).rows[0].source;
    assert.deepEqual(source,{id,photo:'',imagePath:'participants/original.png'});
    const beforePreparation=await snapshot();
    await assert.rejects(command('on-air',{id,sourcePath:source.imagePath}),/BROADCAST_PHOTO_PREPARATION_REQUIRED/);
    assert.deepEqual(await snapshot(),beforePreparation);
    const copied='https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/copied.png';
    await assert.rejects(command('on-air',{id,sourcePath:'participants/stale.png',preparedPhoto:copied}),/BROADCAST_PHOTO_SOURCE_CONFLICT/);
    assert.deepEqual(await snapshot(),beforePreparation);
    const prepared=await command('on-air',{id,sourcePath:source.imagePath,preparedPhoto:copied});
    assert.equal(prepared.participant.photo,copied);
    assert.equal(prepared.participant_visible,true);
    assert.equal((await command('on-air',{id})).participant.photo,copied);
    await command('participant-photo', { id, photo: 'https://example.supabase.co/storage/v1/object/public/broadcast-assets/participants/prepared.png' });
    assert.match((await command('on-air', { id })).participant.photo, /prepared.png$/);
    assert.match((await command('on-air',{id,sourcePath:source.imagePath,preparedPhoto:copied})).participant.photo,/prepared.png$/);
    await assert.rejects(command('participant-photo', { id, photo: 'https://private.example/raw.jpg' }), /BROADCAST_BAD_PHOTO/);
    const beforeSponsors = (await snapshot()).sponsors;
    await command('sponsor-save', { sponsor: { name:'Second',logo:'sponsors/private.png',url:'',active:false,tier:'gold' } });
    let after = await snapshot();
    const secondId=after.sponsors[1].id;
    assert.equal(after.sponsors[1].logo, '');
    assert.equal(after.sponsors[1].active, false);
    await command('asset', { path:'sponsors/private.png',url:'https://example.supabase.co/storage/v1/object/public/broadcast-assets/sponsors/prepared.png' });
    assert.match((await snapshot()).sponsors[1].logo, /prepared.png$/);
    await command('sponsor-order', { ids:[secondId,beforeSponsors[0].id] });
    assert.equal((await snapshot()).sponsors[0].id, secondId);
    assert.equal((await snapshot()).sponsors[0].order, 0);
    await assert.rejects(command('sponsor-order', { ids:[secondId,secondId] }), /BROADCAST_BAD_ORDER/);
    await command('settings-patch', { patch:{showWall:false} });
    assert.equal((await snapshot()).sponsors[0].id, secondId);
    await assert.rejects(command('settings-patch', { patch:{sponsors:[]},expectedSponsors:beforeSponsors }), /BROADCAST_SETTINGS_CONFLICT/);
    // Even a settings editor sending only editable fields must supply its original full baseline.
    const canonical = (await db.query('select data from site_settings')).rows[0].data.sponsors;
    await command('settings-patch', { patch:{sponsors:canonical.map(({name,url,logo}) => ({name,url,logo}))},expectedSponsors:canonical.map(s=>({...s,logoUrl:'ignored-preview'})) });
    assert.equal((await snapshot()).sponsors[0].id, secondId);
    assert.equal((await snapshot()).sponsors[0].active, false);
    assert.equal((await snapshot()).sponsors[0].tier, 'gold');
    await command('sponsor-save',{sponsor:{...canonical[0],active:true},expectedSponsor:canonical[0]});
    const originals=(await db.query('select data from site_settings')).rows[0].data.sponsors;
    const original=originals[0];
    await assert.rejects(command('settings-patch',{patch:{sponsors:[]}}),/BROADCAST_SETTINGS_CONFLICT/);
    await assert.rejects(command('sponsor-save',{sponsor:{...original,name:'Missing baseline'}}),/BROADCAST_SPONSOR_CONFLICT/);
    const {id:ignoredId,...newSponsor}=original;
    await assert.rejects(command('sponsor-save',{sponsor:newSponsor,expectedSponsor:original}),/BROADCAST_SPONSOR_CONFLICT/);
    // An active-only change must reject a stale draft that would reactivate it.
    await command('sponsor-save',{sponsor:{...original,active:false},expectedSponsor:{...original,logoUrl:'ignored-preview'}});
    let protectedState=await snapshot();
    await assert.rejects(command('settings-patch',{patch:{sponsors:originals},expectedSponsors:originals}),/BROADCAST_SETTINGS_CONFLICT/);
    await assert.rejects(command('sponsor-save',{sponsor:{...original,name:'Stale draft'},expectedSponsor:original}),/BROADCAST_SPONSOR_CONFLICT/);
    assert.deepEqual(await snapshot(),protectedState);
    await command('settings-patch',{patch:{showWall:true}});
    assert.equal((await snapshot()).sponsors[0].active,false);
    assert.equal((await snapshot()).sponsors[0].name,original.name);
    const activeBaseline=(await db.query('select data from site_settings')).rows[0].data.sponsors;
    await command('sponsor-save',{sponsor:{...activeBaseline[0],name:'Other editor'},expectedSponsor:activeBaseline[0]});
    protectedState=await snapshot();
    await assert.rejects(command('sponsor-save',{sponsor:{...activeBaseline[0],tier:'Stale name draft'},expectedSponsor:activeBaseline[0]}),/BROADCAST_SPONSOR_CONFLICT/);
    await assert.rejects(command('settings-patch',{patch:{sponsors:activeBaseline},expectedSponsors:activeBaseline}),/BROADCAST_SETTINGS_CONFLICT/);
    assert.deepEqual(await snapshot(),protectedState);
    const afterEdit=(await db.query('select data from site_settings')).rows[0].data.sponsors;
    await command('sponsor-order',{ids:[beforeSponsors[0].id,secondId]});
    protectedState=await snapshot();
    await assert.rejects(command('sponsor-save',{sponsor:{...afterEdit[0],name:'Stale order draft'},expectedSponsor:afterEdit[0]}),/BROADCAST_SPONSOR_CONFLICT/);
    await assert.rejects(command('settings-patch',{patch:{sponsors:afterEdit},expectedSponsors:afterEdit}),/BROADCAST_SETTINGS_CONFLICT/);
    assert.deepEqual(await snapshot(),protectedState);
    // A matching Settings baseline can still perform an intentional full-list change.
    const afterOrder=(await db.query('select data from site_settings')).rows[0].data.sponsors;
    await command('settings-patch',{patch:{sponsors:afterOrder.map(s=>s.id===secondId?{...s,active:false}:s)},expectedSponsors:afterOrder});
    const beforeDelete=(await db.query('select data from site_settings')).rows[0].data.sponsors;
    const deletedDraft=beforeDelete.find(s=>s.id===secondId);
    await command('sponsor-delete', { id:secondId });
    protectedState=await snapshot();
    await assert.rejects(command('sponsor-save',{sponsor:{...deletedDraft,name:'Resurrection'},expectedSponsor:deletedDraft}),/BROADCAST_SPONSOR_CONFLICT/);
    await assert.rejects(command('settings-patch',{patch:{sponsors:beforeDelete},expectedSponsors:beforeDelete}),/BROADCAST_SETTINGS_CONFLICT/);
    assert.deepEqual(await snapshot(),protectedState);
    assert.equal((await snapshot()).sponsors.length, 1);
    await assert.rejects(command('sponsor-delete', {}), /BROADCAST_BAD_ID/);
    assert.equal((await snapshot()).sponsors.length, 1);
    await command('clear');
    assert.equal((await snapshot()).participant, null);
    const privileges = (await db.query(`select
      has_table_privilege('anon','public.broadcast_state','SELECT') as public_read,
      has_table_privilege('anon','public.broadcast_state','UPDATE') as public_write,
      has_table_privilege('service_role','public.broadcast_state','UPDATE') as direct_write,
      has_function_privilege('anon','public.broadcast_command(text,jsonb)','EXECUTE') as public_rpc,
      has_function_privilege('service_role','public.broadcast_command(text,jsonb)','EXECUTE') as service_rpc,
      has_function_privilege('anon','public.bump_stream_hearts(integer)','EXECUTE') as public_hearts,
      has_table_privilege('anon','public.registrations','SELECT') as private_read`)).rows[0];
    assert.deepEqual(privileges, { public_read:true,public_write:false,direct_write:false,public_rpc:false,service_rpc:true,public_hearts:false,private_read:false });
    assert.equal((await db.query("select count(*)::integer n from pg_publication_tables where pubname='supabase_realtime' and tablename='broadcast_state'")).rows[0].n, 1);
    await db.exec('set role anon');
    assert.equal((await db.query('select count(*)::integer n from public.broadcast_state')).rows[0].n, 1);
    await assert.rejects(db.query('select * from public.registrations'), /permission denied/);
    await assert.rejects(db.query("update public.broadcast_state set sponsors_enabled=true where id='main'"), /permission denied/);
    await assert.rejects(db.query("select public.broadcast_command('clear','{}')"), /permission denied/);
    await assert.rejects(db.query('select public.broadcast_photo_source($1)',[id]), /permission denied/);
    await db.exec('reset role');
  } finally { await db.close(); }
});
