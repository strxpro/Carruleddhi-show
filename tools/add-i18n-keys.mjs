/**
 * Adds keys to assets/js/i18n.js, in every language, in one pass.
 *
 * That file is one object per language with the keys packed several to a line, which makes
 * a hand edit six near-identical edits in six places — and six chances to put a French
 * string in the German block. This inserts each new key immediately after an existing
 * anchor key inside the same language object, so a missing anchor is an error rather than
 * a key that lands in the wrong language.
 *
 *     node tools/add-i18n-keys.mjs
 *
 * Idempotent: a key that is already present in a language is skipped.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'assets', 'js', 'i18n.js');
let source = readFileSync(file, 'utf8');

/* Anchor: the key the new ones are inserted after. It has to exist exactly once per
   language block, which `modal.time3` does — it is the last of the three reminder chips,
   so the new "too late" line reads next to them in the file as well as on the page. */
const ANCHOR = 'modal.time3';

const ADDITIONS = {
  it: {
    'modal.tooLate': 'Ormai è troppo tardi per un promemoria: la discesa è tra poche ore. Ci vediamo là.',
    'modal.only': 'Riceverai solo questi:',
    'modal.unsub': 'Non voglio più promemoria'
  },
  pl: {
    'modal.tooLate': 'Na przypomnienie już za późno — zjazd jest za kilka godzin. Do zobaczenia na miejscu.',
    'modal.only': 'Dostaniesz tylko te:',
    'modal.unsub': 'Nie chcę już powiadomień'
  },
  en: {
    'modal.tooLate': 'Too late for a reminder now — the descent is a few hours away. See you there.',
    'modal.only': 'You will get only these:',
    'modal.unsub': 'I no longer want reminders'
  },
  de: {
    'modal.tooLate': 'Für eine Erinnerung ist es jetzt zu spät — die Abfahrt ist in wenigen Stunden. Bis dort.',
    'modal.only': 'Du bekommst nur diese:',
    'modal.unsub': 'Ich möchte keine Erinnerungen mehr'
  },
  es: {
    'modal.tooLate': 'Ya es tarde para un recordatorio: la bajada es en unas horas. Nos vemos allí.',
    'modal.only': 'Recibirás solo estos:',
    'modal.unsub': 'Ya no quiero avisos'
  },
  fr: {
    'modal.tooLate': 'Trop tard pour un rappel : la descente est dans quelques heures. À tout à l’heure.',
    'modal.only': 'Vous ne recevrez que ceux-ci :',
    'modal.unsub': 'Je ne veux plus de rappels'
  }
};

/* Each language block starts with its code as a property. Located by that rather than by
   line number, because the blocks are reordered and reflowed often enough that a line
   number is a guess with a shelf life. */
function blockRange(code) {
  // Declared as `const it = {`, one per language. Matched on the declaration rather than
  // on a property name, which is what an earlier version guessed and got wrong.
  const start = source.search(new RegExp(`\\bconst\\s+${code}\\s*=\\s*\\{`));
  if (start < 0) throw new Error(`no language block for "${code}"`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return [open, index];
    }
  }
  throw new Error(`unbalanced braces in the "${code}" block`);
}

let added = 0;
for (const [code, keys] of Object.entries(ADDITIONS)) {
  const [open, close] = blockRange(code);
  const block = source.slice(open, close);

  const anchorAt = block.indexOf(`'${ANCHOR}'`);
  if (anchorAt < 0) throw new Error(`anchor "${ANCHOR}" not found in the "${code}" block`);
  // End of the anchor's own entry: the comma that closes it.
  const insertAt = block.indexOf(',', block.indexOf(':', anchorAt)) + 1;

  const fresh = Object.entries(keys).filter(([key]) => !block.includes(`'${key}'`));
  if (fresh.length === 0) {
    console.log(`skip  ${code} already has all ${Object.keys(keys).length} keys`);
    continue;
  }

  const text = fresh
    .map(([key, value]) => ` '${key}': ${JSON.stringify(value).replace(/^"|"$/g, "'").replace(/\\"/g, '"')},`)
    .join('');

  source = source.slice(0, open + insertAt) + text + source.slice(open + insertAt);
  added += fresh.length;
  console.log(`ok    ${code} +${fresh.length}`);
}

writeFileSync(file, source, 'utf8');
console.log(`\n${added} keys added`);
