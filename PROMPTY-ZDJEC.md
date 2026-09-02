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

# Dwanaście nagród — prompty do kart

Karty nagród mają dziś grafiki wektorowe (`prizes.svg#prize-01` … `#prize-12`) w kadrze
`480 × 320`, czyli **3:2**. Generuj **1500 × 1000** i zapisuj jako WebP.

**Do każdego promptu dopisz wspólny blok stylu z góry tego pliku.** Bez niego dwanaście
kart wyjdzie z dwunastu różnych światów — a mają wyglądać jak jedna seria zdjęć z jednego
popołudnia.

**Trzy rzeczy wspólne dla wszystkich dwunastu**, dopisane do bloku stylu:

```
Composition: single clear subject, generous empty space around it, nothing important
in the outer 12% of the frame — a rounded card crops the edges.
No text, no numbers, no signage, no logos anywhere in the image.
No recognisable faces in close-up: shoot from behind, from the side, or from the waist down.
```

Ostatnia linijka nie jest ostrożnością na wyrost. Te karty pokazują nagrody, a nie
konkretnych ludzi — twarz wygenerowana przez model, postawiona przy nazwie nagrody,
czyta się jak zdjęcie prawdziwego zwycięzcy.

## 01 · Najszybszy Classic

```
A wooden gravity cart mid-run on a descending asphalt street, shot from a low side angle
with the camera panning so the road blurs and the cart stays sharp. Bare wooden frame,
solid wheels, rider crouched low and seen from behind. Late afternoon light raking across
the tarmac.
```

## 02 · Najszybszy ART

```
A brightly painted homemade cart at full speed on a descending street, seen from a low
side angle with motion blur in the background. The bodywork is folk-art colourful,
clearly hand-built from salvaged panels. Rider low over the frame, seen from behind.
```

## 03 · Carruleddhi Show

```
A wide view of a village street closed for the event: carts lined along one side, bunting
between the buildings, people watching from doorways and low walls. Shot from a first-floor
window looking down the slope towards the sea. Nobody in close-up.
```

## 04 · Największy Carruleddhu

```
An unusually large handmade wooden cart parked in a square, long enough that two people
would fit on it, photographed from a low front three-quarter angle so its length reads
against the small buildings behind. A folded jacket on the deck gives the scale.
```

## 05 · Najzabawniejszy Carruleddhu

```
A joyfully absurd homemade cart standing alone in a square: a bathtub shell mounted on
bicycle wheels, a painted wooden fin at the tail, a rubber duck wired to the front axle.
Bright mismatched colours, brush strokes visible. No rider.
```

## 06 · Pokaz specjalny

```
A handmade cart caught mid-drift on a corner, rear wheels sliding, a plume of dust rising
behind it. Straw bales and a marshal's yellow vest blurred at the edge of the frame.
Rider seen from behind, one arm out for balance.
```

## 07 · Show Classic

```
A traditional wooden cart standing on the start line in the last minutes before the run:
rope steering laid neatly over the deck, a worn helmet resting on the plank, one hand
adjusting a wheel at the edge of the frame. Warm side light, long shadow.
```

## 08 · Najmłodszy kierowca

```
A very small handmade cart beside a normal one, its deck barely longer than a school bag,
with a child-sized helmet sitting on it. A child's legs and trainers visible at the top
edge of the frame, face out of shot. Quiet and warm, not staged.
```

## 09 · Najstarszy kierowca

```
Weathered hands resting on the rope steering of an old wooden cart, photographed close
enough to read the grain of the wood and the wear on the rope. Face out of frame.
The cart looks decades old and well kept.
```

## 10 · Najbardziej technologiczny

```
A handmade cart bristling with improvised engineering: a bicycle disc brake on the rear
axle, a cable-operated steering linkage, a speedometer taped to the deck, zip ties and
hose clamps everywhere. Shot from above at a slight angle so the mechanisms read clearly.
```

## 11 · Najwolniejszy

```
A heavy, slightly lopsided homemade cart standing still on a gentle part of the slope,
one wheel visibly smaller than the others. Long afternoon shadow stretching ahead of it
down the empty street. Nobody in the frame. Affectionate, not mocking.
```

## 12 · Najbardziej Shardana

```
A handmade cart decorated in Sardinian folk motifs: hand-painted geometric patterns in
red, black and cream along the deck, a strip of traditional woven cloth tied to the frame,
a sprig of dried myrtle wedged behind the seat board. Parked against a whitewashed wall
in low sun.
```

## Po wygenerowaniu

Karty biorą dziś grafikę z jednego pliku `prizes.svg` przez `<use href="#prize-01">`.
Podmiana na zdjęcia to zmiana w znaczniku każdej karty w `index.html` (`<svg><use>` na
`<img>`) plus styl na nowej klasie — czyli osobne zadanie, nie samo wrzucenie plików.
Zdjęcia zapisz w `public/assets/images/` jako `prize-01.webp` … `prize-12.webp`.
