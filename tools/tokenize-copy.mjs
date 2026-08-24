/**
 * One-off: copy.json used Handlebars-style {{ params.x }} placeholders left over
 * from the Brevo draft. Make would either try to evaluate those braces as its own
 * expression or print them verbatim in the e-mail. Neither is acceptable, so the
 * placeholders become %TOKEN%, which Make's replace() can substitute safely.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = resolve(root, 'emails/copy.json');

let text = readFileSync(file, 'utf8');
const before = (text.match(/\{\{ params\./g) || []).length;

text = text.replace(/\{\{ params\.([A-Za-z]+) \}\}/g, (_, name) => `%${name.toUpperCase()}%`);

const after = (text.match(/\{\{/g) || []).length;
JSON.parse(text); // fails loudly if the rewrite broke the file
writeFileSync(file, text, 'utf8');

console.log(`placeholders rewritten: ${before}`);
console.log(`remaining "{{" in copy.json: ${after}`);
console.log('tokens now present:', [...new Set(text.match(/%[A-Z]+%/g) || [])].join(' '));
