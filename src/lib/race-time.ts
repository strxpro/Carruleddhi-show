import { parseRaceTime as parse, formatRaceTime } from '../../assets/js/race-time.js';
export { formatRaceTime };
export function parseRaceTime(value: string): number | null {
  const parsed = parse(value);
  if (parsed === undefined) throw new Error('Invalid race time');
  return parsed;
}
