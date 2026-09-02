import { readFileSync } from 'node:fs';
const raw = readFileSync(process.argv[2]);
const text = raw.includes(0x00) ? raw.toString('utf16le').replace(/^\uFEFF/, '') : raw.toString('utf8').replace(/^\uFEFF/, '');
const d = JSON.parse(text);
const only = process.argv[3];
console.log('errors', d.consoleErrors);
for (const p of d.points) {
  if (only && !p.label.includes(only)) continue;
  console.log(`\n[${p.label}] y=${p.y} heapKb=${p.heapKb} dom=${p.domNodes} layers=${p.layerCandidates} area=${p.layerAreaMpx}`);
  for (const [k, v] of Object.entries(p.layers)) {
    console.log(`  ${k.padEnd(16)} n=${String(v.count).padStart(3)} area=${v.areaMpx} :: ` +
      v.biggest.map((b) => `${b.sel} ${b.w}x${b.h}`).join(' | '));
  }
  console.log('  deck ' + JSON.stringify(p.deck));
}
console.log('\ndelta', JSON.stringify(d.delta), '\npeak', JSON.stringify(d.peak));
console.log('counters', d.counterAfterForward, d.counterAfterBack);
