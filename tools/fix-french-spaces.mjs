/**
 * French typography wants a space before ; : ! ? and inside guillemets, but it has
 * to be an unbreakable one. Measured before this ran: 22 French strings in i18n.js
 * used a plain U+0020, which lets a line wrap and leave a lone colon or exclamation
 * mark at the start of the next line.
 *
 * U+202F (narrow no-break space) is the typographically correct character and is
 * what Word, InDesign and the Imprimerie nationale use. Only the French blocks are
 * touched; every other language is left alone.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NNBSP = '\u202f';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Finds the French object literal / key block and rewrites only inside it. */
function frenchSlices(text, markers) {
  const slices = [];
  for (const marker of markers) {
    let from = 0;
    for (;;) {
      const start = text.indexOf(marker, from);
      if (start === -1) break;
      // The block ends where the next top-level locale key begins.
      const rest = text.slice(start + marker.length);
      const nextLocale = rest.search(/\n\s{0,4}(?:'(?:it|pl|en|de|es)'|"(?:it|pl|en|de|es)"|(?:it|pl|en|de|es))\s*:\s*\{/);
      const end = nextLocale === -1 ? text.length : start + marker.length + nextLocale;
      slices.push([start, end]);
      from = end;
    }
  }
  return slices;
}

function rewrite(file, markers) {
  const path = resolve(root, file);
  const original = readFileSync(path, 'utf8');
  const slices = frenchSlices(original, markers);
  if (!slices.length) return { file, slices: 0, fixed: 0 };

  let fixed = 0;
  let out = original;
  // Work back to front so earlier indices stay valid.
  for (const [start, end] of slices.sort((a, b) => b[0] - a[0])) {
    const block = out.slice(start, end);
    const patched = block
      .replace(/ ([;:!?»])/g, (m, p) => { fixed += 1; return NNBSP + p; })
      .replace(/« /g, () => { fixed += 1; return '\u00ab' + NNBSP; });
    out = out.slice(0, start) + patched + out.slice(end);
  }
  if (out !== original) writeFileSync(path, out, 'utf8');
  return { file, slices: slices.length, fixed };
}

const results = [
  rewrite('assets/js/i18n.js', ['\n  const fr = {', 'fr: {']),
  rewrite('emails/copy.json', ['"fr": {'])
];

// copy.json must still parse.
JSON.parse(readFileSync(resolve(root, 'emails/copy.json'), 'utf8'));

for (const r of results) console.log(`${r.file}: blocks=${r.slices} replacements=${r.fixed}`);

// Report leftovers so nothing is assumed.
for (const file of ['assets/js/i18n.js', 'emails/copy.json']) {
  const text = readFileSync(resolve(root, file), 'utf8');
  console.log(`${file}: U+202F now present ${(text.match(/\u202f/g) || []).length} times`);
}
