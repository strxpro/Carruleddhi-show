# Od zera do działającego wszystkiego

Jedna instrukcja, po kolei. Nie przeskakuj kroków — każdy następny zakłada, że poprzedni
przeszedł.

**Ile scenariuszy w Make?** Jeden. Nie dwa, nie trzy.

To jest ważne, bo wcześniej mówiłem inaczej. Drugi scenariusz (przypomnienia na zegarze)
kosztował ~720 operacji miesięcznie na odpowiedź „nie ma nic do wysłania" — Make liczy
operację za każde uruchomienie modułu, a przez jedenaście miesięcy w roku odpowiedź jest
zawsze „nie". Zegar wyszedł na darmowy GitHub Actions, a Make jest dotykany tylko wtedy,
gdy naprawdę jest list. Trzeci (ogłoszenie nowej edycji) nie istnieje i nie jest potrzebny
do niczego, co teraz działa.

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
| `0008_newsletter_outbox.sql` | kolejka potwierdzeń newslettera |
| `0009_unsubscribe.sql` | kody rezygnacji, tokeny w obu listach |
| `0010_upsert_email_keys.sql` | **obowiązkowa** — bez niej zapis na przypomnienia daje `502` / `42P10` |
| `0011_race_numbers_reuse.sql` | numery startowe: najniższy wolny, zwalniany przy rezygnacji |

Wszystkie można puszczać ponownie — są napisane tak, że drugie uruchomienie nic nie psuje
(`if not exists`, `on conflict do nothing`, `create or replace`).

**Sprawdź:** Table Editor powinien pokazywać 10 tabel, w tym `site_settings`
i `verification_codes`.

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

## Krok 5 — Make, jeden scenariusz (raz, 15 minut)

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

## Krok 6 — Zegar przypomnień, za darmo (raz, 3 minuty)

Plik `.github/workflows/reminders.yml` jest już w repo.

1. GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**
   - `ROSTER_KEY` — ta sama wartość co w Vercelu
   - `SITE_URL` — `https://www.carruleddhishow.com` *(opcjonalnie)*
2. **Actions → Reminders → Run workflow** — sprawdź, zanim zaufasz zegarowi.

Odpowiedź `{"ok":true,"due":"","hoursLeft":9700,...}` to **poprawny wynik**. Do zjazdu
jest więcej niż tydzień, więc nie ma czego wysyłać.

Dlaczego nie Vercel Cron: plan Hobby daje jeden cron uruchamiany **raz na dobę**,
a przypomnienie 3 h przed potrzebuje lepszej rozdzielczości.

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

1. **Czat dla gościa na stronie.** Backend stoi w całości — tabele, endpointy, panel admina
   odpowiada. Brakuje zakładki czatu w sekcji kontaktu. Dlatego rezygnacja jest osobną
   kartą, a nie rozmową na czacie.
2. **Rezygnacja z samego wyścigu** (nie z powiadomień). Tabela na kody już jest i ma
   przygotowany drugi typ `cancel-entry`.
3. **Maile z większymi emocjami.** Są poprawne i spójne, ale suche.
4. **Regulamin, prywatność i cookies w sześciu językach.** Dziś włoski i polski.
5. **Scenariusz „ogłoś nową edycję".** Przycisk w panelu jest wyłączony.
6. **Prawdziwe zdjęcia** galerii, trasy i nagród. Wszystko to nadal placeholdery SVG.
