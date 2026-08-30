# Od zera do działającego wszystkiego

Jedna instrukcja, po kolei. Nie przeskakuj kroków — każdy następny zakłada, że poprzedni
przeszedł.

**Ile scenariuszy w Make?** Dwa, i oba są wyzwalane zdarzeniem, nie zegarem.

To jest jedyna reguła, której warto tu pilnować: **Make wolno budzić tylko wtedy, gdy
naprawdę jest co robić.** Operacja liczy się za każde uruchomienie modułu, a darmowy plan
daje ich 10 000 na miesiąc. Scenariusz z przypomnieniami, który co godzinę pytał „jest coś
do wysłania?", zjadał ~720 operacji miesięcznie na odpowiedź „nie" — przez jedenaście
miesięcy w roku zawsze „nie". Wyleciał; zegar stoi teraz na darmowym GitHub Actions,
a Make dostaje gotowy list. Z tego samego powodu poczta wchodzi mailhookiem, a nie
odpytywaniem IMAP-a, które kosztowałoby ~2900 operacji miesięcznie.

| # | Scenariusz | Wyzwalacz |
|---|---|---|
| 1 | `Carruleddhi — 1 — wszystko (webhook)` | POST z funkcji na Vercelu |
| 2 | `Carruleddhi — 2 — poczta na czat (mailhook)` | list przekierowany z `info@` |

Trzeci (ogłoszenie nowej edycji) nie istnieje i nie będzie potrzebny — pójdzie trasą
`outbox`, która już stoi w scenariuszu 1.

**Gdyby AI miało to zrobić za Ciebie**, w `make/` są trzy prompty i różnią się celem:
`PROMPT-DLA-AI.md` — zaimportuj gotowy blueprint i sprawdź, czy się zgadza ·
`PROMPT-PELNY.md` — odtwórz dokładnie ten scenariusz, moduł po module ·
`PROMPT-CELE.md` — zbuduj to po swojemu, tu są cele, wejście i ograniczenia narzędzia.

---

## Krok 1 — Supabase (raz, 5 minut)

SQL Editor → New query → wklej całą treść pliku → **Run**. Po kolei:

| Plik | Co robi |
|---|---|
| `0001_wall_comments.sql` | tablica komentarzy |
| `0002_event_data.sql` | zgłoszenia, obecność, przypomnienia, kontakt, newsletter |
| `0003_wall_media.sql` | zdjęcia na tablicy |
| `0004_registrations_minors.sql` | opiekunowie, sekwencja numerów startowych |
| `0005_chat.sql` | czat |
| `0006_site_settings.sql` | sponsorzy, blokada strony, przełączniki sekcji |
| `0007_purge_helpers.sql` | reset numerów po wyczyszczeniu danych |
| `0008_newsletter_outbox.sql` | **obowiązkowa** — kolejka potwierdzeń newslettera; bez niej cichy `400`, patrz krok 6 |
| `0009_unsubscribe.sql` | kody rezygnacji, tokeny w obu listach |
| `0010_upsert_email_keys.sql` | **obowiązkowa** — bez niej zapis na przypomnienia daje `502` / `42P10` |
| `0011_race_numbers_reuse.sql` | numery startowe: najniższy wolny, zwalniany przy rezygnacji |
| `0012_race_number_drop_default.sql` | **obowiązkowa** — bez niej `0011` nie robi nic, patrz niżej |
| `0013_counts_newest_initials.sql` | rządek awatarów pokazuje najnowszych, nie pierwszych |
| `0014_chat_message_source.sql` | skąd przyszła wiadomość na czacie: z okna czy z maila |

Wszystkie można puszczać ponownie — są napisane tak, że drugie uruchomienie nic nie psuje
(`if not exists`, `on conflict do nothing`, `create or replace`).

**Sprawdź:** Table Editor powinien pokazywać 10 tabel, w tym `site_settings`
i `verification_codes`.

**Dlaczego `0012` jest obowiązkowa.** `0011` obiecuje „najniższy wolny numer startowy",
ale `0004` zostawiła na kolumnie `DEFAULT nextval(...)`, a DEFAULT wylicza się **przed**
triggerem `BEFORE INSERT`. Warunek `if new.race_number is null` nigdy więc nie był
prawdą i `claim_race_number()` była martwym kodem — numery rosły w nieskończoność, a luki
po rezygnacjach nie zapełniały się nigdy. Sprawdzisz to jednym zapytaniem:

```sql
select column_default from information_schema.columns
 where table_name = 'registrations' and column_name = 'race_number';
```

Ma zwrócić `NULL`. Cokolwiek innego znaczy, że `0012` nie przeszła.

---

## Krok 2 — Storage w Supabase (raz, 1 minuta)

Storage → **New bucket** → nazwa `wall-photos` → **Public bucket: OFF**.

Prywatny celowo. Zdjęcie czekające na zatwierdzenie ma być nieosiągalne nawet po adresie;
funkcja podpisuje link na godzinę, kiedy wpis jest już zatwierdzony. Tam też lądują
logotypy sponsorów.

---

## Krok 3 — Zmienne w Vercelu (raz)

Settings → Environment Variables. Po każdej zmianie **Redeploy**.

| Nazwa | Skąd wziąć | Bez tego |
|---|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL | nic nie zapisuje się do bazy |
| `SUPABASE_SERVICE_KEY` | tamże → `service_role` **secret** | to samo |
| `ROSTER_KEY` | wymyśl długie hasło | panel admina i cron nie wejdą |
| `MAKE_WEBHOOK_URL` | z kroku 5 | maile nie wychodzą |
| `SITE_PASSWORD` | wymyśl hasło | brama „Pracujemy nad tym" nie działa |
| `WALL_SALT` | wymyśl losowy ciąg | hashe IP i kodów są przewidywalne |
| `INTAKE_SHARED_KEY` | opcjonalne | nic — to dodatkowy nagłówek do Make |
| `EVENT_DATE` | opcjonalne, domyślnie `2026-10-17T14:30:00+02:00` | nic |
| `AI_API_KEY` | `console.groq.com` → API Keys | czat odpowiada tylko na sześć pytań ze słownika, resztę oddaje człowiekowi |
| `AI_API_URL` | `https://api.groq.com/openai/v1/chat/completions` | jak wyżej — bez tego leci do OpenAI, a tam klucz Groq nie zadziała |
| `AI_MODEL` | `llama-3.3-70b-versatile` | domyślnie `gpt-4o-mini`, czyli model, którego Groq nie ma |
| `AI_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` (Groq) albo `gpt-4o-mini` (OpenAI) | wiadomość ze **zdjęciem** idzie prosto do organizatora — model tekstowy obrazów nie przyjmuje |
| `WHATSAPP_ALERTS` | `48665626101:2990681:pl,393284981574:3364881:it` | o nowej wiadomości na czacie dowiesz się tylko mailem, nie na telefon |

`WHATSAPP_ALERTS` to trójki `numer:klucz:język` po przecinku, numer bez plusa. Język jest
opcjonalny i domyślnie polski, więc stary zapis `numer:klucz` działa dalej — ale ustawiony
sprawia, że każdy organizator dostaje powiadomienie w swoim języku. Tłumaczona jest sama
ramka wiadomości; wypowiedź gościa zostaje dosłownie taka, jaką napisał. Te same pary, które
scenariusz w Make ma wpisane przy zapisach — ale tu w zmiennej, a nie w kodzie, bo
repozytorium jest publiczne. Skoro i tak są jawne w `make/blueprint-1-instant.json`,
warto je przy okazji wygenerować od nowa w CallMeBocie.

`service_role` to klucz, który omija zabezpieczenia bazy. Nigdy nie trafia do
przeglądarki — trzyma go tylko funkcja na Vercelu. Jeśli go gdzieś wkleisz publicznie,
wygeneruj nowy w Supabase.

`tools\make-secrets.ps1` wygeneruje hasła i wypisze gotowy blok do wklejenia.

---

## Krok 4 — PDF-y (raz, i po każdej zmianie treści formularza)

```
node tools/build-pdfs.mjs
```

Dwanaście plików do `public/emails/`: formularz dorosłego i nieletniego × sześć języków.
Są w repo, więc po wdrożeniu działają same.

**Sprawdź w przeglądarce, zanim pójdziesz dalej:**
`https://www.carruleddhishow.com/emails/Carruleddhi-modulo-it.pdf`

Jeśli to nie otworzy PDF-a, moduł HTTP w Make dostanie 404 i **zatrzyma trasę — mail nie
wyjdzie**. To najczęstsza przyczyna „nic nie przychodzi".

---

## Krok 5 — Make (raz, 20 minut)

### 5a. Import

1. Wyłącz stary scenariusz, jeśli jakiś masz. Trzy kropki → **Show queue** → zaznacz
   wszystko → usuń. Stare payloady nie mają nowych pól i będą się wywalać.
2. Nowy scenariusz → trzy kropki w prawym górnym → **Import Blueprint** →
   `make/blueprint-1-instant.json` → **Save**.

Powinno być **17 modułów** i **zero szarych krążków**. Jeśli widzisz gdziekolwiek
„Module Not Found", masz starą wersję pliku — zrób `git pull`.

### 5b. Webhook

Kliknij moduł **1** → **Add** → nazwa dowolna → **Save** → skopiuj adres.

Wklej go w Vercelu jako `MAKE_WEBHOOK_URL` → **Redeploy**.

### 5c. Naucz webhook struktury — ten krok najczęściej się pomija

Moduł 1 → **Redetermine data structure**. Musi pisać *Listening for data*. Wtedy:

```
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 -All -WorkerBase "https://www.carruleddhishow.com"
```

`-All` wysyła najpierw jedną wiadomość ze **wszystkimi** polami naraz. Make **nie sumuje**
struktur między wywołaniami — podmienia. Jeśli pierwsze przyjdzie zgłoszenie dorosłego,
Make zapamięta strukturę bez pól opiekuna i `guardianName` zostanie na zawsze puste.

Potem **OK** i **Save** (dyskietka na dolnym pasku).

### 5d. SMTP w sześciu modułach Email

Moduły **8, 24, 16, 27, 12, 14**. W pierwszym utwórz połączenie, w pozostałych wybierz je
z listy.

| Pole | Wartość |
|---|---|
| Host | `ssl0.ovh.net` |
| Port | `465` |
| TLS | **Yes** |
| Use explicit TLS (STARTTLS) | **No** |
| User name | `info@carruleddhishow.com` — pełny adres, nie sam login |
| Password | hasło skrzynki |
| From | `info@carruleddhishow.com` |

Jest jeszcze moduł **31** (outbox). Też potrzebuje tego połączenia — razem siedem.

### 5e. WhatsApp — nic do robienia

Moduły 9 i 30 mają wpisane numery i klucze. 9 → `48665626101`, 30 → `393284981574`.

### 5f. Zapisz i włącz

Dyskietka, potem przełącznik na **ON**.

### Co ten scenariusz robi

```
1 Webhook
└─ 4 Router
   ├─ registration-adult-it     7 HTTP(PDF wł.) ───────────────→ 8  Email
   ├─ registration-adult-xx    22 HTTP(wł.) → 23 HTTP(jego jęz.) → 24 Email
   ├─ registration-minor-it    19 HTTP(wł.) ───────────────────→ 16 Email
   ├─ registration-minor-xx    25 HTTP(wł.) → 26 HTTP(jego jęz.) → 27 Email
   ├─ type = registration       9 HTTP WhatsApp, 30 HTTP WhatsApp
   ├─ reminder                 12 Email
   ├─ contact                  14 Email
   └─ outbox                   31 Email       ← przypomnienia, newsletter, kody
```

Cztery trasy rejestracji, a nie dwie, bo filtr w Make nie jest „jeżeli" — kiedy nie
przechodzi, **kończy całą trasę**. Włoch dostaje jeden PDF, obcokrajowiec dwa, więc drugi
moduł HTTP musiałby być warunkowy. Nie da się.

Trasa **outbox** to wszystko, co wysyła zegar: trzy przypomnienia, potwierdzenia
newslettera i kody rezygnacji. List przychodzi gotowy — `to`, `subject`, `html`, nic do
rozwiązania — bo funkcja wyrenderowała go w języku odbiorcy przed wysłaniem żądania.

---

### 5g. Odpowiedzi z poczty na czat (drugi scenariusz)

Klient dostaje maila, odpowiada na niego — i ta odpowiedź ma wylądować w tym samym wątku
czatu, w którym z nim rozmawiasz. Dla Ciebie to jedna rozmowa z jednym człowiekiem, nawet
jeśli technicznie przyszła dwoma kanałami.

Scenariusz **Carruleddhi — 2 — poczta na czat (mailhook)** jest już w folderze
`carruleddhi`. Zostaje jedno kliknięcie po stronie poczty.

**OVH → skrzynka `info@carruleddhishow.com` → Przekierowania (Redirections)** → dodaj
przekierowanie na adres mailhooka:

```
belnkkgh5txojchpjegut4sl718c9nvo@hook.eu1.make.com
```

**Zostaw „zachowaj kopię" włączone.** Bez tego poczta znika ze skrzynki i jedynym miejscem,
gdzie jest, staje się baza — a wtedy awaria bazy zabiera Ci korespondencję.

### Dlaczego mailhook, a nie IMAP

IMAP trzeba odpytywać. Co 15 minut to ~2900 operacji miesięcznie na samo pytanie „czy coś
przyszło", przy limicie 10 000 — czyli ta sama pułapka, przez którą wyleciał scenariusz
z przypomnieniami. Mailhook kosztuje operację tylko wtedy, gdy naprawdę przyszedł list.
Przy okazji nie trzeba nigdzie trzymać hasła do skrzynki.

### Pętla, i dlaczego jej nie ma

Powiadomienia z czatu idą na `info@carruleddhishow.com`. Gdyby mailhook je łapał i robił
z nich wiadomości na czacie, każda taka wiadomość wysłałaby kolejne powiadomienie — i tak
w kółko, aż do wyczerpania operacji. Zapory są dwie i celowo w dwóch różnych miejscach:

1. **filtr w scenariuszu** — odrzuca nadawcę z domeny `carruleddhishow.com`
2. **`alertOrganisers()` w kodzie** — wiadomość, która przyszła z maila, nigdy nie wysyła
   powiadomienia mailem, tylko WhatsAppem

Druga zapora jest ważniejsza, bo scenariusz da się przeklikać, a kod jest pilnowany
asercją. I nic się przez to nie gubi: mail, o którym byłoby powiadomienie, leży już
w tej samej skrzynce, na którą by przyszło.

---

## Krok 6 — Zegar przypomnień, za darmo (raz, 3 minuty)

Zegar woła jeden adres, a ten sam decyduje, komu dziś należy się list, renderuje go
i wypycha do Make. Skąd woła — obojętne. Poniżej dwie drogi; **wybierz jedną**.

### Wariant A — cron-job.org (nic nie trzeba umieć)

**Zadania cykliczne → Utwórz zadanie cron**, zakładka **WSPÓLNE**:

| Pole | Wartość |
|---|---|
| Tytuł | `Carruleddhi — przypomnienia` |
| URL | `https://www.carruleddhishow.com/api/carruleddhi/reminders-due` |
| Włącz zadanie | **tak** |
| Zapisz odpowiedzi w historii zadań | **tak** — bez tego nie zobaczysz, co odpowiedział serwer |
| Harmonogram | **Co 15 minut** (`*/15 * * * *`) |

Potem zakładka **ZAAWANSOWANE**:

| Pole | Wartość |
|---|---|
| Metoda żądania | **POST** |
| Nagłówek 1 | `Content-Type` → `application/json` |
| Nagłówek 2 | `X-Carruleddhi-Roster-Key` → Twój `ROSTER_KEY` |
| Treść żądania (body) | `{"deliver":true}` |

Kliknij **URUCHOMIENIE TESTOWE**, zanim zapiszesz. Poprawna odpowiedź wygląda tak:

```json
{"ok":true,"due":"","hoursLeft":1197,"count":0,"messages":[]}
```

`count: 0` to **dobry wynik** — do zjazdu jest więcej niż tydzień, więc nie ma czego
wysyłać. Gdyby w odpowiedzi pojawiło się pole `note`, przeczytaj je: tam trafiają błędy,
których endpoint nie chce zamieniać na awarię całego przebiegu.

Dlaczego co 15 minut, a nie co godzinę: przypomnienie „3 godziny przed" ma być trzy
godziny przed, a nie trzy i pięćdziesiąt. Ten zegar nie kosztuje operacji w Make —
Make jest dotykany dopiero wtedy, gdy naprawdę jest list.

### Wariant B — GitHub Actions

Plik `.github/workflows/reminders.yml` jest już w repo.

1. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**
   - `ROSTER_KEY` — ta sama wartość co w Vercelu
   - `SITE_URL` — `https://www.carruleddhishow.com` *(opcjonalnie)*
2. **Actions → Reminders → Run workflow** — sprawdź, zanim zaufasz zegarowi.

### Jeśli uruchomisz oba naraz — nic się nie stanie

Endpoint zapisuje w `reminder_subscribers.last_reminder`, co już wysłał, więc drugie
wywołanie w tej samej godzinie nie znajduje nic do zrobienia. To nie jest powód, żeby
trzymać oba — ale nie jest to też błąd, który komuś wyśle dwa listy.

Dlaczego nie Vercel Cron: plan Hobby daje jeden cron uruchamiany **raz na dobę**,
a przypomnienie 3 h przed potrzebuje lepszej rozdzielczości.

### Sprawdź, czy `0008` przeszła — inaczej newsletter milczy

Zapytanie o kolejkę newslettera pyta o kolumnę `confirmation_sent_at`, którą dodaje
migracja `0008`. Bez niej Supabase odpowiada `400`, a endpoint **połyka to po cichu** —
zwraca `"ok": true` z dopiskiem `"note":"newsletter read failed: 400"` i leci dalej.
Przypomnienia chodzą, potwierdzenia zapisu do newslettera nie wychodzą i nic nie krzyczy.

Tak było na tej bazie do 28.08.2026. Jeżeli w odpowiedzi testowej widzisz `note`,
uruchom `0008_newsletter_outbox.sql` jeszcze raz.

---

## Krok 7 — Test (10 minut)

```
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 -WorkerBase "https://www.carruleddhishow.com"
```

Skrypt dokleja do adresów testowych godzinę uruchomienia, bo na e-mailu jest unikalny
indeks w trzech tabelach i drugi test tym samym adresem dostałby `409`.

| Test | Maile | Załączniki | WhatsApp |
|---|---|---|---|
| dorosły, `it` | 1 na jego adres + Bcc do Ciebie | 1 PDF (włoski) | 2 |
| dorosły, `pl` | 1 + Bcc | 2 PDF (włoski + polski) | 2 |
| nieletni, `it` | 1 na adres opiekuna, uczestnik w kopii jawnej | 1 PDF | 2, z blokiem `⚠️ MINORENNE` |
| nieletni, `de` | jak wyżej | 2 PDF | 2, z blokiem |
| przypomnienie | 1 potwierdzenie zapisu | — | — |
| kontakt | 1 na Twój adres, Reply-To = nadawca | — | — |

Potem: Supabase → Table Editor → w `registrations`, `reminder_subscribers`,
`contact_messages` powinny być wiersze.

**Jak czytać błąd.** Funkcja przekazuje treść błędu z Make w polu `reason`, więc skrypt
pokaże Ci go od razu. Jeśli mimo to trzeba zajrzeć do Make: ikona zegara u góry →
czerwony przebieg → moduł, który go zatrzymał.

| Objaw | Przyczyna |
|---|---|
| `HTTP 410` ze skryptu | scenariusz jest wyłączony — normalne przy nauce struktury |
| 404 na module HTTP | PDF nie jest wdrożony pod tym adresem (krok 4) |
| `409 ALREADY_REGISTERED` | ten e-mail już jest w bazie, to nie błąd |
| puste pola opiekuna | struktura webhooka nauczona bez `-All` (krok 5c) |
| `502 STORE_FAILED` | zła `SUPABASE_SERVICE_KEY` albo migracja nie przeszła |

---

## Krok 8 — Panel admina

`https://www.carruleddhishow.com/admin` → hasło to `ROSTER_KEY`.

Co tam jest:

- **Pulpit** — co nowego od Twojej ostatniej wizyty, wykres zgłoszeń dzień po dniu
- **Czat** — rozmowy ze strony *(strona gościa jeszcze nie istnieje, patrz na koniec)*
- **Tablica** — zatwierdzanie komentarzy; nic nie pokazuje się samo
- **Zgłoszenia** — lista zawodników
- **Kto chce wiedzieć** → Przypomnienia, Newsletter
- **Ustawienia** — blokada strony, sekcje, sponsorzy, **wyczyść dane testowe**

**Blokada strony.** Przełącznik w Ustawieniach zdejmuje bramę „Pracujemy nad tym" bez
deploya, w ciągu pół minuty. Middleware czyta flagę z Supabase z cache na 30 s. Fail-closed:
nieczytelna baza = strona zostaje zamknięta.

**Sponsorzy.** Wgrywasz logo z telefonu (skalowane w przeglądarce do 480 px), nazwa, link,
kolejność strzałkami. Strona publiczna czyta to po załadowaniu.

**Wyczyść dane testowe.** Czerwona sekcja na dole. Siedem zakresów, trzy zapory: hasło,
wpisanie słowa `USUN`, i serwer sprawdzający string nazywający zakres. Numery startowe
wracają do 001 tylko przy czyszczeniu zgłoszeń, i funkcja **odmawia** resetu, jeśli
w tabeli jeszcze są wiersze.

---

## Jak działają przypomnienia

**Jedna reguła: dostajesz przypomnienie, jeśli byłeś na liście, zanim stało się należne.**

7-dniowe jest należne w chwili start − 168 h. Kto zapisuje się pięć dni przed, nie był
wtedy na liście, więc nie ma czego wysyłać — powiedzenie mu „zostało 7 dni", kiedy zostało
5, jest gorsze niż milczenie.

| Kiedy się zapisał | Co dostanie |
|---|---|
| ponad tydzień przed | 7 dni, 1 dzień, 3 godziny |
| 5 dni przed | 1 dzień, 3 godziny |
| 20 godzin przed | tylko 3 godziny |
| 2 godziny przed | nic |

Formularz na stronie sam się dostosowuje: kafelki „7 dni / 1 dzień / 3 godziny" znikają po
kolei, a kiedy nie zostaje żadne, formularz się zamyka i pisze, że jest za późno — zamiast
brać adres i nie wysłać nic.

**Kto jest na liście.** Każdy, kto się zapisze na wyścig, plus każdy, kto kliknie „będę
tam" i poprosi o przypomnienia. Zawodnicy bez pytania o zgodę: ktoś, kto nie wie, że start
się przesunął, to człowiek stojący na górce, który nie może wystartować.

---

## Jak działa rezygnacja

Na dole każdego przypomnienia i newslettera jest mały szary link **„Nie chcę już tych
powiadomień"**. Prowadzi na `stronę/#unsub=<token>`.

1. Otwiera się karta w sekcji kontaktu z **zamaskowanym adresem** (`m****o@example.com`) —
   pierwsza rzecz, którą trzeba zobaczyć, to czyj to adres, na wypadek gdyby nie był Twój.
2. „Wyślij kod" → sześć cyfr na ten adres, ważne 15 minut.
3. Wpisanie kodu → powiadomienia wyłączone, w **obu** listach naraz.

Kod, a nie jedno kliknięcie, bo link w mailu bywa przekazywany dalej i bywa pobierany
z wyprzedzenia przez klienty pocztowe — a wtedy komuś innemu wyłączają się przypomnienia
i nikt nie wie dlaczego.

Token, a nie adres w URL-u, bo adres w URL-u trafia do historii przeglądarki, do nagłówka
Referer wysyłanego do wszystkiego, co strona wczytuje, i do logów każdego przeskoku po
drodze. Token nic nie znaczy poza tą bazą, jest czytany raz i natychmiast usuwany z paska
adresu.

Kod jest hashowany, pięć prób i umiera, wygasa po 15 minutach.

---

## Po każdej zmianie w kodzie

```
npm run check     # tsc + generator + 110 asercji + podglądarka maili
npm run build
node tools/build-pdfs.mjs        # tylko gdy zmieniałeś treść formularza
node tools/preview-emails.mjs    # shots/emails/ — otwórz w przeglądarce
```

**Po każdej zmianie w blueprincie trzeba go ponownie zaimportować do Make.** Make nie
czyta pliku z repo — import jest kopią.

---

## Czego jeszcze nie ma

Uczciwa lista, żebyś nie szukał:

1. **Rezygnacja z samego wyścigu** (nie z powiadomień). Tabela na kody już jest i ma
   przygotowany drugi typ `cancel-entry`. Nie ma też ścieżki „zmień dane".
2. **Newsletter: guzik „ogłoś nową edycję"** w panelu. Zakładka jest, przycisku nie ma.
3. **Czat naprawdę w czasie rzeczywistym.** Panel odpytuje co 10 s — działa, ale to nie
   jest to samo co push.
4. **Maile z większymi emocjami.** Są poprawne i spójne, ale suche.
5. **Regulamin, prywatność i cookies w sześciu językach.** Dziś włoski i polski.
6. **Prawdziwe zdjęcia** galerii, trasy i nagród. Wszystko to nadal placeholdery SVG.

Czego już nie ma na tej liście, a było: **czat dla gościa na stronie** (jest, w sekcji
kontaktu) i **powiadomienie o nowej wiadomości** (mail plus WhatsApp, patrz
`WHATSAPP_ALERTS` w kroku 3).
