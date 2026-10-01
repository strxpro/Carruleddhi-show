import type { Sponsor } from './types';

export interface SponsorSlot { key: number; x: number; sponsor: Sponsor }

/** Fixed-pitch conveyor. Only recycle a tile after its trailing edge leaves the viewport. */
export class SponsorQueue {
  readonly slots: SponsorSlot[] = [];
  private roster: Sponsor[] = [];
  private lastId = '';
  private serial = 0;
  private rosterKey = '';
  private staticMode = false;
  readonly width: number;
  readonly pitch: number;
  readonly speed: number;
  constructor(width: number, pitch = 260, speed = 54) {
    this.width = width;
    this.pitch = pitch;
    this.speed = speed;
  }

  update(sponsors: Sponsor[], staticMode = false) {
    const seen = new Set<string>();
    const roster = sponsors.filter((s) => {
      if (!s.active || seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const key = JSON.stringify(roster.map(({ id, name, logo, url, active, order, tier }) => [id, name, logo, url, active, order, tier]));
    if (key === this.rosterKey && staticMode === this.staticMode) return;
    this.rosterKey = key;
    this.roster = roster;
    this.staticMode = staticMode;
    if (staticMode) {
      this.slots.length = 0;
      this.lastId = '';
      this.fill();
      return;
    }
    // Visible tiles are immutable, even when their logo/name/order changes remotely.
    const lastVisible = this.slots.filter((slot) => slot.x < this.width).at(-1);
    if (lastVisible) this.lastId = lastVisible.sponsor.id;
    for (const slot of this.slots) {
      if (slot.x >= this.width) {
        const next = this.next();
        if (next) slot.sponsor = next;
      }
    }
    if (!this.roster.length) {
      while (this.slots.length && this.slots[this.slots.length - 1]!.x >= this.width) this.slots.pop();
    }
    this.fill();
  }

  private next(): Sponsor | undefined {
    if (!this.roster.length) return undefined;
    const index = this.roster.findIndex((s) => s.id === this.lastId);
    const next = this.roster[(index + 1) % this.roster.length];
    if (next) this.lastId = next.id;
    return next;
  }

  private fill() {
    if (!this.roster.length) return;
    let x = this.slots.length ? this.slots[this.slots.length - 1]!.x + this.pitch : 0;
    while (x < this.width + this.pitch) {
      const sponsor = this.next();
      if (!sponsor) break;
      this.slots.push({ key: ++this.serial, x, sponsor });
      x += this.pitch;
    }
  }

  advance(seconds: number): boolean {
    // OBS can suspend a hidden source. Resume its phase, don't jump across elapsed wall time.
    const distance = Math.min(Math.max(seconds, 0), .05) * this.speed;
    for (const slot of this.slots) slot.x -= distance;
    let changed = false;
    while (this.slots.length && this.slots[0]!.x <= -this.pitch) { this.slots.shift(); changed = true; }
    const before = this.serial;
    this.fill();
    return changed || before !== this.serial;
  }
}
