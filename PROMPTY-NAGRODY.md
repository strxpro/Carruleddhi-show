# Prompty do grafik dwunastu nagród

Do slotu `.prize-card__art` w sekcji „Dwanaście nagród" (`index.html`, karty
`data-prize-card`). Dziś w każdej karcie siedzi symbol z `public/assets/images/prizes.svg`:

```html
<div class="prize-card__art">
  <svg viewBox="0 0 480 320" aria-hidden="true"><use href="/assets/images/prizes.svg#prize-01"></use></svg>
</div>
```

## Format — jedna liczba, której trzeba się trzymać

| Co | Wartość |
|---|---|
| Proporcje | **3 : 2** (viewBox `480 × 320`) |
| Rozmiar do wygenerowania | **1200 × 800** |
| Format docelowy | `.webp`, jakość 82 |
| Nazwy plików | `prize-01.webp` … `prize-12.webp` |
| Katalog | `public/assets/images/` |
| Największy render | 352 × 168 px na telefonie, przy DPR 3 to 1056 × 504 — dlatego 1200 px szerokości wystarcza z zapasem, a 1800 px byłoby wyrzuconą pamięcią |

Kadr jest **przycinany** (`.prize-card__art { overflow: hidden }`) i na telefonie skraca się
do 132–168 px wysokości. Trzymaj temat w środkowych dwóch trzecich wysokości — góra i dół
mogą zniknąć.

## ⚠️ Zanim podmienisz SVG na zdjęcia — przeczytaj

Sekcja nagród to dokładnie to miejsce, w którym strona wywalała się na telefonie. Powód był
w pamięci graficznej, nie w JavaScripcie: dwanaście dużych warstw kompozytora naraz. Zejście
z 251 do 60 warstw i z 5,50 do 2,51 Mpx powierzchni to jest ta naprawa.

Dwanaście obrazków 1056 × 504 zdekodowanych naraz to **25,6 MB** samych bitmap
(1056 × 504 × 4 B × 12). Obecny `prizes.svg` to jeden plik 10 kB. Jeśli podmieniasz,
zrób to tak:

```html
<div class="prize-card__art">
  <img src="/assets/images/prize-01.webp" alt="" width="1200" height="800"
       loading="lazy" decoding="async">
</div>
```

`loading="lazy"` jest tu warunkiem, nie ozdobą — talia maluje jednocześnie 8 kart z 12,
więc bez tego przeglądarka dekoduje wszystkie dwanaście, zanim ktokolwiek je zobaczy.
Po podmianie uruchom pomiar i porównaj z liczbami wyżej:

```
node tools/cdp.mjs probe tools/probe-c-prizes-memory.js --w 390 --h 844 \
     --origin http://127.0.0.1:4173 --wait 2500
```

Jeśli `peak.layerAreaMpx` skoczy powyżej ~4, wróć do SVG albo zejdź z rozmiarem eksportu.

## Wspólny styl — dopisz do każdego promptu

```
Style: bold flat vector illustration, carnival poster energy, thick confident
outlines, chunky simplified shapes, no gradients except one soft light wash,
slightly off-register print look like a silkscreen.
Palette, strictly these: deep navy #071a3d, mid blue #2469d8, pale blue #bcd6ff,
cream #fff6e7, carnival yellow #ffc928, orange #ff6b35, coral #f6494f,
green #28b67a.
Background: solid cream #fff6e7 or pale blue #bcd6ff, never white, never a photo.
Subject centred, generous breathing room, composition readable at 350 px wide.
No text, no numbers, no letters, no logos, no watermarks, no signatures.
Setting cues: handmade wooden gravity cart (four ball-bearing wheels, plank deck,
rope steering, no engine), narrow descending street, northern Sardinian coastal
town, turquoise sea on the horizon.
```

Powód takiego stylu, nie fotografii: to są **kategorie**, nie zdjęcia zwycięzców.
Zwycięzca dostaje twarz i nazwę z panelu po ogłoszeniu wyników. Gdyby kafelek kategorii
był zdjęciem człowieka, czytałby się jak wynik, którego jeszcze nie ma.

---

## 01 · Najszybszy Classic — `prize.1`

```
A handmade wooden gravity cart in classic build seen from a low front-three-quarter
angle, mid-run downhill, speed streaks trailing behind it. The rider is crouched
flat over the deck, helmet forward, hands on the rope. Yellow #ffc928 speed lines
radiate outward. Two hay bales blur past on the left. Deep navy cart body, coral
#f6494f wheels.
```

## 02 · Najszybszy ART — `prize.2`

```
A wildly decorated art-class gravity cart mid-run downhill: the same wooden chassis
underneath, but dressed as a moving sculpture with painted panels, ribbons and a
cardboard fin. Motion streaks in orange #ff6b35. The rider's arms are wide.
Playful, off-balance, clearly fast. Pale blue #bcd6ff background.
```

## 03 · Carruleddhi Show — `prize.3`

```
A single gravity cart on a stage-like patch of street with three spotlight cones
falling on it from above in carnival yellow #ffc928. The rider stands beside the
cart with one arm raised. Confetti flecks in coral and green. The composition reads
like a curtain call: the cart is the star, everything else is dark navy #071a3d.
```

Bez rocznika w kadrze. Ta nagroda wraca w każdej edycji, a przy wynikach archiwalnych
data w grafice kłamałaby — ten sam powód, dla którego nazwa nie ma `2026`.

## 04 · Największy Carruleddhu — `prize.4`

```
An oversized gravity cart, comically long and tall, taking up almost the whole frame,
with a small rider perched high on top and three friends pushing at the back.
A normal-sized cart sits tiny in the corner for scale. Side-on view, flat shapes,
navy #071a3d body with yellow #ffc928 trim, cream background.
```

## 05 · Najzabawniejszy Carruleddhu — `prize.5`

```
A gravity cart built as a joke: a bathtub on plank wheels with a rubber-duck prow,
a striped awning and a flag. The rider grins wide, one leg dangling out. Three
onlookers double over laughing at the edge of the frame. Bright coral #f6494f and
yellow #ffc928, pale blue #bcd6ff background.
```

## 06 · Pokaz specjalny — `prize.6`

```
A gravity cart at the peak of a jump, all four wheels off the ground, rider standing
on the deck with both arms out like a gymnast. A ramp of planks below, streamers
trailing. Green #28b67a and yellow #ffc928 burst shapes behind the cart to mark the
apex. Low camera looking up, deep navy #071a3d background so the burst reads.
```

## 07 · Show Classic — `prize.7`

```
A classic-build gravity cart polished to a shine, presented three-quarter view on a
low plinth of stone kerb, one wheel turned out to show the ball bearings. A hand
with a cloth is buffing the deck. Restrained and proud, not comic. Navy #071a3d and
cream #fff6e7 with a single yellow #ffc928 pinstripe along the deck.
```

## 08 · Najmłodszy kierowca — `prize.8`

```
A very small child in an oversized helmet sitting on a gravity cart that is clearly
too big, feet nowhere near the deck edge, gripping the rope with both fists and
beaming. An adult's hand steadies the cart from behind. Warm cream #fff6e7
background, yellow #ffc928 helmet, coral #f6494f cart.
```

Twarz stylizowana i nierozpoznawalna. Sekcja jest publiczna, a to jest kategoria dla
dziecka — nie generuj czegoś, co da się wziąć za portret konkretnej osoby.

## 09 · Najstarszy kierowca — `prize.9`

```
An elderly rider with a flat cap over a helmet strap, weathered face, sitting upright
and unbothered on a gravity cart, one hand on the rope, the other resting on the knee.
Calm, dignified, faintly amused. Pale blue #bcd6ff background, navy #071a3d cart,
green #28b67a cap.
```

## 10 · Najbardziej technologiczny — `prize.10`

```
A gravity cart bristling with homemade gadgetry: a bicycle-computer taped to the deck,
a cable-tied action camera on a stick, an exposed brake lever with a spring, a small
solar panel. Thin blue #2469d8 schematic lines and dashed callout arcs float around
it without any text or numbers. Cream background, exploded-diagram feel.
```

Żadnych cyfr i liter w kadrze — na kartach są już własne numery `01`…`12` i tytuł
kategorii w sześciu językach. Napisy w grafice zderzyłyby się z jednym i z drugim.

## 11 · Najwolniejszy — `prize.11`

```
A gravity cart barely moving on a gentle slope, a snail sitting on the front edge of
the deck looking back at the rider. The rider shrugs, entirely at peace. A cloud of
dust that never formed. Soft green #28b67a and cream #fff6e7, one coral #f6494f
wheel. Wide empty street ahead, nobody in a hurry.
```

## 12 · Najbardziej Shardana — `prize.12`

```
A rider standing tall beside a gravity cart, wearing a stylised nuragic-warrior nod:
a horned helmet silhouette, a round shield resting against the cart wheel, a short
cloak. Behind, the cone of a nuraghe stone tower and the turquoise sea. Heroic
poster framing, deep navy #071a3d and yellow #ffc928, cream background.
```

Trop sardyński, nie kostium historyczny w skali 1:1. Kategoria nagradza „bycie
najbardziej Shardana", a nie rekonstrukcję — grafika ma być ukłonem, nie ilustracją
z podręcznika.

---

## Po wygenerowaniu

1. Skonwertuj do WebP jakość 82, sprawdź, że żaden plik nie przekracza ~120 kB.
2. Wrzuć do `public/assets/images/`.
3. Podmień dwanaście `<div class="prize-card__art">` w `index.html` na `<img>` z
   `loading="lazy" decoding="async"` (wzór wyżej).
4. `npm run check` i `npm run build`.
5. Pomiar pamięci z sekcji ostrzeżenia — porównaj `peak.layerAreaMpx` przed i po.
6. Oryginały (PNG/duże) idą do `source-images/`, nie do `public/`.
