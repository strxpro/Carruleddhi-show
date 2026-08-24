/**
 * Reads the generated blueprint back and asserts the minor branch is really in it.
 *
 * The generator succeeding only proves it produced valid JSON. This proves the
 * things that matter: the guardian columns exist and are at the end, the e-mail
 * switches on isMinor, and the minor body is addressed to the guardian.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const blueprint = JSON.parse(readFileSync(resolve(root, 'make/blueprint-1-instant.json'), 'utf8'));

const modules = [];
const walk = (flow) => {
  for (const node of flow || []) {
    modules.push(node);
    for (const route of node.routes || []) walk(route.flow);
  }
};
walk(blueprint.flow);

const byId = new Map(modules.map((m) => [m.id, m]));
const results = [];
const check = (label, pass, extra = '') => results.push({ label, pass, extra });

// --- sheet row: guardian columns present, and nothing shifted.
const sheets = modules.find((m) => m.module === 'google-sheets:addRow' && m.id === 5);
const values = sheets?.mapper?.values || {};
check('Registrations row has 32 columns', Object.keys(values).length === 32, `got ${Object.keys(values).length}`);
check('column 0 is still created_at (nothing shifted)', String(values['0']).includes('formatDate'));
check('column 5 is still postalCode', String(values['5']).includes('postalCode'), String(values['5']));
check('column 22 is is_minor', String(values['22']).includes('isMinor'), String(values['22']));
check('column 26 is guardian_name', String(values['26']).includes('guardianName'), String(values['26']));
check('column 31 is guardian_consent', String(values['31']).includes('guardianConsent'), String(values['31']));

// --- module 3 carries both bodies and both subjects.
const vars3 = (byId.get(3)?.mapper?.variables || []).reduce((acc, v) => {
  acc[v.name] = v.value;
  return acc;
}, {});
check('module 3 has minHtml', typeof vars3.minHtml === 'string' && vars3.minHtml.length > 4000, `${(vars3.minHtml || '').length} chars`);
check('module 3 has minSubject', Boolean(vars3.minSubject));
check('adult body still present', typeof vars3.regHtml === 'string' && vars3.regHtml.length > 4000);
check('adult body has no leftover anchor', !String(vars3.regHtml).includes('GUARDIAN-ROWS'));

// --- the minor body is addressed to the guardian, not the child.
const min = String(vars3.minHtml || '');
check('minor body greets the guardian', min.includes('{{6.minHi}}'));
check('minor body says whose entry it is', min.includes('{{6.minLead}}'));
check('minor body carries the age sentence', min.includes('{{6.ageNote}}'));
check('minor body has the guardian rows', min.includes('{{1.guardianName}}') && min.includes('{{6.relWord}}'));
check('minor body uses the minors PDF wording', min.includes('{{3.t.minPdfBody}}'));
check('minor body does NOT reuse the adult greeting', !min.includes('{{3.t.regHi}}') && !min.includes('{{6.hi}}'));

// --- module 6 switches everything on isMinor.
const vars6 = (byId.get(6)?.mapper?.variables || []).reduce((acc, v) => {
  acc[v.name] = v.value;
  return acc;
}, {});
for (const key of ['subject', 'html', 'recipient', 'pdfUrl', 'pdfName']) {
  check(`module 6 "${key}" switches on isMinor`, String(vars6[key] || '').includes('1.isMinor'), String(vars6[key] || '').slice(0, 60));
}
check('module 6 resolves the child word', String(vars6.childWord || '').includes('minChild'));
check('module 6 resolves the relation word', String(vars6.relWord || '').includes('minRel'));

// --- the PDF module and the mail follow module 6.
check('PDF module pulls a dynamic URL', String(byId.get(7)?.mapper?.url) === '{{6.pdfUrl}}', String(byId.get(7)?.mapper?.url));
const mail = byId.get(8);
check('mail goes to the resolved recipient', String(mail?.mapper?.to?.[0] ?? mail?.mapper?.to) .includes('6.recipient'), JSON.stringify(mail?.mapper?.to));
check('minors PDF url is in the blueprint', JSON.stringify(blueprint).includes('Carruleddhi-modulo-minori.pdf'));

// --- copy deck has the minor keys in all six languages.
// The deck lives in module 2, not 3: module 2 resolves the locale and holds the
// dictionary, module 3 reads out of it.
const vars2 = (byId.get(2)?.mapper?.variables || []).reduce((acc, v) => {
  acc[v.name] = v.value;
  return acc;
}, {});
const copy = JSON.parse(vars2.copy);
const langs = ['it', 'pl', 'en', 'de', 'es', 'fr'];
const needed = ['minSubject', 'minHi', 'minLead', 'minAgeNote', 'minPdfBody', 'minPrintBody', 'minLabels', 'minRel', 'minChild'];
for (const lang of langs) {
  const missing = needed.filter((key) => !copy[lang]?.[key]);
  check(`copy deck ${lang} complete`, missing.length === 0, missing.join(','));
}

let failed = 0;
for (const { label, pass, extra } of results) {
  if (!pass) failed += 1;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label}${extra && !pass ? `  -> ${extra}` : ''}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
