/**
 * Dopisuje dane zgłoszenia na GOTOWYM, pustym formularzu PDF.
 * ============================================================================
 *
 * DLACZEGO DOPISYWANIE, A NIE SKŁADANIE OD NOWA
 *   Puste formularze robi Chrome z szablonu HTML (tools/build-pdfs.mjs) i to on ustala, że
 *   wszystko mieści się na jednej stronie — w sześciu językach i w dwóch wersjach wiekowych.
 *   Żadna biblioteka PDF tego układu nie odtworzy: rysują prymitywami, a szablon to siatka,
 *   `dl/dd` i justowanie. Przepisanie znaczyłoby odtworzenie całości i utratę tej jednej
 *   strony, co jest opisane w make/PLAN-FORMULARZ-Z-DANYMI.md.
 *
 *   Więc układ zostaje nietknięty. Bierzemy plik, który już jest, i dokładamy na nim napisy w
 *   punktach zmierzonych przy budowaniu — dokładnie tam, gdzie w pustej wersji są kreski do
 *   pisania. Strona pozostaje tą samą stroną; przybywa na niej tekst.
 *
 * SKĄD WSPÓŁRZĘDNE
 *   worker/form-fields.js, generowane razem z PDF-ami. Mierzy je Chrome w układzie DRUKU, bo
 *   pozycje zależą od tego, jak w danym języku łamią się etykiety — „Nome e cognome" i
 *   „Vor- und Nachname" przesuwają wiersze pod sobą o różne wartości.
 *
 * CZCIONKA
 *   DejaVu Sans, nie Helvetica z zestawu wbudowanego. Wbudowane używają WinAnsi, w którym nie
 *   ma ł, ą, ę, ś, ż ani ć — czyli polskie nazwisko wychodziłoby z dziurami albo wywalało
 *   render. DejaVu ma pełną łacinę rozszerzoną i wolną licencję. Wygląda inaczej niż Segoe UI
 *   etykiet i to jest w porządku: na formularzu widać wtedy, co jest drukiem, a co wpisem.
 *
 * CO ROBI, GDY SIĘ NIE UDA
 *   Nic. Rzuca, a wołający oddaje pusty formularz — patrz api/form-pdf.js. Załącznik pobiera
 *   Make w trakcie wysyłania potwierdzenia, więc odpowiedź inna niż PDF zatrzymałaby całą
 *   gałąź i zgłaszający nie dostałby ŻADNEGO listu. Pusty formularz jest gorszy od
 *   wypełnionego i nieporównywalnie lepszy od braku maila.
 */
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { FORM_FIELDS } from './form-fields.js';

/** Poniżej tego rozmiaru napis przestaje być czytelny na wydruku, więc wtedy łamiemy wiersz. */
const MIN_SIZE = 6.5;
/**
 * O tyle punktów napis siada WYŻEJ niż linia bazowa zmierzona w układzie.
 *
 * Zmierzona linia to miejsce, w którym Chrome postawiłby tekst na formularzu wypełnionym —
 * ale ten formularz jest pusty i ma tam kreskę do pisania. Bez tego przesunięcia kreska
 * przechodzi przez ogonki „g", „j" i „ą". Dwa punkty to tyle, ile zostawia nad linią ktoś
 * piszący ręcznie.
 */
const LIFT = 2;
/** Ile najwyżej wierszy wolno zająć jednemu polu: drugi mieści się nad wierszem poniżej. */
const MAX_LINES = 2;

/**
 * Rozmiar, przy którym napis mieści się w szerokości pola — albo `null`, gdy nie mieści się
 * w żadnym rozsądnym.
 */
function fitSize(font, text, width, start) {
  for (let size = start; size >= MIN_SIZE; size -= 0.25) {
    if (font.widthOfTextAtSize(text, size) <= width) return size;
  }
  return null;
}

/** Dzieli napis na wiersze mieszczące się w szerokości. Łamie po spacjach, nigdy w środku słowa. */
function wrap(font, text, width, size) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * @param {Uint8Array} blankPdf   pusty formularz, ten sam, który dziś jedzie w załączniku
 * @param {Uint8Array} fontBytes  DejaVuSans.ttf
 * @param {string} stem           nazwa pliku bez rozszerzenia, np. "Carruleddhi-modulo-pl"
 * @param {Record<string, string>} values  wartości pod kluczami z PRINT_DATA_KEYS
 * @returns {Promise<Uint8Array>} ten sam formularz z dopisanymi danymi
 */
export async function fillForm(blankPdf, fontBytes, stem, values) {
  const fields = FORM_FIELDS[stem];
  if (!fields) throw new Error(`brak mapy pol dla ${stem}`);

  const pdf = await PDFDocument.load(blankPdf);
  pdf.registerFontkit(fontkit);
  /* `subset: true` — do pliku wchodzą wyłącznie znaki, które naprawdę padły. Bez tego każdy
     załącznik rósłby o 757 kB kroju, z czego użyte jest kilkadziesiąt liter. */
  const font = await pdf.embedFont(fontBytes, { subset: true });
  const page = pdf.getPages()[0];
  if (!page) throw new Error('pusty formularz nie ma ani jednej strony');

  for (const [key, box] of Object.entries(fields)) {
    const text = String(values[key] ?? '').trim();
    if (!text) continue;

    /* Numer startowy jest wyśrodkowany w swojej ramce i pisany dużym stopniem — jedyne pole,
       które nie jest linią do pisania, więc jedyne z własną regułą. */
    const centred = key === 'RACE_NUMBER';
    const start = Math.min(box.size, centred ? box.size : box.size * 0.92);

    const single = fitSize(font, text, box.width, start);
    if (single) {
      const width = font.widthOfTextAtSize(text, single);
      page.drawText(text, {
        x: centred ? box.x + (box.width - width) / 2 : box.x,
        y: box.y + LIFT,
        size: single,
        font
      });
      continue;
    }

    /* Nie zmieściło się w jednym wierszu nawet przy 6,5 pt. Łamiemy na dwa i podnosimy
       pierwszy nad linię — dolny zostaje na niej, tam gdzie oko go szuka. Trzeciego wiersza
       nie ma z rozmysłu: pod spodem stoi następne pole, a formularz ma zostać jednostronicowy. */
    const size = MIN_SIZE + 0.5;
    const lines = wrap(font, text, box.width, size).slice(0, MAX_LINES);
    const step = size * 1.15;
    lines.forEach((line, index) => {
      page.drawText(line, {
        x: box.x,
        y: box.y + LIFT + (lines.length - 1 - index) * step,
        size,
        font
      });
    });
  }

  return pdf.save();
}
