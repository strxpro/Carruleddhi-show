/**
 * One-off: adds the text-effect attributes to the section headings in index.html.
 *
 * Written as a script rather than done by hand because the same edit is repeated six
 * times and every one of them has to land inside an existing tag without disturbing the
 * `data-i18n` key that tag carries. It reports a miss instead of silently skipping, so a
 * heading that was renamed shows up as a line of output and not as a section that quietly
 * has no animation.
 *
 *     node tools/apply-text-effects.mjs
 *
 * Idempotent: a heading that already has the attribute is left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'index.html');
let html = readFileSync(file, 'utf8');

/* `rise` on the headings that read as a statement, `jump` on the ones that read as an
   invitation. Not every heading: six animated titles down one page is a page that will
   not sit still, and the two long ones (the route and the FAQ) get the quieter effect. */
const targets = [
  ['route-title', 'rise'],
  ['gallery-title', 'jump'],
  ['prizes-title', 'jump'],
  ['faq-title', 'rise'],
  ['wall-title', 'jump'],
  ['contact-title', 'rise']
];

let applied = 0;
for (const [id, effect] of targets) {
  const tag = new RegExp(`<h2([^>]*\\bid="${id}"[^>]*)>`);
  const found = tag.exec(html);
  if (!found) {
    console.log(`MISS  no <h2 id="${id}"> in index.html`);
    continue;
  }
  if (found[1].includes('data-text-effect')) {
    console.log(`skip  ${id} already has an effect`);
    continue;
  }
  html = html.replace(tag, `<h2$1 data-text-effect="${effect}">`);
  applied += 1;
}

writeFileSync(file, html, 'utf8');
console.log(`\n${applied} of ${targets.length} headings updated`);
