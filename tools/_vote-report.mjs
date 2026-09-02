/* Tymczasowy czytnik wyniku sondy — usuwany po weryfikacji. */
import { readFileSync } from 'node:fs';
let buf = readFileSync(process.argv[2]);
if (buf[0] === 0xff || buf[0] === 0xfe) buf = Buffer.from(buf.toString('utf16le'), 'utf8');
const text = buf.toString('utf8').replace(/^\uFEFF/, '');
const j = JSON.parse(text);
console.log('viewport', j.viewport, 'pointer', JSON.stringify(j.pointer), 'cards', j.cards);
console.log('NIEZALICZONE:', (j.fail || []).length);
(j.fail || []).forEach((f) => console.log('  FAIL ' + f));
console.log('POMIARY:');
Object.entries(j.measures || {}).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
if (process.argv[3] === 'all') {
  console.log('KROKI:');
  (j.steps || []).forEach((s) => console.log('  ' + s));
  console.log(JSON.stringify({ rest: j.rest, step1: j.step1, step2: j.step2, cancel: j.cancel, backdrop: j.backdrop, afterPoll: j.afterPoll, dialog: j.dialog, afterVote: j.afterVote, change: j.change }, null, 1));
}
