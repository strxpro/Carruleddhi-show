/**
 * Assigns the text-effect attributes in index.html.
 *
 * Written as a script rather than done by hand because the same edit is repeated a dozen
 * times and every one of them has to land inside an existing tag without disturbing the
 * `data-i18n` key that tag carries. It reports a miss instead of silently skipping, so a
 * heading that was renamed shows up as a line of output and not as a section that quietly
 * has no animation.
 *
 *     node tools/apply-text-effects.mjs
 *
 * Idempotent: an element that already has its attribute is left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');

let applied = 0;
let missed = 0;

/* ------------------------------------------------------- entrance effects
   `rise` on the headings that read as a statement, `jump` on the ones that read as an
   invitation. Not every heading on the page: six animated titles down one column is a page
   that will not sit still, and the two long ones get the quieter effect. */
const HEADINGS = [
  ['route-title', 'rise'],
  ['gallery-title', 'jump'],
  ['prizes-title', 'jump'],
  ['faq-title', 'rise'],
  ['wall-title', 'jump'],
  ['contact-title', 'rise']
];

for (const [id, effect] of HEADINGS) {
  const tag = new RegExp(`<h2([^>]*\\bid="${id}"[^>]*)>`);
  const found = tag.exec(html);
  if (!found) {
    console.log(`MISS  no <h2 id="${id}">`);
    missed += 1;
    continue;
  }
  if (found[1].includes('data-text-effect')) continue;
  html = html.replace(tag, `<h2$1 data-text-effect="${effect}">`);
  applied += 1;
}

/* ---------------------------------------------------------------- jitter
   One word on the page that will not sit still, and it has to be the right one: the year in
   the hero. It is the only piece of text whose job is to be noticed rather than read, so a
   permanent wobble on it is character; the same wobble on a heading would be a distraction
   nobody can switch off.

   `.hero__year` is a <span> with no data-i18n, so nothing rewrites its contents and the
   effect survives a language change without being rebuilt. */
const JITTER = '<span class="hero__year">';
if (!html.includes('data-text-jitter')) {
  if (html.includes(JITTER)) {
    html = html.replace(JITTER, '<span class="hero__year" data-text-jitter>');
    applied += 1;
  } else {
    console.log('MISS  no .hero__year in the hero');
    missed += 1;
  }
}

/* ------------------------------------------------------------------- roll
   The footer navigation links: "La gara", "Percorso", "Privacy policy". Short, single line,
   and already hover targets — which is exactly what the roll needs.

   IT WAS ON THE SECTION KICKERS FIRST, AND THAT WAS WRONG
   The roll works by stacking two copies of the label inside a clipped box whose size comes
   from a hidden third copy, and all three carry `white-space: pre` so the two visible ones
   stay aligned. That means the label cannot wrap. The kickers are sentences — "Tradycja,
   która nabiera prędkości" is thirty-three characters — so on a narrow screen they would
   have overflowed their column instead of wrapping. Measured in a browser before this was
   noticed, which is also how the stacking bug in the CSS turned up: every rolled element was
   coming out twice as tall as its text.

   Hover only, so on a phone these are simply links. That is the right outcome for a
   decoration: it costs nothing where it cannot be seen. */
const linkTag = /<a href="(#[a-z]+|privacy\.html|cookies\.html|regolamento\.html)"([^>]*\bdata-i18n="(?:nav|footer)\.[^"]+"[^>]*)>/g;
const links = [...html.matchAll(linkTag)];
if (!html.includes('data-text-roll')) {
  html = html.replace(linkTag, (match, href, attributes) =>
    attributes.includes('data-text-roll') ? match : `<a href="${href}"${attributes} data-text-roll>`);
  applied += links.length;
  if (!links.length) {
    console.log('MISS  no footer navigation links found');
    missed += 1;
  }
}

/* ------------------------------------------------------------------ ghost
   NOT ASSIGNED, ON PURPOSE.
   bold-copy draws the word twice — a large faint copy behind a smaller solid one, which
   grows towards it on hover. It needs its own space and a container it can be centred in,
   and every candidate on this page (the hero title, the section headings, the footer brand)
   is either auto-fitted by fitOne() or wrapped by the language flip in setTranslatedText().
   Both of those measure the element, and both would measure the wrong thing once there are
   two copies of the text inside it — the hero title is exactly where "CARRULEDD" got cut off
   before.

   The CSS is in text-effects.css and works. It needs a heading built for it rather than one
   retrofitted, so it is left for whenever that exists. */

writeFileSync(file, html, 'utf8');
console.log(`\n${applied} elements updated, ${missed} misses`);
process.exit(missed ? 1 : 0);
