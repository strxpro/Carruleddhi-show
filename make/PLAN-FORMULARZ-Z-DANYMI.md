# Formularz z wypełnionymi danymi — projekt, zanim ktoś zacznie pisać

Stan na 29.08.2026. Dokument opisuje **jak to zrobić i czego nie robić**, bo trzy
oczywiste podejścia rozbijają się o rzeczy, których nie widać z fotela.

---

## Czego chce użytkownik

Dziś do maila z potwierdzeniem dokleja się **pusty** formularz. Uczestnik wypełnia go
długopisem. Przy pięćdziesięciu zgłoszeniach to pięćdziesiąt okazji do nieczytelnego
nazwiska i pomyłki w dacie urodzenia — a to jest dokument, który organizator sprawdza
przy starcie.

Chcemy: formularz przychodzi z już wpisanymi danymi tej osoby, do podpisania i tyle.

---

## Dlaczego jest pusty — to nie jest przeoczenie

W `tools/build-pdfs.mjs` stoi powód:

> Poprzedni generator wpisywał „Marco Rossi" i wysyłał to wszystkim — każdy uczestnik
> dostawał formularz z cudzym nazwiskiem, adresem i telefonem.

Dziś istnieje **czternaście statycznych plików** (2 grupy wiekowe × 6 języków + 2 nazwy
zgodnościowe). Make dokleja do maila ten sam plik wszystkim. Jeden plik nie może nieść
danych jednej osoby — i dopóki plik jest jeden, każda próba wypełnienia go kończy się
wysłaniem cudzych danych.

Żeby formularz był wypełniony, musi powstawać **przy każdym zgłoszeniu**.

---

## Trzy podejścia i dlaczego dwa odpadają

### ❌ Biblioteka PDF w funkcji (pdf-lib, jsPDF)

Szablon to HTML z `@page`, `dl/dd`, siatką i justowaniem. Biblioteki PDF rysują
prymitywami: linia, prostokąt, tekst w punkcie. Przepisanie znaczy odtworzenie całego
układu od zera — i utratę tego, że **wszystkie czternaście plików mieści się teraz na
jednej stronie** (commit `c17e783`), co kosztowało dwa przebiegi pomiarów.

### ❌ Zewnętrzna usługa HTML → PDF

Działa, ale to kolejny klucz w Vercelu, kolejny limit do wyczerpania i kolejny dostawca,
który może odmówić ze statusem 200. Dziś jeden taki już mamy — CallMeBot z wyczerpanym
limitem, który przez dobę raportował sukces i nic nie wysyłał.

### ✅ Wypełniona strona do druku pod adresem z tokenem

Uczestnik dostaje w mailu link. Otwiera go, widzi swoje dane w tym samym układzie co PDF
i drukuje albo zapisuje jako PDF jednym ruchem — każda przeglądarka i każdy telefon ma to
w menu druku.

Zero nowych zależności, ten sam szablon, ten sam wynik na papierze. Pusty PDF zostaje
w załączniku dla tych, którzy wolą wypełnić ręcznie.

---

## Cztery kroki i przeszkody w każdym

### 1. Szablony muszą trafić do funkcji

`emails/pdf-print.html` i `pdf-print-minor.html` czyta **wyłącznie** generator na dysku
autora (`tools/build-pdfs.mjs`, linia ~219). Funkcja na Vercelu ich nie widzi.

`tools/build-make-blueprints.mjs` robi już dokładnie taką rzecz dla maili — kompiluje je
do `worker/email-templates.js`. Trzeba dołożyć te dwa szablony tą samą drogą.

**Uwaga:** to podnosi rozmiar bundla funkcji o ~25 kB. Mieści się, ale warto wiedzieć.

### 2. API jest POST-only, a link z maila to GET

`worker/index.js:4031`:

```js
if (request.method !== 'POST') return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405, cors);
```

Ta linia jest słuszna — chroni wszystkie pozostałe trasy przed wywołaniem z paska adresu.
Potrzebny jest **jeden wyjątek**, wpisany przed nią i tylko dla tego typu:

```js
// GET wolno dokladnie jednemu typowi: strona do druku jest linkiem w mailu,
// a linku w mailu nie da sie wyslac POST-em.
if (request.method === 'GET' && pathType === 'form') return printableForm(env, url, cors);
```

`pathType` jest dziś liczony **po** tej linii — trzeba go przenieść wyżej. Przepisanie
w `vercel.json` (`/api/carruleddhi/:type`) działa dla każdej metody, więc routing jest już
gotowy.

### 3. Token — bez nowej kolumny

`registrations` nie ma kolumny na token i nie trzeba jej dodawać. Token liczony jako
HMAC z `WALL_SALT`:

```
t = base64url(HMAC-SHA256(WALL_SALT, 'print:' + registration.id)).slice(0, 32)
```

Adres: `/api/carruleddhi/form?id=<uuid>&t=<token>`.

Serwer przelicza HMAC z `id` i porównuje — nie trzeba nic zapisywać ani odwracać.
Rotacja `WALL_SALT` unieważnia wszystkie linki naraz, co jest właściwym zachowaniem.

**Nie da się tu użyć samego `id`**: uuid w URL-u znaczy, że każdy, kto zna cudze uuid
(a ono jest w panelu i w logach), otwiera cudzy formularz z adresem i telefonem.

**Bez migracji celowo** — `apply_migration` bywa niedostępne, a ta funkcja nie powinna
od tego zależeć.

### 4. Link w mailu, w sześciu językach

Nowy klucz w `emails/copy.json` (`regFormLink`) i pole `formUrl` liczone w
`attachCopy()` w `worker/index.js`. Stamtąd trafia do szablonu maila.

**Uwaga na webhook Make:** nowe pole musi wejść do struktury, inaczej `{{1.formUrl}}`
będzie puste. Make **nie sumuje** struktur między wywołaniami — patrz krok 5c
w `START-TUTAJ.md`.

---

## Czego nie przeoczyć przy testowaniu

1. **Nieletni ma dwa szablony.** `pdf-print-minor.html` niesie blok opiekuna. Link musi
   wybierać szablon po `is_minor`, tak jak robi to trasa maila.
2. **Wypełniony formularz jest dłuższy niż pusty.** Puste pola są dziś linią do pisania;
   wpisane „Via Giuseppe Verdi 12, 07028 Santa Teresa Gallura (SS)" może się zawijać.
   Po zbudowaniu **zmierzyć liczbę stron ponownie** — formularz nieletniego siedzi już
   na 8 pt i nie ma zapasu.
3. **Zgłoszenie wycofane.** `status = 'withdrawn'` ma zwracać 410, a nie formularz —
   inaczej ktoś drukuje kartę startową po rezygnacji.
4. **Nagłówki.** `X-Robots-Tag: noindex` i `Cache-Control: private, no-store`. To jest
   strona z czyimś adresem i telefonem; nie ma prawa trafić do wyszukiwarki ani do cache
   pośrednika.

---

## Czego ten plan NIE rozwiązuje

Załącznik w mailu zostaje pusty. Jeśli wymagane jest, żeby **załącznik** był wypełniony,
wraca podejście z zewnętrzną usługą HTML → PDF i trzeba świadomie przyjąć jego koszt.
Link daje ten sam efekt na papierze, ale nie jest plikiem w skrzynce.

To jest decyzja użytkownika, nie implementacji — i dlatego nie została podjęta tutaj.
