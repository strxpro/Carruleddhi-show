/** Millisecond precision; empty input explicitly clears a saved time. */
export function formatRaceTime(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) return '';
  return `${String(Math.floor(value / 60000)).padStart(2, '0')}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`;
}
export function parseRaceTime(input) {
  const text = input.trim().replace(',', '.');
  if (!text) return null;
  const match = /^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/.exec(text);
  if (!match || (match[1] !== undefined && Number(match[2]) > 59)) return undefined;
  const value = (Number(match[1] || 0) * 60 + Number(match[2])) * 1000 + Number((match[3] || '').padEnd(3, '0'));
  return Number.isSafeInteger(value) && value <= 2147483647 ? value : undefined;
}
export function raceTimeLabel() {
  return ({ pl: 'Czas przejazdu', it: 'Tempo di discesa', en: 'Race time', de: 'Fahrzeit', es: 'Tiempo de bajada', fr: 'Temps de descente' })[document.documentElement.lang] || 'Tempo di discesa';
}
