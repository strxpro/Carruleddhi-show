/**
 * Zgłoszenie z bazy → wartości formularza. Jedno miejsce dla obu wyjść.
 * ============================================================================
 *
 * Formularz z danymi wychodzi teraz dwiema drogami: jako strona do druku pod linkiem z maila
 * (`printableForm` w worker/index.js) i jako wypełniony PDF w załączniku (api/form-pdf.js).
 * To ten sam dokument tej samej osoby, więc przepisanie wiersza na pola może być tylko jedno.
 *
 * Druga kopia tej funkcji byłaby pierwszym miejscem, w którym link i załącznik zaczęłyby
 * mówić co innego — a to jest dokument, który organizator sprawdza przy starcie, i wtedy
 * różnica między nimi jest problemem zawodnika, nie nasz.
 *
 * Token też tutaj, z tego samego powodu: obie drogi muszą go liczyć identycznie, bo obie
 * wpuszczają na te same dane.
 */
import { COPY_DECK } from './copy-deck.js';

/** Kod języka, który na pewno mamy w słowniku. */
export function localeOfRow(row) {
  const asked = String(row?.locale || 'it').slice(0, 2).toLowerCase();
  return ['it', 'pl', 'en', 'de', 'es', 'fr'].includes(asked) ? asked : 'it';
}

/**
 * Nazwa pliku formularza dla tego zgłoszenia, bez rozszerzenia.
 *
 * @param {object} row     wiersz z `registrations`
 * @param {string} [lang]  wymuszony język; bez niego język zgłaszającego
 */
export function formStem(row, lang) {
  const locale = lang || localeOfRow(row);
  return `${row?.is_minor ? 'Carruleddhi-minori' : 'Carruleddhi-modulo'}-${locale}`;
}

/** Data w formacie, w jakim stoi na formularzu. */
function formatDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('pl-PL', {
    timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric'
  }).format(parsed);
}

/**
 * Wszystkie pola osobowe formularza, pod kluczami z PRINT_DATA_KEYS.
 *
 * Myślniki zamiast pustych napisów tam, gdzie pole jest nieobowiązkowe: na wydruku pusta
 * kratka znaczy „zapomniałem", a myślnik „nie dotyczy" — i tylko drugie z tego jest prawdą.
 */
export function formValues(row) {
  const locale = localeOfRow(row);
  return {
    RACE_NUMBER: String(row.race_number ?? '').padStart(3, '0'),
    FULL_NAME: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
    BIRTH_DATE: formatDate(row.birth_date),
    POSTAL_CODE: row.postal_code || '',
    PHONE: row.phone || '',
    EMAIL: row.email || '',
    ADDRESS: row.address || '',
    CART_NAME: row.cart_name || '',
    CATEGORY: String(row.category || '').toUpperCase(),
    TEAM: row.team_name || '—',
    CART_NOTES: row.cart_notes || '—',
    RIDER_AGE: String(row.rider_age ?? ''),
    GUARDIAN_NAME: row.guardian_name || '',
    GUARDIAN_EMAIL: row.guardian_email || '',
    GUARDIAN_PHONE: row.guardian_phone || '',
    MOTHER_NAME: row.mother_name || '—',
    FATHER_NAME: row.father_name || '—',
    GUARDIAN_RELATION: COPY_DECK[locale]?.minRel?.[row.guardian_relation] || row.guardian_relation || ''
  };
}

/**
 * Token do formularza tej jednej osoby.
 *
 * HMAC z `WALL_SALT` i uuid zgłoszenia, bez kolumny w bazie i bez niczego do odwrócenia:
 * serwer przelicza i porównuje. Samo uuid w adresie nie wystarcza — jest w panelu i w logach,
 * a to jest adres do cudzego nazwiska, adresu i telefonu. Obrót `WALL_SALT` unieważnia
 * wszystkie linki naraz, co jest właściwym zachowaniem.
 */
export async function printToken(env, id) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.WALL_SALT || 'carruleddhi'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`print:${id}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
