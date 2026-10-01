import test from 'node:test';
import assert from 'node:assert/strict';
import { SponsorQueue } from '../src/obs/sponsor-queue.ts';

const sponsor = (id, order = 0) => ({ id, order, active: true, name: id, logo: '', tier: '', url: '' });
const advance = (queue, seconds) => { for (let i = 0; i < seconds * 60; i++) queue.advance(1 / 60); };
const continuous = (queue) => {
  assert.ok(queue.slots[0].x <= 0);
  assert.ok(queue.slots.at(-1).x + queue.pitch >= queue.width);
  for (let i = 1; i < queue.slots.length; i++) assert.ok(Math.abs(queue.slots[i].x - queue.slots[i - 1].x - queue.pitch) < .001);
};

test('one or many sponsors fill the belt continuously for ten minutes', () => {
  for (const count of [1, 2, 9]) {
    const queue = new SponsorQueue(1496);
    queue.update(Array.from({ length: count }, (_, i) => sponsor(String(i), i)));
    for (let second = 0; second < 600; second++) { advance(queue, 1); continuous(queue); }
    assert.ok(queue.slots.length <= 8, 'bounded DOM size');
  }
});

test('insert, reorder and edit do not move or replace visible slots', () => {
  const queue = new SponsorQueue(1496);
  queue.update([sponsor('a'), sponsor('b', 1)]);
  advance(queue, 2);
  const before = queue.slots.filter(s => s.x < queue.width).map(s => ({ key: s.key, x: s.x, name: s.sponsor.name }));
  queue.update([sponsor('c'), { ...sponsor('b', 1), name: 'Edited' }, sponsor('a', 2)]);
  for (const slot of before) {
    const after = queue.slots.find(s => s.key === slot.key);
    assert.equal(after.x, slot.x);
    assert.equal(after.sponsor.name, slot.name);
  }
  advance(queue, 40);
  assert.ok(queue.slots.some(s => s.sponsor.id === 'c'));
  assert.ok(queue.slots.some(s => s.sponsor.name === 'Edited'));
  continuous(queue);
});

test('deactivation drains naturally and never queues the removed sponsor again', () => {
  const queue = new SponsorQueue(1496);
  queue.update([sponsor('a'), sponsor('b', 1)]);
  const keys = queue.slots.map(s => s.key);
  queue.update([sponsor('a')]);
  for (const slot of queue.slots.filter(s => !keys.includes(s.key))) assert.equal(slot.sponsor.id, 'a');
  advance(queue, 40);
  assert.ok(queue.slots.every(s => s.sponsor.id === 'a'));
  continuous(queue);
  queue.update([]);
  advance(queue, 40);
  assert.equal(queue.slots.length, 0);
});

test('resume after OBS suspension does not jump across wall time', () => {
  const queue = new SponsorQueue(1496);
  queue.update([sponsor('a')]);
  queue.advance(300);
  assert.ok(Math.abs(queue.slots[0].x) <= queue.speed * .05);
});

test('compact right-side belt keeps fixed spacing across live edits', () => {
  const queue = new SponsorQueue(944, 236, 48);
  queue.update([sponsor('a'), sponsor('b', 1)]);
  advance(queue, 10);
  const visible = queue.slots.filter(s => s.x < queue.width).map(s => ({ key: s.key, x: s.x }));
  queue.update([sponsor('a'), sponsor('c', 1), sponsor('b', 2)]);
  for (const slot of visible) assert.equal(queue.slots.find(s => s.key === slot.key).x, slot.x);
  for (let i = 0; i < 300; i++) { advance(queue, 1); continuous(queue); }
  assert.ok(queue.slots.length <= 6);
});

test('unrelated revisions never consume sponsor rotation positions', () => {
  const queue = new SponsorQueue(1496);
  const roster = [sponsor('a'), sponsor('b', 1), sponsor('c', 2)];
  queue.update(roster);
  const before = queue.slots.map(s => ({ key: s.key, id: s.sponsor.id, x: s.x }));
  for (let i = 0; i < 20; i++) queue.update(structuredClone(roster));
  assert.deepEqual(queue.slots.map(s => ({ key: s.key, id: s.sponsor.id, x: s.x })), before);
});

test('reduced-motion static layout updates and removes sponsors immediately', () => {
  const queue = new SponsorQueue(1496);
  queue.update([sponsor('a'), sponsor('b', 1)], true);
  queue.update([{ ...sponsor('b'), name: 'Edited' }], true);
  assert.ok(queue.slots.every(s => s.sponsor.name === 'Edited'));
  queue.update([], true);
  assert.equal(queue.slots.length, 0);
});
