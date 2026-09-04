/**
 * Zdjecia nagrod: 1024x1024 PNG -> 860 px WebP.
 * ============================================================================
 * PO CO
 *   Dwanascie plikow po okolo polmegabajta to ponad 6 MB na jednej sekcji. Na telefonie
 *   w polu, na LTE, to nie jest "wolniej" — to jest "zdjecia sie nie laduja", bo talia
 *   nagrod wchodzi w kadr razem z reszta strony i dwanascie rownoleglych pobran zapycha
 *   lacze. Zgloszone doslownie tak.
 *
 * DLACZEGO 860, A NIE 1024
 *   Arkusz pokazuje je w `width: min(100%, 430px)` i `max-height: 290px`. 860 to dokladnie
 *   podwojenie szerokosci wyswietlania, czyli zapas na ekran o podwojonej gestosci — i ani
 *   piksela wiecej, bo kazdy nastepny jest pobierany i nigdy nie widziany.
 *
 * DLACZEGO WEBP
 *   Te obrazki to fotografie, a nie grafika z ostrymi krawedziami: PNG zapisuje je
 *   bezstratnie i placi za to kilkukrotnym rozmiarem. Karty kategorii i zdjecie trasy sa
 *   juz w WebP — to dorownuje reszcie strony, a nie wprowadza nowego formatu.
 *
 * PNG-i ZOSTAJA na dysku. Nie kasuje ich stad nic: to jedyne zrodlo, z ktorego da sie
 * wygenerowac inny rozmiar, gdyby uklad kiedys urosl.
 *
 *     node tools/shrink-prize-photos.mjs
 */
import sharp from 'sharp';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'public/assets/images';
const WIDTH = 860;
const kb = (path) => statSync(path).size / 1024;

const sources = readdirSync(dir).filter((name) => /^prize-\d{2}\.png$/.test(name)).sort();
if (!sources.length) {
  console.error('Nie znalazlem zadnego prize-NN.png');
  process.exit(1);
}

let before = 0;
let after = 0;
for (const name of sources) {
  const from = join(dir, name);
  const to = join(dir, name.replace(/\.png$/, '.webp'));
  await sharp(from).resize({ width: WIDTH, withoutEnlargement: true }).webp({ quality: 78 }).toFile(to);
  before += kb(from);
  after += kb(to);
  console.log(`${name.padEnd(14)} ${kb(from).toFixed(0).padStart(4)} kB -> ${kb(to).toFixed(0).padStart(4)} kB`);
}
console.log(`\nrazem ${before.toFixed(0)} kB -> ${after.toFixed(0)} kB (${(100 - (after / before) * 100).toFixed(0)}% mniej)`);
