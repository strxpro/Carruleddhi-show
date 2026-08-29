# B2 — zgoda na newsletter przy komentarzu

Stan: **teksty gotowe, okablowanie nie.** Sesja TOR B ma w swoim zakresie tylko
`emails/copy.json` i dwa szablony `make-*`, a reszta B2 leży w plikach należących do
innych torów. Ta notatka mówi, co dokładnie zostało do zrobienia i gdzie.

## Co już jest w repo

Sześć języków w `emails/copy.json`, po jednym komplecie na `it / pl / en / de / es / fr`:

| klucz | do czego |
|---|---|
| `wallSubject` | temat listu z podziękowaniem za komentarz |
| `wallLead` | pierwszy akapit — „twój komentarz jest na ścianie" |
| `wallBody` | jak zmienić albo usunąć wpis (odpowiedz na maila) |
| `newsLeadWall` | wariant `newsLead` dla zapisu **z komentarza** |

Powitanie bierz z istniejącego `newsHi` — niesie `%FIRSTNAME%`, więc musi przejść przez
`fill()`, tak samo jak `regHi`. Stopkę z odsyłaczem do rezygnacji bierz z `unsubFooter`.

### Dlaczego osobny `newsLeadWall`, a nie `newsLead`

Istniejący `newsLead` brzmi „**wraz ze zgłoszeniem** poprosiłeś, żebyśmy dali znać…".
Ktoś, kto tylko zostawił komentarz, niczego nie zgłaszał. Wysłanie mu tamtego zdania to
powiedzenie człowiekowi, że zapisał się przy rejestracji, której nie było — czyli dokładnie
ta klasa błędu, przed którą ostrzega `ZADANIA-ROWNOLEGLE.md`: wygląda dobrze, aż ktoś
przeczyta. `newsLeadWall` mówi „zostawiając komentarz".

## Co zostało do zrobienia, plik po pliku

### 1. `index.html` — formularz (**tor C**)

W `<form class="wall-form" data-wall-form>`, obok `#wall-name` i `#wall-place`:

- `<input id="wall-email" name="email" type="email" autocomplete="email" maxlength="120">`
  — **nieobowiązkowy**. Komentarz bez adresu ma nadal przechodzić.
- `<input type="checkbox" id="wall-news" name="newsConsent">` z etykietą i `data-i18n`.
  Domyślnie **odznaczony**. Zaznaczony bez adresu nie ma sensu — albo blokuj wysłanie
  z komunikatem, albo odsłaniaj checkbox dopiero, gdy pole adresu nie jest puste.

### 2. `assets/js/i18n.js` — etykiety (niczyj, uzgodnić)

Klucze na etykietę pola, etykietę zgody i podziękowanie na ekranie. To słownik **strony**,
osobny od `emails/copy.json`; `tools/check-i18n.mjs` sprawdza, czy każdy klucz
z `data-i18n` rozwiązuje się we wszystkich sześciu językach, więc niepełny komplet
zatrzyma `npm run check`.

### 3. `assets/js/app.js` — wysyłka (**tor A**)

W handlerze `[data-wall-form]` dołóż `email` i `newsConsent` do ciała żądania `wall-post`.

### 4. `worker/index.js` — zapis i listy (**tor A / poza `attachCopy()`**)

W handlerze `wall-post`:

1. Zapisz komentarz jak dotąd (adres **nie** idzie na ścianę publicznie — `wallList()`
   nie może go zwracać).
2. Jeśli jest adres → list z `wallSubject` / `wallLead` / `wallBody` przez `outbox`.
3. Jeśli dodatkowo `newsConsent` → wiersz w `newsletter_subscribers` (ta sama ścieżka,
   z której korzysta `newsConsent` przy rejestracji, ok. linii 3658) i list
   z `newsLeadWall` zamiast `newsLead`.

Szablon listu: `newsletterOptInHtml()` w `tools/build-make-blueprints.mjs` przyjmuje dziś
`newsLead` na sztywno — potrzebuje parametru albo drugiego wariantu.

### 5. Sprawdzenie **skutku**, nie odpowiedzi

Zgodnie z uwagą zamykającą `ZADANIA-ROWNOLEGLE.md` — pięć razy w ciągu doby zdarzyło się
tu, że funkcja zgłaszała sukces i nic nie robiła. Po wdrożeniu:

- komentarz z adresem i zgodą → **wiersz w `newsletter_subscribers`** w Supabase,
- komentarz z adresem bez zgody → **brak** wiersza, ale list z podziękowaniem wychodzi,
- komentarz bez adresu → przechodzi, żadnego listu,
- `wall` w API nie zwraca adresu w żadnej odpowiedzi.

`ok: true` nie znaczy, że coś się zapisało.

## Uwaga niezależna od kodu

Dopóki w OVH nie ma DKIM i DMARC, ten list — jak każdy inny z tej strony — poleci do
spamu. Patrz nagłówek `ZADANIA-ROWNOLEGLE.md`.
