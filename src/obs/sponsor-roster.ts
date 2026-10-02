import type { Sponsor } from './types';

const houseCards: Sponsor[] = [
  { id: 'house:brand', name: 'Carruleddhi Show', logo: '', url: '', active: true, order: 30, tier: 'house' },
  { id: 'house:town', name: 'Santa Teresa Gallura', logo: '', url: '', active: true, order: 31, tier: 'house' },
  { id: 'house:partner', name: "Partner dell'evento", logo: '', url: '', active: true, order: 32, tier: 'house' },
];

/** Presentation-only house cards never enter the canonical sponsor database. */
export function sponsorRoster(sponsors: Sponsor[]): Sponsor[] {
  const active = sponsors.filter(s => s.active);
  return [...active, ...houseCards.slice(0, Math.max(0, 3 - active.length))];
}
