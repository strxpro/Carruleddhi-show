# Make.com — jeden scenariusz, zero routerów

Odpowiedź na pytanie „jak wysłać do Make jeden zestaw danych, zamiast budować router
i kopiować wszystko po kolei".

---

## 1. Skąd bierze się router i jak go usunąć

Router w Make jest potrzebny tylko wtedy, gdy dla różnych żądań mają się wykonać
**różne moduły**. Jeśli moduły są te same, a różnią się jedynie **wartościami**,
router jest zbędny — wystarczą trzy mechanizmy:

| Zamiast | Użyj |
|---|---|
| gałąź „registration / reminder / contact" | **filtr na module** (klik na linii między modułami) |
| osobny szablon Brevo na każdy język | jedna zmienna JSON + `get()` |
| osobny szablon Brevo na 7d / 1d / 3h | jeden szablon + `switch()` w parametrach |
| dwa moduły Google Docs (IT + tłumaczenie) | **Iterator** po dwóch elementach |

Efekt: **jeden webhook, jeden scenariusz, ~11 modułów w jednej linii.**

Dodatkowo Worker z katalogu `worker/` już **normalizuje** dane: odsiewa nieznane pola,
sprawdza zgody i wymusza `type` ze ścieżki URL. Do Make trafia zawsze ten sam, płaski
kształt JSON — więc w Make nie musisz nic sprawdzać ani przepisywać.

---

## 2. Scenariusz A — `Carruleddhi 2026 — Intake`

Jedna linia modułów. Numery odpowiadają kolejności na kanwie.

```
[1] Webhooks · Custom webhook
     │
[2] Tools · Set variable        →  copy   = cała treść emails/copy.json
     │
[3] Tools · Set multiple variables
     │      loc        = if(contains("it,pl,en,de,es,fr"; 1.locale); 1.locale; "it")
     │      t          = get(parseJSON(2.copy); loc)          ← teksty w języku klienta
     │      tIt        = get(parseJSON(2.copy); "it")         ← teksty włoskie
     │      ev         = get(parseJSON(2.copy); "_event")
     │      fullName   = 1.firstName + " " + 1.lastName
     │      generated  = formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")
     │
[4] Google Sheets · Add a row  →  arkusz "Registrations"   (filtr: type = registration)
     │
[5] Tools · Set variable       →  raceNumber = formatNumber(4.__ROW_NUMBER__ + 37; 0)
     │                            (numer = numer wiersza; sekwencja bez licznika)
[6] Webhooks · Webhook response  →  {"ok":true,"raceNumber":"{{5.raceNumber}}"}
     │
[7] Tools · Iterator           →  {{ add(emptyarray; "it"; 3.loc) }}
     │                            2 przebiegi: kopia IT + kopia w języku klienta
[8] Google Docs · Create a document from a template
     │      Template ID: switch(7.value; "it"; TEMPLATE_IT; TEMPLATE_TRANSLATED)
     │      Wartości:  {{RACE_NUMBER}} … {{CART_NOTES}}     (zawsze te same)
     │      Etykiety:  {{L_FULL_NAME}} = get(get(parseJSON(2.copy); 7.value).labels; "fullName")  …
     │
[9] Google Drive · Download a file  →  format: PDF
     │
[10] Tools · Array aggregator   →  zbiera oba PDF-y w jedną tablicę załączników
     │
[11] Brevo · Send a transactional email
     │      Template: 1 (registration)   ← jeden szablon dla wszystkich 6 języków
     │      Attachments: {{10.array}}     ← oba PDF-y naraz
     │
[12] WhatsApp Business Cloud · Send a template message   (filtr: type = registration)
     │
[13] Google Sheets · Update a row   →  status = confirmed, pdf_url, email_status
```

### Filtry zamiast gałęzi routera

Klikasz na łącznik przed modułem i ustawiasz warunek:

| Przed modułem | Filtr |
|---|---|
| [4] Add a row „Registrations" | `type` **equals** `registration` |
| [7] Iterator | `type` **equals** `registration` |
| [12] WhatsApp | `type` **equals** `registration` |
| [11] Brevo | `type` **not equal** `attendance` *i* `type` **not equal** `counts` |

Gdy filtr nie przejdzie, Make po prostu kończy przebieg. Zero pustych gałęzi.

### Wybór szablonu bez routera

W module [11] pole *Template ID*:

```
switch(1.type;
  "registration"; 1;
  "reminder";     2;
  "contact";      3;
  1)
```

`switch()` robi dokładnie to, co router — tylko w jednym polu, nie w pięciu gałęziach.

---

## 3. Mapowanie parametrów Brevo (moduł [11])

Nazwy po lewej odpowiadają `{{ params.* }}` w `emails/registration.html`.

| Parametr | Wartość w Make |
|---|---|
| `subject` | `{{ 3.t.regSubject }}` |
| `preheader` | `{{ 3.t.regPreheader }}` |
| `hi` | `{{ 3.t.regHi }}` |
| `lead` | `{{ 3.t.regLead }}` |
| `numberLabel` | `{{ 3.t.regNumberLabel }}` |
| `raceNumber` | `{{ 5.raceNumber }}` |
| `firstName` | `{{ 1.firstName }}` |
| `eventDate` | `{{ 3.ev.date }}` |
| `presentation` | `{{ 3.ev.presentation }}` |
| `start` | `{{ 3.ev.start }}` |
| `place` | `{{ 3.ev.place }}` |
| `mapUrl` | `{{ 3.ev.map }}` |
| `orgEmail` | `{{ 3.ev.email }}` |
| `orgPhone` | `{{ 3.ev.phone }}` |
| `whenTitle` … `help` | odpowiednie klucze `3.t.reg*` |
| `localeUpper` | `{{ upper(3.loc) }}` |
| `checklist` | `{{ 3.t.regChecklist }}` (tablica — szablon iteruje sam) |
| `details` | patrz niżej |
| `rulesUrl` | `https://twoja-domena/regolamento.html?lang={{3.loc}}` |
| `privacyUrl` | `https://twoja-domena/privacy.html?lang={{3.loc}}` |

`details` to tablica par etykieta/wartość. W module [3] dodaj zmienną `details`:

```
add(emptyarray;
  {"label": get(3.t.labels;"fullName"),  "value": 3.fullName};
  {"label": get(3.t.labels;"birthDate"), "value": formatDate(1.birthDate;"DD.MM.YYYY")};
  {"label": get(3.t.labels;"taxCode"),   "value": upper(1.taxCode)};
  {"label": get(3.t.labels;"email"),     "value": 1.email};
  {"label": get(3.t.labels;"phone"),     "value": 1.phone};
  {"label": get(3.t.labels;"address"),   "value": 1.address};
  {"label": get(3.t.labels;"cartName"),  "value": 1.cartName};
  {"label": get(3.t.labels;"category"),  "value": upper(1.category)};
  {"label": get(3.t.labels;"team"),      "value": ifempty(1.teamName; "—")}
)
```

Jeden wpis w jednym module — i szablon HTML sam wyrenderuje tabelkę w każdym języku.

---

## 4. Dwa PDF-y jednym modułem

Iterator [7] dostaje tablicę dwóch elementów: `["it", loc]`. Jeśli klient wybrał
włoski, oba przebiegi dadzą IT — dlatego dodaj filtr po Iteratorze:

```
7.value  ≠  "it"   LUB   7.__IMTINDEX__  =  1
```

To gwarantuje: dla `loc = it` → jeden PDF, dla pozostałych → dwa.

Array aggregator [10] składa je w jedną tablicę załączników, więc Brevo wysyła
oba naraz w jednym mailu. Kolejność jest istotna: pierwszy w tablicy to **IT**,
bo to jego uczestnik ma wydrukować, a klienty pocztowe pokazują pierwszy załącznik
na górze.

Ostrzeżenie „drukuj tylko wersję włoską" pojawia się w trzech miejscach jednocześnie:
w mailu (`regPrintBody`), na pasku w przetłumaczonym PDF (`L_TRANSLATION_WARNING`)
oraz w nazwie pliku. Nazwy plików ustaw jako:

```
Carruleddhi-{{5.raceNumber}}-IT-DA-FIRMARE.pdf
Carruleddhi-{{5.raceNumber}}-{{upper(3.loc)}}-copia-informativa.pdf
```

---

## 5. WhatsApp przy każdym zapisie (moduł [12])

Powiadomienie ma trafić **do organizatora**, nie do uczestnika — to nie wymaga
zgody uczestnika na WhatsApp i nie wchodzi w limity marketingowe Meta.

1. W Meta Business utwórz aplikację, dodaj WhatsApp, połącz WABA.
2. Zatwierdź szablon kategorii `utility`, np. `carruleddhi_new_entry`:

```
Nowe zgłoszenie #{{1}}
{{2}} — {{3}} ({{4}})
Kategoria: {{5}} · Język: {{6}}
```

3. W Make: **WhatsApp Business Cloud → Send a template message**
   - odbiorca: numer organizatora w E.164, np. `+393284981574`
   - parametry: `{{5.raceNumber}}`, `{{3.fullName}}`, `{{1.cartName}}`, `{{1.phone}}`, `{{upper(1.category)}}`, `{{upper(3.loc)}}`
4. Ustaw na module **„Continue the execution of the route even if the module returns an error"** — awaria WhatsAppa nie może zablokować maila z PDF.

Meta rozlicza wiadomości szablonowe według kategorii i kraju; aktualne stawki są na
[oficjalnej stronie cenowej WhatsApp Business Platform](https://business.whatsapp.com/products/platform-pricing).
Przy kilkudziesięciu zgłoszeniach koszt jest groszowy, ale nie jest zerowy.

**Tańszy start bez Meta:** ten sam moduł zamień na **Telegram Bot → Send a message**
na prywatny czat organizatora. Zero kosztu, zero szablonów do zatwierdzania,
działa od razu. Wpis w `MAKE-PLAN.md` sekcja 3 porównuje oba kanały.

---

## 6. Scenariusz B — `Carruleddhi 2026 — Reminders`

Też bez routera. Etap wybiera `switch()`.

```
[1] Scheduler · co 15 minut
     │
[2] Google Sheets · Search rows  →  arkusz "Reminders"
     │      filtr: status = active
     │
[3] Tools · Set multiple variables
     │      due   = if(now >= 2.reminder_3h_at && empty(2.sent_3h_at); "3h";
     │              if(now >= 2.reminder_1d_at && empty(2.sent_1d_at); "1d";
     │              if(now >= 2.reminder_7d_at && empty(2.sent_7d_at); "7d"; "")))
     │      loc   = if(contains("it,pl,en,de,es,fr"; 2.locale); 2.locale; "it")
     │      t     = get(parseJSON(COPY); loc)
     │
     │  ── filtr: due  is not empty ──
     │
[4] Brevo · Send a transactional email   →  Template: 2 (reminder)
     │      subject = switch(3.due; "7d"; 3.t.remSubject7; "1d"; 3.t.remSubject1; 3.t.remSubject3)
     │      heading = switch(3.due; "7d"; 3.t.remHeading7; "1d"; 3.t.remHeading1; 3.t.remHeading3)
     │      body    = switch(3.due; "7d"; 3.t.remBody7;    "1d"; 3.t.remBody1;    3.t.remBody3)
     │      stageRibbon = switch(3.due; "7d"; "7 · 10 · 2026"; "1d"; "16 · 10 · 2026"; "17 · 10 · 2026")
     │      isRider = if(empty(2.race_number); false; true)
     │      raceNumber, riderNote, unsubscribeUrl, …
     │
[5] Google Sheets · Update a row  →  sent_{{3.due}}_at = now
```

Jeden szablon Brevo obsługuje wszystkie trzy przypomnienia we wszystkich sześciu
językach. Trzy `switch()` zastępują router z trzema gałęziami i osiemnaście szablonów.

### Ochrona przed dubletem

Bezpłatny plan Make ma minimum 15 minut między uruchomieniami, więc rekord może
zostać pobrany dwa razy, jeśli [5] nie zdąży zapisać. Przed [4] dopisz kolumnę
`locked_until` i ustaw ją na `now + 10 min`, a w filtrze [2] pomijaj rekordy
z aktywną blokadą. Szczegóły w `MAKE-PLAN.md` sekcja 7.

---

## 6b. Scenariusz C — `Carruleddhi 2026 — Roster` (lista dla panelu)

Trzy moduły. Zwraca listę zapisanych do sekcji 07 w `admin.html`.

```
[1] Webhooks · Custom webhook      ← ten sam webhook co scenariusz A
     │  filtr: type  equals  roster
     │
[2] Google Sheets · Search rows    →  arkusz "Registrations"
     │      Maximum number of returned rows: 500
     │
[3] Tools · Array aggregator  →  Webhooks · Webhook response
            Status: 200
            Body:   {{ toJSON(2.array) }}
            Headers: Content-Type: application/json
```

Możesz też dodać ten filtr do scenariusza A i mieć wszystko w jednym — router
nadal nie jest potrzebny, bo `roster` kończy się na module [3] i nie dotyka
pozostałych.

### Zabezpieczenie

Ten endpoint zwraca dane osobowe, więc Worker wymaga hasła w nagłówku
`X-Carruleddhi-Roster-Key` i porównuje je z sekretem `ROSTER_KEY`:

```powershell
cd worker
npx wrangler secret put ROSTER_KEY
npx wrangler deploy
```

Bez tego sekretu endpoint odpowiada `503 ROSTER_DISABLED` — czyli domyślnie jest
wyłączony. Limit żądań: 12 na IP na 10 minut.

**Hasło to nie autoryzacja.** Przed publikacją postaw przed `admin.html`
Cloudflare Access albo inną kontrolę dostępu po stronie hostingu.

### Wariant bez proxy

Panel czyta też plik CSV wyeksportowany z Google Sheets
(*Plik → Pobierz → Wartości rozdzielane przecinkami*). Parser rozpoznaje
przecinki i średniki, cudzysłowy, polskie nagłówki oraz kolumny w dowolnej
kolejności. Działa całkowicie offline — dobre na dzień wydarzenia, gdyby
padł internet.

## 7. Arkusz `Registrations` — kolumny w tej kolejności

Numer startowy wynika z numeru wiersza, więc kolejność ma znaczenie i nie wolno
sortować ani usuwać wierszy w trakcie zapisów.

```
A  created_at        H  address          O  privacy_consent
B  race_number       I  cart_name        P  news_consent
C  first_name        J  category         Q  status
D  last_name         K  team_name        R  pdf_it_url
E  birth_date        L  cart_notes       S  pdf_translated_url
F  tax_code          M  locale           T  email_status
G  email             N  rules_consent    U  printed_at
H  phone
```

Kolumna `printed_at` obsługuje pytanie „chcę móc później wydrukować ich PDF":
panel admina zaznacza w niej datę wydruku, żeby dwie osoby nie drukowały tego samego.

---

## 8. Czego ten scenariusz celowo NIE robi

- **Nie liczy obecności.** `type = attendance` jest odfiltrowany przed każdym modułem.
  Kliknięcie „Będę tam" trafiające do Make zjada 2–4 kredyty za sztukę; przy kilku
  tysiącach kliknięć darmowy plan padnie w jeden dzień. Licznik trzymaj w Cloudflare
  KV/D1 albo Supabase, a do Make wysyłaj raz na dobę podsumowanie.
- **Nie generuje podpisu na PDF.** Uczestnik podpisuje odręcznie wersję włoską.
- **Nie wysyła kodu podatkowego w temacie ani w WhatsAppie.** Tylko w załączonym PDF.

---

## 9. Kolejność wdrożenia

1. Brevo: zweryfikuj domenę nadawcy (SPF + DKIM), wgraj `emails/registration.html`
   jako szablon 1 i `emails/reminder.html` jako szablon 2.
2. Google Docs: dwa szablony z `emails/pdf-template.md`, zanotuj oba ID.
3. Google Sheets: arkusz z kolumnami z sekcji 7.
4. Make: scenariusz A — moduły [1]–[6], test bez PDF i bez WhatsAppa.
5. Dodaj [7]–[11], sprawdź, że przy `loc = pl` przychodzą dwa PDF-y, a przy `loc = it` jeden.
6. Dodaj [12] (WhatsApp albo Telegram) i [13].
7. Scenariusz B, test z ręcznie cofniętymi datami w arkuszu.
8. Checklista testów z `MAKE-PLAN.md` sekcja 14.

Konfiguracja techniczna (klucze, MCP, proxy) jest w `MCP-MAKE-SETUP.md`.
Ceny i limity dostawców sprawdź u źródła przed startem produkcyjnym — treści
z ich dokumentacji zostały tu sparafrazowane.
