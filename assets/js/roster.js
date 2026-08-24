/**
 * Participant roster for the admin panel.
 *
 * Privacy rules baked in:
 *  - nothing is persisted: rows live in memory for the life of the tab
 *  - the access passphrase goes to sessionStorage, never localStorage
 *  - contact details and tax codes are masked until explicitly revealed
 *  - printed cards carry no signature line; only the Italian PDF gets signed
 */

const ROSTER_KEY_STORAGE = 'carruleddhi.rosterKey';
const ROSTER_ENDPOINT = '/api/carruleddhi/roster';

const FIELD_ALIASES = {
  raceNumber: ['race_number', 'racenumber', 'numer', 'nr', 'number'],
  firstName: ['first_name', 'firstname', 'imie', 'imię', 'nome'],
  lastName: ['last_name', 'lastname', 'nazwisko', 'cognome'],
  birthDate: ['birth_date', 'birthdate', 'data_urodzenia'],
  postalCode: ['postal_code', 'postalcode', 'cap', 'kod_pocztowy', 'zip'],
  email: ['email', 'e-mail', 'mail'],
  phone: ['phone', 'telefon', 'telefono', 'tel'],
  address: ['address', 'adres', 'indirizzo'],
  cartName: ['cart_name', 'cartname', 'pojazd', 'carruleddhu'],
  category: ['category', 'kategoria', 'categoria'],
  teamName: ['team_name', 'teamname', 'team', 'zespol', 'zespół'],
  cartNotes: ['cart_notes', 'cartnotes', 'notes', 'uwagi', 'note'],
  locale: ['locale', 'lang', 'jezyk', 'język', 'lingua'],
  status: ['status'],
  createdAt: ['created_at', 'createdat', 'data', 'timestamp']
};

const CATEGORY_LABELS = { classic: 'Classic', art: 'ART' };

function normaliseHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_ąćęłńóśźż-]/g, '');
}

/** Maps an arbitrary sheet row onto our field names via the alias table. */
export function normaliseRow(source) {
  const flat = {};
  Object.entries(source || {}).forEach(([key, value]) => {
    flat[normaliseHeader(key)] = typeof value === 'string' ? value.trim() : value;
  });
  const row = {};
  Object.entries(FIELD_ALIASES).forEach(([field, aliases]) => {
    const hit = [normaliseHeader(field), ...aliases].find((alias) => flat[alias] !== undefined && flat[alias] !== '');
    row[field] = hit ? String(flat[hit]) : '';
  });
  row.fullName = [row.firstName, row.lastName].filter(Boolean).join(' ') || '—';
  return row;
}

/** RFC 4180-ish parser: handles quoted fields, embedded commas, CRLF and ";" sheets. */
export function parseCsv(text) {
  const clean = String(text).replace(/^\uFEFF/, '');
  const delimiter = (clean.split('\n')[0].match(/;/g) || []).length > (clean.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let field = '';
  let record = [];
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (quoted) {
      if (char === '"') {
        if (clean[index + 1] === '"') { field += '"'; index += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === delimiter) { record.push(field); field = ''; continue; }
    if (char === '\r') continue;
    if (char === '\n') { record.push(field); rows.push(record); record = []; field = ''; continue; }
    field += char;
  }
  if (field !== '' || record.length) { record.push(field); rows.push(record); }

  const [header, ...body] = rows.filter((entry) => entry.some((cell) => String(cell).trim() !== ''));
  if (!header) return [];
  return body.map((cells) => {
    const record2 = {};
    header.forEach((name, position) => { record2[name] = cells[position] ?? ''; });
    return record2;
  });
}

export function maskEmail(value) {
  const [user = '', domain = ''] = String(value).split('@');
  if (!domain) return value ? '•••' : '—';
  const visible = user.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, user.length - 2))}@${domain}`;
}

export function maskPhone(value) {
  const digits = String(value).replace(/\s+/g, '');
  if (digits.length < 5) return digits ? '•••' : '—';
  return `${digits.slice(0, 3)}•••${digits.slice(-3)}`;
}

export function maskTaxCode(value) {
  const code = String(value).toUpperCase();
  if (code.length < 6) return code ? '•••' : '—';
  return `${code.slice(0, 3)}${'•'.repeat(code.length - 6)}${code.slice(-3)}`;
}

export function sessionKey() {
  try { return sessionStorage.getItem(ROSTER_KEY_STORAGE) || ''; } catch (_) { return ''; }
}

export function rememberKey(value) {
  try {
    if (value) sessionStorage.setItem(ROSTER_KEY_STORAGE, value);
    else sessionStorage.removeItem(ROSTER_KEY_STORAGE);
  } catch (_) { /* Private mode can block session storage. */ }
}

/** Fetches the roster through the Worker. Rejects with a translated message. */
export async function fetchRoster(key, endpoint = ROSTER_ENDPOINT) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Carruleddhi-Roster-Key': key
    },
    body: JSON.stringify({ type: 'roster', limit: 500 }),
    credentials: 'omit'
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Nieprawidłowe hasło dostępu.');
  if (response.status === 503) throw new Error('Proxy nie ma ustawionego sekretu ROSTER_KEY.');
  if (response.status === 429) throw new Error('Za dużo prób. Odczekaj kilka minut.');
  if (!response.ok) throw new Error(`Proxy odpowiedziało błędem ${response.status}.`);
  const rows = Array.isArray(payload.rows) ? payload.rows : Array.isArray(payload) ? payload : [];
  if (!rows.length) throw new Error('Proxy nie zwróciło żadnych wierszy.');
  return rows.map(normaliseRow);
}

export function categoryLabel(value) {
  return CATEGORY_LABELS[String(value).toLowerCase()] || (value ? String(value).toUpperCase() : '—');
}

export function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short' }).format(date);
}

/* ------------------------------------------------------------------ *
 * Wall moderation
 * ------------------------------------------------------------------ *
 * Same passphrase, same header, same "nothing is persisted" rule as the roster
 * above, so it lives here rather than growing a second copy of that plumbing
 * somewhere else. The Worker refuses `wall-admin` without the header, so a
 * missing or wrong passphrase fails at the proxy and never touches the database.
 */

const WALL_ENDPOINT = '/api/carruleddhi/wall';

/** Turns a proxy response into either a payload or an error worth reading. */
async function askWall(key, body) {
  const response = await fetch(WALL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Carruleddhi-Roster-Key': key
    },
    body: JSON.stringify({ type: 'wall-admin', ...body }),
    credentials: 'omit'
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('Nieprawidłowe hasło dostępu.');
  if (response.status === 503) {
    throw new Error(payload.code === 'WALL_DISABLED'
      ? 'Worker nie ma ustawionych sekretów Supabase.'
      : 'Proxy nie ma ustawionego sekretu ROSTER_KEY.');
  }
  if (response.status === 429) throw new Error('Za dużo prób. Odczekaj kilka minut.');
  if (!response.ok) throw new Error(`Proxy odpowiedziało błędem ${response.status}.`);
  return payload;
}

/**
 * Every message, approved or not.
 *
 * Unapproved rows are the point: they are invisible on the site, so this list is
 * the only place they can be read before a decision is made about them.
 */
export async function fetchWallComments(key, limit = 60) {
  const payload = await askWall(key, { action: 'list', limit });
  return Array.isArray(payload.comments) ? payload.comments : [];
}

export function approveWallComment(key, id) {
  return askWall(key, { action: 'approve', id });
}

export function hideWallComment(key, id) {
  return askWall(key, { action: 'hide', id });
}

export function deleteWallComment(key, id) {
  return askWall(key, { action: 'delete', id });
}

export { ROSTER_ENDPOINT, WALL_ENDPOINT };
