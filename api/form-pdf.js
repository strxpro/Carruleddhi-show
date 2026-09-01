/**
 * Wypełniony formularz jako PDF — to jest plik, który dokleja się do potwierdzenia.
 * ============================================================================
 *
 *   GET /api/form-pdf?id=<uuid>&t=<token>[&lang=it]
 *
 * DLACZEGO OSOBNA FUNKCJA, A NIE TRASA W api/intake.js
 *   Tamta stoi na runtime Edge (`config.runtime = 'edge'`), a tutaj trzeba przeczytać z dysku
 *   krój pisma i uruchomić pdf-lib. Edge nie ma `node:fs`, a limit pakietu liczy się tam w
 *   megabajtach. Node ich nie ma — i nie ma też Chrome, ale Chrome nie jest tu potrzebny:
 *   układ jest już złożony w pustym formularzu, dokładamy na nim wyłącznie napisy.
 *
 * CO SIĘ DZIEJE, GDY COKOLWIEK PÓJDZIE NIE TAK
 *   Wraca PUSTY formularz ze statusem 200. Nigdy błąd.
 *
 *   Ten adres pobiera Make modułem „Get a file" W TRAKCIE wysyłania potwierdzenia. Filtr w
 *   Make nie jest `if` — moduł, który zwróci błąd, zatrzymuje całą gałąź, a razem z nią
 *   e-mail. Zawodnik nie dostałby wtedy ŻADNEGO listu: ani numeru startowego, ani formularza,
 *   ani informacji, że jest zapisany. Pusty formularz jest gorszy od wypełnionego i
 *   nieporównywalnie lepszy od ciszy — więc każda ścieżka awaryjna kończy się tym samym
 *   plikiem, który ta strona wysyłała przez cały poprzedni rok.
 *
 * PRYWATNOŚĆ
 *   Ten plik niesie czyjeś nazwisko, adres i telefon. `no-store` i `noindex`, dokładnie jak
 *   strona do druku pod tym samym tokenem.
 */
import { readFileSync } from 'node:fs';
import { fillForm } from '../worker/fill-form.js';
import { formValues, formStem, printToken } from '../worker/form-values.js';
import { COPY_DECK } from '../worker/copy-deck.js';

export const config = { runtime: 'nodejs' };

const SITE = (COPY_DECK._event?.site || 'https://www.carruleddhishow.com').replace(/\/+$/, '');
const LOCALES = new Set(['it', 'pl', 'en', 'de', 'es', 'fr']);

/* Wczytany raz na proces, nie na żądanie: 757 kB z dysku przy każdym pobraniu załącznika to
   koszt, którego nie trzeba płacić. `new URL(..., import.meta.url)` zamiast ścieżki względnej,
   bo katalog roboczy funkcji na Vercelu nie jest katalogiem tego pliku. */
let fontCache = null;
function font() {
  if (!fontCache) fontCache = readFileSync(new URL('./DejaVuSans.ttf', import.meta.url));
  return fontCache;
}

/** Pusty formularz z tej samej strony, która za chwilę wyśle maila. */
async function blankForm(stem) {
  const response = await fetch(`${SITE}/emails/${stem}.pdf`);
  if (!response.ok) throw new Error(`pusty formularz ${stem}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

function send(res, bytes, name) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', String(bytes.length));
  /* `inline`, nie `attachment`: pod tym adresem bywa też człowiek z linku w mailu, a Make
     i tak nadaje załącznikowi własną nazwę z numerem startowym. */
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.status(200).send(Buffer.from(bytes));
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host || 'localhost'}`);
  const id = String(url.searchParams.get('id') || '');
  const token = String(url.searchParams.get('t') || '');
  const asked = String(url.searchParams.get('lang') || '').toLowerCase();

  /* Nazwa pliku i wersja językowa muszą być znane, ZANIM cokolwiek może się nie udać — to
     one decydują, który pusty formularz wraca w razie awarii. Bez `id` w ogóle nie wiemy,
     o kogo chodzi, więc wtedy wraca formularz włoski dla dorosłego: ten sam, który wysyłała
     poprzednia wersja tej strony. */
  let stem = `Carruleddhi-modulo-${LOCALES.has(asked) ? asked : 'it'}`;

  try {
    const env = process.env;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f]{32}$/.test(token)) throw new Error('zly adres');
    if (token !== await printToken(env, id)) throw new Error('zly token');
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) throw new Error('brak bazy');

    const query = new URL(`${env.SUPABASE_URL}/rest/v1/registrations`);
    query.searchParams.set('select', '*');
    query.searchParams.set('id', `eq.${id}`);
    query.searchParams.set('limit', '1');
    const found = await fetch(query, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`
      }
    });
    if (!found.ok) throw new Error(`Supabase HTTP ${found.status}`);
    const row = (await found.json())[0];
    if (!row) throw new Error('nie ma takiego zgloszenia');

    /* Wycofane zgłoszenie nie dostaje karty startowej — jego numer wrócił już do puli i należy
       do kogoś innego. Ta sama zasada, co przy stronie do druku. */
    if (row.status === 'withdrawn') throw new Error('zgloszenie wycofane');

    /* `lang` wybiera WERSJĘ JĘZYKOWĄ formularza, nie język danych: obcokrajowiec dostaje dwa
       załączniki — włoski do podpisu i swój do czytania — i oba mają być wypełnione tymi
       samymi danymi. Bez parametru idzie język zgłaszającego. */
    stem = formStem(row, LOCALES.has(asked) ? asked : undefined);

    const filled = await fillForm(await blankForm(stem), font(), stem, formValues(row));
    send(res, filled, `${stem}.pdf`);
  } catch (problem) {
    /* Powód idzie do logów Vercela, do odbiorcy idzie plik. Nagłówek mówi, że to wersja
       zapasowa, więc da się to zauważyć w historii Make bez czytania logów. */
    console.warn('form-pdf: oddaje pusty formularz —', problem?.message || problem);
    try {
      res.setHeader('X-Carruleddhi-Form', 'blank-fallback');
      send(res, await blankForm(stem), `${stem}.pdf`);
    } catch (worse) {
      /* Nie udało się nawet pobrać pustego. Tu już nie ma czego oddać — 502 zatrzyma gałąź w
         Make, ale alternatywą jest udawanie PDF-em, który nim nie jest. */
      console.error('form-pdf: nie ma nawet pustego formularza —', worse?.message || worse);
      res.status(502).json({ ok: false, code: 'FORM_PDF_UNAVAILABLE' });
    }
  }
}
