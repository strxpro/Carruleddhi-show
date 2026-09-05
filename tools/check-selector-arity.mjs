/**
 * Czy gdzieś nie wywołujemy `.forEach` na `$()`, które zwraca JEDEN element.
 * ===========================================================================
 * `$` oddaje pojedynczy element, `$$` listę. `$(...).forEach` to zawsze błąd — i to błąd
 * kosztowny, bo wywraca CAŁY moduł przy starcie: `initialize()` łapie wyjątek per moduł
 * i wypisuje „X failed to initialise", a reszta strony działa dalej. Zepsute zostaje
 * dokładnie to jedno, czego nikt nie sprawdza.
 *
 * Wpadłem w to dwa razy w jednej sesji, oba razy z tego samego powodu: przy podmianie
 * tekstu w pliku `String.replace` traktuje `$$` w treści zastępującej jako znak ucieczki
 * i wstawia pojedyncze `$`. Zamiana jest cicha — kod nadal się parsuje.
 */
import { readFileSync, readdirSync } from 'node:fs';

const katalog = new URL('../assets/js/', import.meta.url);
const pliki = readdirSync(katalog).filter((n) => n.endsWith('.js'));

let bledow = 0;
for (const nazwa of pliki) {
  const tekst = readFileSync(new URL(nazwa, katalog), 'utf8');
  tekst.split('\n').forEach((linia, i) => {
    /* `$(` niepoprzedzone drugim `$`, a po nawiasie zamykającym `.forEach` albo `.map`. */
    if (/(^|[^$\w])\$\([^)]*\)\s*\.\s*(forEach|map|filter)\b/.test(linia)) {
      bledow += 1;
      console.error(`  ZLE  assets/js/${nazwa}:${i + 1}`);
      console.error(`       ${linia.trim().slice(0, 100)}`);
      console.error('       `$` oddaje jeden element — do listy jest `$$`.');
    }
  });
}

if (bledow) {
  console.error(`\ncheck-selector-arity: ${bledow} wywolan listowych na pojedynczym elemencie.`);
  process.exit(1);
}
console.log(`${pliki.length}/${pliki.length} passed (selektory jedno- i wieloelementowe)`);
