# Prompty do wygenerowania obrazów

Zamiennik dla obecnych ilustracji SVG w `public/assets/images/`.

## Zasady, których się trzymaj

1. **Nie podawaj obrazów AI za zdjęcia z wydarzenia.** Strona ma już podpis
   „Podglądy ilustracyjne" (`gallery.note`) — zostaw go, dopóki nie masz prawdziwych zdjęć.
2. **Format i nazwy plików muszą zostać te same**, inaczej trzeba zmieniać config:

| Plik | Proporcje | Rozmiar do wygenerowania |
|---|---|---|
| `gallery-start.svg` → `gallery-start.webp` | 3:2 | 1800 × 1200 |
| `gallery-race.svg` → `gallery-race.webp` | 2:3 (pionowy) | 1200 × 1800 |
| `gallery-craft.svg` → `gallery-craft.webp` | 3:2 | 1800 × 1200 |
| `gallery-crowd.svg` → `gallery-crowd.webp` | 3:2 | 1800 × 1200 |
| `gallery-finish.svg` → `gallery-finish.webp` | 16:7 (panorama) | 2100 × 900 |

3. Po wygenerowaniu: wrzuć do `public/assets/images/`, potem w panelu sekcja 03
   wpisz nowe ścieżki (`/assets/images/gallery-start.webp` itd.), zapisz draft
   i przenieś do `index.html` zgodnie z sekcją 3 instrukcji.
4. WebP przy jakości 82 daje zwykle 5–8× mniejszy plik niż PNG. Obecne `zjazd.png`
   waży 2,5 MB — to jedyny duży plik na stronie i warto go przekonwertować.

## Wspólny styl (dopisz do każdego promptu)

```
Style: warm documentary photography, late afternoon Mediterranean light,
low contrast film look, natural colours with a slight golden cast,
35mm lens, shallow but not extreme depth of field, visible grain,
no text, no logos, no watermarks, no visible brand names.
Location: small coastal town in northern Sardinia, whitewashed and sand-coloured
buildings, narrow asphalt street descending towards a turquoise sea.
```

## 01 · `gallery-start` — napięcie przed startem

```
A row of handmade wooden gravity carts lined up at the top of a steep narrow
asphalt street in a small Sardinian coastal town. Four riders in mismatched
helmets crouch low on their carts, hands on rope steering, waiting for the
signal. A marshal in a yellow vest stands to the side with an arm raised.
The turquoise sea is visible far below at the end of the street.
Shot from a low angle just behind the start line, wide framing.
```

## 02 · `gallery-race` — grawitacja, zakręty i morze (pionowy)

```
Vertical action photograph of a single handmade wooden gravity cart racing
downhill on a narrow asphalt street, taken from slightly above and behind.
The rider leans hard into a left bend, one foot out as a brake, ball-bearing
wheels blurred with motion. Hay bales and a low stone wall line the corner.
The sea fills the top third of the frame. Motion blur on the road surface,
the rider's face sharp and focused.
```

## 03 · `gallery-craft` — pojazd rodzi się w warsztacie

```
A cluttered small-town garage workshop. Two people, one older and one in their
twenties, assemble a wooden gravity cart on a workbench: pine planks, steel
ball-bearing wheels, a rope for steering and a wooden brake lever. Hand tools,
sawdust and paint tins around them. A single work lamp and daylight from an
open roll-up door. Warm, focused, unposed.
```

## 04 · `gallery-crowd` — całe miasteczko kibicuje

```
Spectators of all ages line both sides of a narrow descending street behind
metal barriers, cheering and filming with phones as a cart passes. Grandparents
on plastic chairs, children on shoulders, laundry hanging from balconies above.
Bunting strung across the street. Late afternoon sun, long shadows.
Photographed from the middle of the road at the height of the crowd.
```

## 05 · `gallery-finish` — meta zmienia się w święto (panorama)

```
Panoramic photograph of the finish area of a downhill cart race on a seaside
promenade. A rider stands on their cart with both arms raised, surrounded by
friends and other competitors, some still wearing helmets. Wooden carts parked
in a row nearby. A simple banner-free finish arch made of scaffolding and
bunting. The white sand beach and turquoise water directly behind.
Golden hour, celebratory, no text anywhere in the image.
```

## 06 · Zdjęcie trasy (opcjonalnie, zamiast `zjazd.png`)

Masz już prawdziwe zdjęcie i **lepiej je zostaw** — to jedyna autentyczna fotografia
na stronie. Jeśli chcesz je tylko poprawić:

```
Enhance without altering the scene: lift shadows on the road surface, keep the
sky and sea highlights, mild dehaze, natural colours. Do not add or remove any
object, building, person or vehicle.
```

Warunek techniczny: kadr **16:9 poziomy**, droga wyraźnie prowadząca ku morzu.
Trasa jest rysowana ręcznie w panelu (sekcja 04), więc po podmianie zdjęcia
trzeba przestawić punkty.

## 07 · Tło hero (opcjonalnie)

Hero nie używa dziś zdjęcia — tylko gradient i figury geometryczne. Jeśli chcesz
tam zdjęcie, potrzebne jest bardzo spokojne, żeby duży napis pozostał czytelny:

```
Very soft, out-of-focus background: the bokeh of a sunlit Mediterranean street
descending to the sea, dominated by cream and pale blue, no recognisable
subject, no faces, no text. Suitable as a background behind large typography.
```

Po dodaniu obowiązkowo sprawdź kontrast napisu `CARRULEDDHI SHOW 2026` —
przy zdjęciu w tle prawdopodobnie trzeba będzie dołożyć przyciemniającą nakładkę.

## Czego nie generować

- osób, które da się rozpoznać jako konkretnych mieszkańców
- dzieci w kadrach głównych, jeśli nie masz zgód
- napisów, logotypów, numerów startowych z prawdziwymi nazwiskami
- rzeczy, których na wydarzeniu nie ma (motocykli, silników, sponsorów)

---

# Dwanaście nagród — kolorowe doodle, nie zdjęcia

Karty nagród mają dziś rysunki wektorowe w `public/assets/images/prizes.svg`, w kadrze
`480 × 320`, czyli **3:2**. I one już są tym, o co chodzi: grube granatowe kontury, płaskie
plamy koloru, zaokrąglone końce linii. Te prompty mają dać **więcej tego samego** — nie
fotografię i nie wizerunek samej nagrody, tylko wesoły, karnawałowy rysunek, który przy niej
pasuje.

Generuj **1500 × 1000**, zapisuj jako WebP albo SVG.

## Blok stylu — dopisz go do KAŻDEGO z dwunastu

To jest najważniejsza część. Bez niego dwanaście kart wyjdzie z dwunastu różnych światów,
a mają wyglądać jak jedna talia.

```
Style: flat vector doodle illustration, hand-drawn feel but clean. Thick uniform outlines
in deep navy (#071a3d), rounded line caps and joins, no gradients, no shading, no texture.
Flat fills from this palette only: warm yellow (#ffc928), coral red (#f6494f),
bright blue (#2469d8), deep blue (#174ea6), cream (#fff6e7), white.
Cream background. Festive carnival energy: confetti flecks, little motion dashes,
small stars and sparks scattered around the subject.
Composition: one clear subject centred, generous empty margin, nothing important in the
outer 12% of the frame — the card has rounded corners and crops the edges.
No text, no numbers, no letters, no logos, no signage anywhere in the image.
No human faces: people appear only as simple silhouettes or from behind.
```

Ostatnie dwie linijki nie są ostrożnością na wyrost. Cyfra wygenerowana przez model wyląduje
obok prawdziwego numeru nagrody i będzie się z nim kłócić, a twarz postawiona przy nazwie
nagrody czyta się jak portret prawdziwego zwycięzcy.

## Dwanaście motywów

Każdy jest *skojarzeniem* z nagrodą, nie jej ilustracją — dokładnie o to prosiłeś.

**01 · Najszybszy Classic**
```
A wooden gravity cart drawn in simple flat shapes, tilted forward as if flying downhill,
with three long speed dashes trailing behind it and a small spark at each wheel.
```

**02 · Najszybszy ART**
```
A patchwork cart made of mismatched coloured panels, leaning into a curve, with a ribbon
of confetti streaming behind it in a long arc.
```

**03 · Carruleddhi Show**
```
A row of festive bunting flags strung across the frame, with three tiny carts rolling
beneath it and confetti falling through the whole scene.
```

**04 · Najbardziej Shardana**
```
A cart deck decorated with Sardinian folk geometry — simple repeating diamonds and zigzags
in coral, navy and cream — with a sprig of myrtle drawn as a few flat leaves at the corner.
```

**05 · Najzabawniejszy Carruleddhu**
```
An absurd cart built from a bathtub on mismatched wheels, a rubber duck on the nose and a
wobbly fin at the tail, with three little laughter squiggles floating above it.
```

**06 · Pokaz specjalny**
```
A cart mid-drift, rear wheels sliding sideways, with a curl of dust drawn as flat rounded
puffs and a scatter of stars along the arc of the slide.
```

**07 · Show Classic**
```
A wooden cart standing still in three-quarter view, a helmet resting on its deck and a
coiled steering rope beside it, with a soft halo of small dashes around the whole group.
```

**08 · Najmłodszy kierowca**
```
A very small cart beside a normal-sized one, with a child-sized helmet sitting on the small
deck and a pair of tiny shoes drawn next to it. Nobody in the frame.
```

**09 · Najstarszy kierowca**
```
An old wooden cart with visible plank lines and a well-worn rope, a flat cap resting on the
seat board, and a few small stars above it. Nobody in the frame.
```

**10 · Najbardziej technologiczny**
```
A cart bristling with improvised engineering drawn as clean flat shapes: a disc brake, a
cable linkage, a dial taped to the deck, three cog wheels floating above it.
```

**11 · Najwolniejszy**
```
A heavy lopsided cart standing still, one wheel smaller than the rest, with a snail drawn
beside it and a single tiny motion dash behind. Affectionate, not mocking.
```

**12 · Największy Carruleddhu**
```
An extra-long cart filling the width of the frame, with a tiny silhouette figure beside it
for scale and a measuring-tape arrow drawn as a simple line with arrowheads underneath.
```

## Zanim wrzucisz pliki

Karty biorą dziś grafikę przez `<use href="#prize-01">` z jednego `prizes.svg`. Podmiana na
osobne obrazy to zmiana znacznika w każdej z dwunastu kart plus nowy styl — czyli osobne
zadanie, nie samo wrzucenie plików.

**Najprościej jednak zostać przy SVG:** jeżeli poprosisz model o wynik wektorowy, nowe rysunki
wchodzą jako kolejne `<symbol id="prize-01">` w tym samym pliku i nie trzeba ruszać ani
jednej linijki `index.html`. Zachowaj `viewBox="0 0 480 320"` w każdym symbolu.
