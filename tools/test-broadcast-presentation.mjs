import test from 'node:test';
import assert from 'node:assert/strict';
import { sponsorRoster } from '../src/obs/sponsor-roster.ts';
import { SponsorQueue } from '../src/obs/sponsor-queue.ts';
import { replayParticipant } from '../src/obs/replay-state.ts';

const sponsor = (id, order) => ({ id, name: id, logo: '', url: '', active: true, order, tier: 'partner' });
test('0, 1, 3 and 10 real sponsors progressively replace clearly branded house cards', () => {
  for (const count of [0, 1, 2, 3, 10]) {
    const input = Array.from({ length: count }, (_, i) => sponsor(`real-${i}`, i));
    const original = structuredClone(input);
    const roster = sponsorRoster(input);
    assert.equal(roster.filter(s => s.id.startsWith('house:')).length, Math.max(0, 3 - count));
    assert.equal(roster.filter(s => !s.id.startsWith('house:')).length, count);
    assert.deepEqual(input, original, 'presentation must not insert house sponsors into persistent data');
    const queue = new SponsorQueue(944, 236, 48);
    queue.update(roster);
    const seen = new Set();
    for (let frame = 0; frame < 600 * 60; frame++) {
      queue.advance(1 / 60);
      for (const slot of queue.slots) { if (slot.x < queue.width) seen.add(slot.sponsor.id); }
      assert.ok(queue.slots[0].x <= .001, `leading gap ${queue.slots[0].x}`);
      assert.ok(queue.slots.at(-1).x + queue.pitch >= queue.width - .001);
      for (let i = 1; i < queue.slots.length; i++) assert.ok(Math.abs(queue.slots[i].x - queue.slots[i - 1].x - queue.pitch) < .001);
    }
    assert.equal(seen.size, roster.length, 'every sponsor appears during a continuous cycle');
    assert.ok(queue.slots.length <= 6);
  }
});

test('adding real sponsors preserves current tile coordinates while house cards drain', () => {
  const queue = new SponsorQueue(944, 236, 48);
  queue.update(sponsorRoster([]));
  queue.advance(.03);
  const visible = queue.slots.filter(s => s.x < queue.width).map(s => ({ key: s.key, x: s.x, id: s.sponsor.id }));
  queue.update(sponsorRoster([sponsor('a', 0), sponsor('b', 1), sponsor('c', 2)]));
  for (const before of visible) {
    const now = queue.slots.find(s => s.key === before.key);
    assert.equal(now.x, before.x); assert.equal(now.sponsor.id, before.id);
  }
  for (let i = 0; i < 40 * 60; i++) queue.advance(1 / 60);
  assert.ok(queue.slots.every(s => !s.sponsor.id.startsWith('house:')));
  queue.update(sponsorRoster([]));
  for (let i = 0; i < 40 * 60; i++) queue.advance(1 / 60);
  assert.ok(queue.slots.every(s => s.sponsor.id.startsWith('house:')));
});

test('replay never falls back to current participant and uses only the frozen final result', () => {
  const current = { id: 'b', firstName: 'Current', raceTimeMs: 999 };
  assert.equal(replayParticipant({ participant: current }), null);
  const finished = { id: 'a', firstName: 'Finished', raceTimeMs: 1234 };
  const state = { participant: current, participant_visible: false, run_status: 'RUNNING',
    last_finished_participant_id: 'a', last_finished_participant: finished, last_finished_elapsed_ms: 1234 };
  assert.equal(replayParticipant(state).id, 'a');
  assert.equal(replayParticipant(state).raceTimeMs, 1234);
  assert.equal(replayParticipant({ ...state, last_finished_elapsed_ms: 0 }).raceTimeMs, 0);
  assert.equal(replayParticipant({ ...state, last_finished_participant_id: 'b' }), null);
  assert.equal(replayParticipant({ ...state, last_finished_elapsed_ms: null }), null);
});
