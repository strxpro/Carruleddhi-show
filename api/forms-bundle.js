/**
 * Wypełnione formularze zawodników, sklejone w JEDEN plik do druku.
 * ============================================================================
 *
 *   POST /api/forms-bundle
 *   nagłówek: X-Carruleddhi-Roster-Key: <passphrase>
 *   ciało:    { "ids": ["<uuid>", ...] }   albo   { "all": true }
 *
 * PO CO TO JEST
 *   Organizator przed zawodami drukuje formularze — czasem jeden, na koniec wszystkie
 *   naraz. Pobieranie po jednym znaczy tyle kliknięć, ilu jest zawodników, a potem tyle
 *   otwarć okna drukowania. Jeden plik z wszystkimi stronami po kolei to jedno okno
 *   drukowania i jeden stos kartek w tej samej kolejności co lista startowa.
 *
 * DLACZEGO OSOBNA FUNKCJA, A NIE TRASA W api/intake.js
 *   Ten sam powód co przy api/form-pdf.js: tamta stoi na runtime Edge, gdzie limit pakietu
 *   liczy się w megabajtach, a tu jedzie pdf-lib i cały krój pisma. I ten sam wniosek co tam:
 *   w tym pliku nie ma ANI JEDNEJ nietypowej rzeczy — domyślny runtime, zero plików
 *   towarzyszących, krój importem js-a. `export const config` potrafi sprawić, że funkcja
 *   w ogóle nie powstanie, a build i tak będzie zielony.
 *
 * CZYM SIĘ RÓŻNI OD api/form-pdf.js
 *   Tamta jest dla ZAWODNIKA i broni się tokenem policzonym z jego identyfikatora — bo pod
 *   tym adresem staje człowiek z linku w mailu. Ta jest dla ORGANIZATORA i broni się tym
 *   samym hasłem co reszta panelu. Dlatego ta wolno jej wziąć listę cudzych zgłoszeń, a
 *   tamtej nie.
 *
 * DLACZEGO BŁĄD JEST TU BŁĘDEM, A TAM PUSTYM FORMULARZEM
 *   `form-pdf` odpowiada zawsze plikiem, bo pobiera ją Make w trakcie wysyłania maila i
 *   błąd zatrzymałby cały list. Tutaj po drugiej stronie stoi człowiek patrzący na ekran:
 *   cichy stos pustych formularzy byłby gorszy niż komunikat, bo wyszedłby na jaw dopiero
 *   przy drukarce.
 *
 * PRYWATNOŚĆ
 *   Plik niesie nazwiska, adresy i telefony wszystkich zapisanych. `no-store` i `noindex`,
 *   tak samo jak pojedynczy formularz.
 */
import { PDFDocument } from 'pdf-lib';
import { fillForm } from '../worker/fill-form.js';
import { formValues, formStem } from '../worker/form-values.js';
import { COPY_DECK } from '../worker/copy-deck.js';
import { DEJAVU_SANS_BASE64 } from './dejavu-sans.js';

const SITE = (COPY_DECK._event?.site || 'https://www.carruleddhishow.com').replace(/\/+$/, '');
const ROSTER_HEADER = 'x-carruleddhi-roster-key';

/**
 * Ile formularzy wolno skleić w jednym żądaniu.
 *
 * Każdy to osadzenie kroju i przepisanie strony, więc setka to sekundy pracy i kilkanaście
 * megabajtów w pamięci funkcji. Sto dwadzieścia to więcej, niż ma ta impreza zapisanych, i
 * mniej, niż potrzeba, żeby wywołanie zaczęło się ocierać o limit czasu.
 */
const MAX_FORMS = 120;

let fontCache = null;
const font = () => (fontCache ||= Buffer.from(DEJAVU_SANS_BASE64, 'base64'));

/* Puste formularze pobierane raz na proces, nie raz na zawodnika: przy trzydziestu
   zgłoszeniach w tym samym języku to jedno pobranie zamiast trzydziestu. */
const blankCache = new Map();
async function blankForm(stem) {
  if (!blankCache.has(stem)) {
    const response = await fetch(`${SITE}/emails/${stem}.pdf`);
    if (!response.ok) throw new Error(`pusty formularz ${stem}: HTTP ${response.status}`);
    blankCache.set(stem, new Uint8Array(await response.arrayBuffer()));
  }
  return blankCache.get(stem);
}

/**
 * Porównanie haseł w czasie niezależnym od tego, ile znaków się zgadza.
 *
 * Ta sama zasada, co przy `secretsMatch` w Workerze: zwykłe `===` kończy się na pierwszej
 * różnicy, więc czas odpowiedzi mówi, ile początkowych znaków było trafionych.
 */
function keyMatches(given, expected) {
  const a = String(given || '');
  const b = String(expected || '');
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Ciało żądania, także gdy platforma nie rozpakowała go sama. */
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
}

/** Zgłoszenia do wydruku, w kolejności numerów startowych — czyli tej, w której czyta się listę. */
async function readRows(env, ids) {
  const query = new URL(`${env.SUPABASE_URL}/rest/v1/registrations`);
  query.searchParams.set('select', '*');
  /* Wycofani odpadają zawsze: ich numer wrócił do puli i należy już do kogoś innego, więc
     wydrukowana karta startowa kłamałaby. Ta sama zasada co w api/form-pdf.js. */
  query.searchParams.set('status', 'neq.withdrawn');
  if (ids && ids.length) query.searchParams.set('id', `in.(${ids.join(',')})`);
  query.searchParams.set('order', 'race_number.asc.nullslast,created_at.asc');
  query.searchParams.set('limit', String(MAX_FORMS));
  const found = await fetch(query, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
    }
  });
  if (!found.ok) throw new Error(`Supabase HTTP ${found.status}`);
  return found.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, code: 'METHOD_NOT_ALLOWED' });
    return;
  }

  const env = process.env;
  if (!keyMatches(req.headers[ROSTER_HEADER], env.ROSTER_KEY)) {
    res.status(401).json({ ok: false, code: 'BAD_KEY' });
    return;
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    res.status(500).json({ ok: false, code: 'NO_DATABASE' });
    return;
  }

  try {
    const body = await readBody(req);
    const asked = Array.isArray(body.ids) ? body.ids : [];
    /* Identyfikatory filtrowane, a nie ufane: lecą prosto do zapytania, więc wszystko, co nie
       jest UUID-em, odpada tutaj, a nie w bazie. */
    const ids = asked.filter((id) => /^[0-9a-f-]{36}$/i.test(String(id))).slice(0, MAX_FORMS);
    if (!ids.length && !body.all) {
      res.status(422).json({ ok: false, code: 'NO_IDS' });
      return;
    }

    const rows = await readRows(env, ids.length ? ids : null);
    if (!rows.length) {
      res.status(404).json({ ok: false, code: 'NOTHING_TO_PRINT' });
      return;
    }

    const bundle = await PDFDocument.create();
    const fontBytes = font();
    const failed = [];
    for (const row of rows) {
      try {
        const stem = formStem(row);
        const filled = await fillForm(await blankForm(stem), fontBytes, stem, formValues(row));
        const source = await PDFDocument.load(filled);
        const pages = await bundle.copyPages(source, source.getPageIndices());
        pages.forEach((page) => bundle.addPage(page));
      } catch (problem) {
        /* Jedno zgłoszenie, którego nie da się złożyć, nie może zabrać całego stosu. Numer
           trafia do nagłówka, żeby organizator wiedział, kogo dodrukować osobno. */
        console.warn('forms-bundle: pomijam', row.id, problem?.message || problem);
        failed.push(row.race_number || row.id);
      }
    }

    if (!bundle.getPageCount()) {
      res.status(502).json({ ok: false, code: 'BUNDLE_EMPTY' });
      return;
    }

    const bytes = await bundle.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', String(bytes.length));
    /* `attachment`: tu nikt nie czyta w przeglądarce, tylko zapisuje i drukuje. */
    res.setHeader('Content-Disposition', 'attachment; filename="carruleddhi-formularze.pdf"');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Carruleddhi-Forms', String(bundle.getPageCount()));
    if (failed.length) res.setHeader('X-Carruleddhi-Forms-Failed', failed.join(','));
    res.status(200).send(Buffer.from(bytes));
  } catch (problem) {
    console.error('forms-bundle:', problem?.message || problem);
    res.status(502).json({ ok: false, code: 'BUNDLE_FAILED' });
  }
}
