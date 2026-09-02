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

# Dwanaście nagród — zdjęcia wtopione w kartę

Karty nagród mają teraz miejsce na **zdjęcie**. Wystarczy wrzucić pliki do
`public/assets/images/` jako `prize-01.webp` … `prize-12.webp` — strona sama je podmieni
za rysunek, karta po karcie. Nie ma czego zmieniać w kodzie, a brakujący plik po prostu
zostawia na karcie dotychczasowy rysunek.

**Kadr 3:2, generuj 1500 × 1000, zapisuj jako WebP (jakość 82).**

## Krawędzie gasną — i to zmienia sposób kadrowania

Zdjęcie jest wtopione w kartę miękką maską: pełne w środku, przezroczyste przy brzegach.
Nie ma ramki i nie ma ostrej krawędzi. Dlatego **wszystko, co ważne, musi być w środku
kadru**, a brzegi mają być spokojne — mocna linia albo kontrastowy obiekt przy krawędzi
będzie się rozpływać w połowie i wyglądać na błąd, a nie na zamysł.

## Blok stylu — dopisz go do KAŻDEGO z dwunastu

```
Style: vibrant conceptual doodle art, flat vector illustration style, playful and associative, clean lines, solid bright colors, modern graphic design, not realistic, highly stylized, cool and eye-catching.
Composition: ONE clear central graphic element, centered, filling roughly the middle two thirds of the frame.
The outer edges must stay calm and uncluttered — solid or gently patterned abstract background — because the image fades out towards its borders.
No strong lines, no bright objects and nothing important touching the edge of the frame.
No text, no numbers, no signage, no logos, no watermarks, no faces.
```

Ostatnia linijka nie jest ostrożnością na wyrost. Karta pokazuje **nagrodę**, więc nie chcemy realistycznych twarzy.

## Dwanaście zdjęć, po kolei

**01 · Najszybszy Classic**
```
A stylized doodle of a glowing wooden wheel with speed lines and a stopwatch floating, dynamic and fast.
```

**02 · Najszybszy ART**
```
A colorful doodle of a paintbrush transforming into a rocket-powered cart, splashing vibrant paint.
```

**03 · Carruleddhi Show**
```
A playful doodle of cheering stars and confetti raining over a small abstract racing track.
```

**04 · Najbardziej Shardana**
```
A doodle of a traditional Sardinian geometric pattern forming the shape of a racing helmet.
```

**05 · Najzabawniejszy Carruleddhu**
```
A comical doodle of a rubber duck wearing racing goggles inside a bathtub on wheels.
```

**06 · Pokaz specjalny**
```
A dynamic doodle of a star shooting out of a cloud of sparkly dust, drifting sideways.
```

**07 · Show Classic**
```
A minimalist doodle of an elegant vintage wooden plank with a shining crown on it.
```

**08 · Najmłodszy kierowca**
```
A cute doodle of a tiny racing helmet resting on top of a giant shiny trophy.
```

**09 · Najstarszy kierowca**
```
A wise-looking doodle of a vintage steering rope tied in an elegant, glowing knot.
```

**10 · Najbardziej technologiczny**
```
A technical doodle of glowing neon gears, microchips, and a wrench intersecting dynamically.
```

**11 · Najwolniejszy**
```
A cute and relaxed doodle of a sleepy snail wearing a racing helmet, smiling peacefully.
```

**12 · Największy Carruleddhu**
```
An exaggerated doodle of a ridiculously long stretch-cart that goes on and on, wrapping around a small star.
```

## Jak to sprawdzić po wgraniu

Wrzuć pliki i odśwież stronę. Karta, która ma zdjęcie, podmieni rysunek sama; karta bez
pliku zostanie przy rysunku. Jeśli któreś zdjęcie wygląda na „rozmyte przy brzegu w złym
miejscu", to znak, że coś ważnego stoi za blisko krawędzi — przekadruj albo wygeneruj
jeszcze raz z mocniejszym naciskiem na spokojne brzegi.
