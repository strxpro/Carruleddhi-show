/**
 * Adds keys to emails/copy.json in every language at once.
 *
 * Six near-identical edits by hand is six chances to put the French string in the German
 * block. This writes them from one table and then re-reads the file to prove every
 * language ended up with every key, which is the check that matters.
 *
 *     node tools/add-copy-keys.mjs
 *
 * Idempotent: a key already present in a language is left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'emails', 'copy.json');
const deck = JSON.parse(readFileSync(file, 'utf8'));

/* The unsubscribe flow: the small link at the foot of every letter, and the wording of the
   e-mail carrying the code. %CODE% is substituted by the function, the same way %FIRSTNAME%
   already is — the renderer does no substitution of its own. */
const ADDITIONS = {
  it: {
    unsubFooter: 'Non voglio più questi avvisi',
    unsubSubject: 'Il tuo codice: %CODE%',
    unsubCodeTitle: 'Ecco il codice',
    unsubCodeLead: 'Inseriscilo sul sito per disattivare gli avvisi. Vale 15 minuti.',
    unsubCodeNote: 'Se non hai chiesto tu questo codice, ignora il messaggio: non cambia nulla.',
    unsubDone: 'Fatto. Non ti scriveremo più.'
  },
  pl: {
    unsubFooter: 'Nie chcę już tych powiadomień',
    unsubSubject: 'Twój kod: %CODE%',
    unsubCodeTitle: 'Oto kod',
    unsubCodeLead: 'Wpisz go na stronie, żeby wyłączyć powiadomienia. Jest ważny 15 minut.',
    unsubCodeNote: 'Jeśli to nie Ty prosiłeś o kod, zignoruj tę wiadomość — nic się nie zmieni.',
    unsubDone: 'Gotowe. Nie będziemy już pisać.'
  },
  en: {
    unsubFooter: 'I no longer want these',
    unsubSubject: 'Your code: %CODE%',
    unsubCodeTitle: 'Here is the code',
    unsubCodeLead: 'Enter it on the website to switch the reminders off. It lasts 15 minutes.',
    unsubCodeNote: 'If you did not ask for this code, ignore this message — nothing changes.',
    unsubDone: 'Done. We will not write again.'
  },
  de: {
    unsubFooter: 'Ich möchte das nicht mehr',
    unsubSubject: 'Dein Code: %CODE%',
    unsubCodeTitle: 'Hier ist der Code',
    unsubCodeLead: 'Gib ihn auf der Website ein, um die Erinnerungen abzuschalten. Er gilt 15 Minuten.',
    unsubCodeNote: 'Wenn du diesen Code nicht angefordert hast, ignoriere die Nachricht — es ändert sich nichts.',
    unsubDone: 'Erledigt. Wir schreiben nicht mehr.'
  },
  es: {
    unsubFooter: 'Ya no quiero estos avisos',
    unsubSubject: 'Tu código: %CODE%',
    unsubCodeTitle: 'Aquí tienes el código',
    unsubCodeLead: 'Escríbelo en la web para desactivar los avisos. Vale 15 minutos.',
    unsubCodeNote: 'Si no has pedido este código, ignora el mensaje: no cambia nada.',
    unsubDone: 'Hecho. No volveremos a escribir.'
  },
  fr: {
    unsubFooter: 'Je ne veux plus ces rappels',
    unsubSubject: 'Votre code : %CODE%',
    unsubCodeTitle: 'Voici le code',
    unsubCodeLead: 'Saisissez-le sur le site pour désactiver les rappels. Il est valable 15 minutes.',
    unsubCodeNote: 'Si vous n’avez pas demandé ce code, ignorez ce message : rien ne change.',
    unsubDone: 'C’est fait. Nous n’écrirons plus.'
  }
};

let added = 0;
for (const [code, keys] of Object.entries(ADDITIONS)) {
  if (!deck[code]) throw new Error(`no language block "${code}" in emails/copy.json`);
  for (const [key, value] of Object.entries(keys)) {
    if (deck[code][key] !== undefined) continue;
    deck[code][key] = value;
    added += 1;
  }
}

writeFileSync(file, `${JSON.stringify(deck, null, 2)}\n`, 'utf8');

/* Read back and compared against Italian. The whole point of doing this in one pass is
   that no language can be left a key short, so that is the thing to assert. */
const written = JSON.parse(readFileSync(file, 'utf8'));
const reference = Object.keys(written.it);
let problems = 0;
for (const code of Object.keys(written).filter((key) => !key.startsWith('_'))) {
  const missing = reference.filter((key) => written[code][key] === undefined);
  if (missing.length) {
    problems += 1;
    console.log(`FAIL  ${code} missing: ${missing.join(', ')}`);
  }
}

console.log(`${added} keys added, ${reference.length} keys per language, ${problems} problems`);
process.exit(problems ? 1 : 0);
