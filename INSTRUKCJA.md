# Carruleddhi Show 2026 — instrukcja kompletna

Jeden plik, w którym jest wszystko. Otwórz go rano i zacznij od sekcji 2.

Stan na 22.08.2026. Build przechodzi, 0 błędów JS na stronie i w panelu.

> **Make.com jest już gotowy w dwóch plikach.** Nie klikaj modułów po kolei.
> Otwórz `make/JAK-WGRAC.md` — to trzy strony i dziesięć minut. Blueprinty:
> `make/blueprint-1-instant.json` (zapisy, kontakt, newsletter) i
> `make/blueprint-2-reminders.json` (przypomnienia 7 dni / 1 dzień / 3 godziny).
> Sekcja 5 poniżej opisuje, jak to działa w środku; do samego wgrania nie jest
> potrzebna.
>
> **Webhook scenariusza 1 nie jest tu wpisany — i to jest celowe.**
> Adres webhooka Make jest gołą przepustką: kto go zna, wstawia scenariuszowi dowolny
> payload, a scenariusz wysyła maila z adresu organizatorów z podanym HTML-em, pinguje
> oba numery na WhatsAppie i zużywa operacje. Na webhooku Make nie ma hasła — adres **jest**
> hasłem. To repozytorium jest publiczne, więc wpisany tutaj adres przestawał być sekretem
> w chwili commita.
>
> Adres bierz z jednego miejsca: `MAKE_WEBHOOK_URL` w Vercelu, a lokalnie w `.env.local`
> (objętym `.gitignore`). `tools/make-webhook-feed.ps1` czyta go stamtąd sam.
>
> Wcześniejsze wersje tego pliku go zawierały, więc **leży w historii gita**. Wygeneruj nowy:
> w Make moduł 1 → *Redetermine data structure* daje nowy adres. Potem popraw
> `MAKE_WEBHOOK_URL` w Vercelu i w `.env.local`.

---

## Spis treści

1. [Start w trzech komendach](#1-start-w-trzech-komendach)
2. [Co zrobić jutro — lista priorytetowa](#2-co-zrobić-jutro--lista-priorytetowa)
3. [Mapa plików — gdzie co jest](#3-mapa-plików--gdzie-co-jest)
4. [Panel admina — wszystkie dziewięć sekcji](#4-panel-admina--wszystkie-dziewięć-sekcji)
5. [Make.com — jeden scenariusz, zero routerów](#5-makecom--jeden-scenariusz-zero-routerów)
6. [Maile w sześciu językach i dwa PDF-y](#6-maile-w-sześciu-językach-i-dwa-pdf-y)
7. [WhatsApp przy zapisie](#7-whatsapp-przy-zapisie)
8. [Proxy i wdrożenie](#8-proxy-i-wdrożenie)
9. [MCP — sterowanie Make z Kiro](#9-mcp--sterowanie-make-z-kiro)
10. [Jak zbudowana jest strona](#10-jak-zbudowana-jest-strona)
11. [Czcionki — jeden punkt zmiany](#11-czcionki--jeden-punkt-zmiany)
12. [Obrazy i prompty](#12-obrazy-i-prompty)
13. [Bezpieczeństwo i RODO](#13-bezpieczeństwo-i-rodo)
14. [Co zostało zrobione](#14-co-zostało-zrobione)
15. [Czego nie ma](#15-czego-nie-ma)
16. [Rozwiązywanie problemów](#16-rozwiązywanie-problemów)
17. [Podpowiadanie adresu z Google](#17-podpowiadanie-adresu-z-google--jak-to-zrobić)
18. [Ściana komentarzy — Supabase](#18-ściana-komentarzy--supabase)
19. [Codice fiscale zamieniony na kod pocztowy](#19-codice-fiscale-zamieniony-na-kod-pocztowy)
20. [Prawdziwa liczba osób i prawdziwe inicjały](#20-prawdziwa-liczba-osób-i-prawdziwe-inicjały)
21. [Formularz zapisu na jednym ekranie](#21-formularz-zapisu-na-jednym-ekranie)

---

## 1. Start w trzech komendach

```powershell
npm install     # raz, po pobraniu projektu
npm run dev     # praca nad stroną     → http://localhost:5173
npm run build   # wersja produkcyjna   → katalog dist/
npm run preview # podgląd tego, co poleci na serwer
```

**Zawsze sprawdzaj `npm run preview`, nie tylko `npm run dev`.** Dev i build
potrafią się różnić — raz już się o to potknęliśmy (patrz sekcja 16).

Adresy lokalne:

| Adres | Co to |
|---|---|
| `/index.html` | strona główna |
| `/admin.html` | panel sterowania |
| `/index.html?configPreview=1` | strona z Twoimi zmianami z panelu |
| `/index.html?skipIntro=1` | bez animacji wejścia, szybsze testy |
| `/index.html?lang=pl` | wymuszony język |

---

## 2. Co zrobić jutro — lista priorytetowa

### Najpilniejsze: zrotuj sekrety Make

Token MCP i klucz API wysłałeś w czacie, więc są ujawnione.

- [ ] Make → **Profile → API access** → usuń stary klucz, wygeneruj nowy
      z zakresami `scenarios:read` i `scenarios:run`
- [ ] Make → **MCP tokens** → unieważnij stary, wygeneruj nowy
- [ ] Wpisz nowe wartości do `.kiro/settings/mcp.json` (ten plik jest w `.gitignore`)
- [ ] Uzupełnij `MAKE_TEAM` — liczba z adresu strony Team, np. `/team/123456/dashboard`
- [x] `MAKE_ZONE` ustawione na `eu1.make.com` — zgadza się z Twoimi linkami do Make

### Potem: narysuj trasę na zdjęciu (5 minut)

- [ ] Otwórz `admin.html`, przewiń do sekcji **04 Trasa na zdjęciu**
- [ ] Klikaj punkty od startu do mety, przeciągnij, żeby dopasować
- [ ] Ustaw suwaki perspektywy (blisko / horyzont)
- [ ] **Zapisz draft** → **Eksport JSON** → przenieś do `index.html` (sekcja 4 tej instrukcji)

Domyślna linia jest moim przybliżeniem — nie widzę zdjęcia, tylko rozkład
jasności i barw. Wiem gdzie jest morze i horyzont, nie wiem gdzie dokładnie
biegnie droga.

### Dalej: e-maile i scenariusze

**Otwórz `MAKE-KROK-PO-KROKU.md` i rób po kolei.** To instrukcja klikana:
co nacisnąć, co wkleić, w jakiej kolejności, z testem po każdej części.
Dziesięć części, około trzech godzin.

Skrót, żebyś wiedział co Cię czeka:

- [ ] Część 1 — trzy arkusze w Google Sheets (nagłówki gotowe do wklejenia)
- [ ] Część 2 — Brevo: weryfikacja domeny + dwa szablony z katalogu `emails/`
- [ ] Część 3 — dwa szablony PDF w Google Docs
- [ ] Część 4 — scenariusz A, 13 modułów z dokładnymi wartościami pól
- [ ] Część 5 — przypomnienia i kontakt w tym samym scenariuszu
- [ ] Część 6 — scenariusz B, wysyłka trzech przypomnień
- [ ] Część 7 — Telegram albo WhatsApp do organizatora
- [ ] Część 8 — proxy i podłączenie strony
- [ ] Część 9 — scenariusz C, lista uczestników w panelu
- [ ] Część 10 — checklista przed publikacją

### Na końcu: wdrożenie

- [ ] `npm run build`
- [ ] `cd worker` → `npx wrangler secret put MAKE_WEBHOOK_URL`
- [ ] `npx wrangler secret put ROSTER_KEY` (dla listy uczestników w panelu)
- [ ] `npx wrangler deploy`
- [ ] Wpisz ścieżki `/api/carruleddhi/...` w panelu **i** w `index.html`
- [ ] Zabezpiecz `admin.html` na hostingu (Cloudflare Access)
- [ ] Uzupełnij dane prawne w `privacy.html`, daj regulamin prawnikowi

Bez ostatnich trzech kropek formularze działają w trybie demo: pokazują numer
startowy, ale nic nie wysyłają.

---

## 3. Mapa plików — gdzie co jest

### Strona

| Plik | Za co odpowiada |
|---|---|
| `index.html` | treść strony + konfiguracja na samym dole (`window.CARRULEDDHI_CONFIG`) |
| `assets/css/site.css` | **jedyny** arkusz podłączany do strony, importuje dwa poniższe w kolejności |
| `assets/css/main.css` | warstwa bazowa: kolory, komponenty, siatki |
| `assets/css/experience.css` | warstwa nadpisań: panele 100vh, gęstość, poprawki, czcionki |
| `assets/js/app.js` | logika: panele, liczniki, formularze, trasa, menu, zgoda |
| `assets/js/i18n.js` | tłumaczenia interfejsu, 6 języków |
| `assets/js/site-config.js` | walidacja konfiguracji, wspólna dla strony i panelu |
| `assets/js/route-path.js` | krzywa trasy i wstążka perspektywy |
| `assets/js/flags.js` | flagi SVG do wyboru języka |
| `assets/js/form-experience.js` | kalendarz daty urodzenia, stepper formularza |

### Panel admina

| Plik | Za co odpowiada |
|---|---|
| `admin.html` | struktura panelu, 7 sekcji |
| `assets/css/admin.css` | wygląd panelu + arkusz wydruku kart |
| `assets/js/admin.js` | draft, walidacja, import/eksport, edytor trasy, lista uczestników |
| `assets/js/roster.js` | parser CSV, maskowanie danych, pobieranie listy z Make |

### Obrazy

Wszystkie w `public/assets/images/`. Ten katalog jest kopiowany **bez zmiany nazw**,
więc ścieżki `/assets/images/...` działają lokalnie i na serwerze.

### Integracje i dokumenty

| Plik | Za co odpowiada |
|---|---|
| `worker/index.js` | proxy: walidacja, biała lista pól, limity, hasło do listy |
| `worker/wrangler.toml` | konfiguracja Cloudflare, bez sekretów |
| `worker/.dev.vars.example` | wzór pliku z sekretami do testów lokalnych |
| `.kiro/settings/mcp.json` | Twoje klucze do Make (poza repo) |
| `.kiro/settings/mcp.example.json` | wzór bez sekretów, ten może iść do repo |
| `emails/copy.json` | teksty maili i etykiety PDF w 6 językach |
| `emails/registration.html` | szablon Brevo — potwierdzenie zapisu |
| `emails/reminder.html` | szablon Brevo — wszystkie trzy przypomnienia |
| `emails/pdf-template.md` | treść szablonu Google Docs |
| `PROMPTY-ZDJEC.md` | prompty do wygenerowania obrazów |
| **`MAKE-KROK-PO-KROKU.md`** | **instrukcja klikana: od zera do działających maili** |
| `MAKE-SINGLE-SCENARIO.md` | skrót architektury scenariuszy, dla orientacji |
| `MCP-MAKE-SETUP.md` | klucze, MCP, wdrożenie proxy |
| `MAKE-PLAN.md` | logika arkuszy, RODO, testy, kredyty Make |

> `Carruleddhi Show.dc.html` i pliki `validation-*.png` to pozostałości z wcześniejszej
> pracy. Nie są w builadzie, możesz je usunąć.

---

## 4. Panel admina — wszystkie dziewięć sekcji

Panel zapisuje **draft w localStorage Twojej przeglądarki**. Widzi go tylko
podgląd z `?configPreview=1`. Zwykli odwiedzający go nie zobaczą.

### Jak opublikować zmianę dla wszystkich

1. W panelu ustaw wszystko i kliknij **Zapisz draft**.
2. Kliknij **Eksport JSON**.
3. Otwórz `index.html`, zjedź na dół do `window.CARRULEDDHI_CONFIG`.
4. Podmień wartości tymi z pliku JSON (klucz `config`).
5. `npm run build` i wgraj `dist/`.

To celowe: panel nie ma logowania, więc nie może publikować dla wszystkich.

### Sekcje

| Nr | Sekcja | Co ustawiasz |
|---|---|---|
| 01 | Wydarzenie i liczniki | nazwa, data ISO, etykieta daty, hasło, startowe liczniki |
| 02 | Trasa i kontakt | dystans, nazwa drogi, link do map, e-mail, telefon |
| 03 | Obrazy lokalne | ścieżki do zdjęcia trasy i 5 kadrów galerii |
| 04 | Trasa na zdjęciu | rysowanie linii zjazdu + perspektywa |
| 05 | Widoczność funkcji | włącz/wyłącz galerię, „Będę tam", zapisy |
| 06 | Integracje przez proxy | **sześć** ścieżek `/api/carruleddhi/...`, razem z tablicą |
| 07 | Sponsorzy | ruchomy pasek z logotypami |
| 08 | Zapisani uczestnicy | lista zgłoszeń + wydruk kart |
| 09 | Moderacja tablicy | zatwierdzanie, ukrywanie i usuwanie komentarzy |

### Sekcja 07 — sponsorzy

Pasek pojawia się na dole sekcji powitalnej: tylko logotypy, bez nagłówków
i opisów, przewijają się w pętli i zatrzymują pod kursorem.

Dla każdego sponsora podajesz trzy rzeczy:

| Pole | Co wpisać |
|---|---|
| Nazwa | używana jako tekst alternatywny obrazka, np. `Comune di Santa Teresa` |
| Plik logo | ścieżka `/assets/images/sponsor-1.png` — plik wrzuć wcześniej do `public/assets/images/` |
| Link | opcjonalny, tylko `https://`. Kliknięcie logo otwiera go w nowej karcie |

Strzałki ↑ ↓ zmieniają kolejność, **Usuń** wyrzuca wiersz. Pod listą jest podgląd
paska, który aktualizuje się od razu przy pisaniu.

Kilka rzeczy dzieje się automatycznie:

- logotypy są odbarwiane i rozjaśniane, a pełny kolor wraca pod kursorem —
  dzięki temu pasek wygląda spójnie, mimo że każde logo ma inną kolorystykę
- lista jest duplikowana, żeby pętla nie miała widocznego szwu; kopia jest
  ukryta przed czytnikami ekranu
- prędkość przewijania rośnie z liczbą logotypów, więc tempo jest stałe
- wysokość paska jest doliczana do dolnego odstępu sekcji powitalnej, więc pasek
  nigdy nie zasłoni napisów ani przycisków
- pusta lista = pasek w ogóle się nie renderuje
- odrzucane są ścieżki poza `assets/images/` oraz linki inne niż `https://`
  (`javascript:` i `http://` nie przejdą)

Maksymalnie 20 sponsorów.

> Pamiętaj, że po zapisaniu draftu zmiana jest widoczna tylko w podglądzie
> `?configPreview=1`. Publikacja dla wszystkich to eksport JSON i przeniesienie
> do `index.html`, tak jak przy pozostałych sekcjach.

Na górze panelu jest **pasek „Skocz do:"** z linkami do wszystkich siedmiu sekcji.
Przykleja się przy przewijaniu, więc nigdy nie musisz szukać — kliknij
**04 Rysowanie trasy** i jesteś na miejscu.

Każde pole ma teraz przykład w środku (szary tekst) i podpowiedź pod spodem,
więc widzisz od razu, co wpisać.

### Sekcja 04 — rysowanie trasy

**Tu nic nie wpisujesz — klikasz po zdjęciu.** Sekcja jest wyróżniona żółtą ramką
i ma w środku instrukcję w pięciu punktach.

- **klik na zdjęciu** — dodaje punkt (żółty = start, czerwony = meta)
- **przeciągnij punkt** — przesuwa
- **prawy przycisk na punkcie** lub `Delete` — usuwa
- **strzałki** przy zaznaczonym punkcie — precyzja, z `Shift` większy krok
- **Cofnij punkt / Domyślna linia / Wyczyść** — pod zdjęciem
- **dwa suwaki perspektywy** — szerokość blisko widza i przy horyzoncie

Linia sama się wygładza między punktami (splajn Catmull-Rom), więc 5–8 punktów
wystarczy. Perspektywa zwęża wstążkę ku horyzontowi kwadratowo, więc efekt
głębi jest wyraźny. Współrzędne zapisują się jako liczby 0–1, więc trzymają
się zdjęcia na każdej rozdzielczości.

**Puste = brak linii.** Wyczyszczenie wszystkich punktów wyłącza rysowanie.

Podgląd w panelu rysuje dokładnie to samo co strona — ta sama funkcja,
ten sam kod.

### Sekcja 07 — lista uczestników i wydruk

Dwa źródła:

**A. Z Make przez proxy** — wpisujesz hasło (sekret `ROSTER_KEY` Workera)
i klikasz „Wczytaj listę". Hasło ląduje tylko w `sessionStorage`, zamknięcie
karty je usuwa.

**B. Z pliku CSV** — w Google Sheets *Plik → Pobierz → CSV*, potem
„Wybierz plik CSV". Działa bez Make i bez internetu, czyli nadaje się na
dzień wydarzenia. Parser radzi sobie z przecinkami w cudzysłowach,
średnikami, polskimi nagłówkami i dowolną kolejnością kolumn.

Co dalej:

- **e-maile i telefony zamaskowane domyślnie** (`ma•••••@example.com`);
  checkbox „Pokaż dane kontaktowe" je odsłania
- **codice fiscale maskowany zawsze**, także na wydruku
- **wyszukiwanie** po numerze, nazwisku, pojeździe, zespole, e-mailu
- **„Drukuj kartę"** przy wierszu → jedna karta A4
- **„Drukuj wszystkie"** → drukuje to, co widzisz po filtrowaniu

Karty **nie mają miejsca na podpis**. Podpisywany jest wyłącznie włoski PDF
z maila. Karta z panelu to dokument na stolik sędziowski.

Żaden wiersz nie ląduje na dysku — dane żyją w pamięci karty i znikają
po odświeżeniu.

---

## 5. Make.com — jeden scenariusz, zero routerów

Router w Make jest potrzebny tylko wtedy, gdy dla różnych żądań mają się wykonać
**różne moduły**. U Ciebie moduły są te same, różnią się wartości. Zamiast routera:

| Zamiast | Użyj |
|---|---|
| gałąź `registration / reminder / contact` | **filtr na module** (klik na łączniku) |
| osobny szablon Brevo na każdy język | jedna zmienna JSON + `get()` |
| osobny szablon na 7d / 1d / 3h | jeden szablon + `switch()` w parametrach |
| dwa moduły Google Docs (IT + tłumaczenie) | **Iterator** po dwóch elementach |

Worker już normalizuje dane, więc do Make trafia zawsze ten sam płaski JSON.

### Scenariusz A — `Carruleddhi 2026 — Intake`

```
[1]  Webhooks · Custom webhook
[2]  Tools · Set variable            copy = całe emails/copy.json
[3]  Tools · Set multiple variables  loc, t, tIt, ev, fullName, generated, details
[4]  Google Sheets · Add a row       arkusz Registrations      filtr: type = registration
[5]  Tools · Set variable            raceNumber = formatNumber(4.__ROW_NUMBER__ + 37; 0)
[6]  Webhooks · Webhook response     {"ok":true,"raceNumber":"{{5.raceNumber}}"}
[7]  Tools · Iterator                {{ add(emptyarray; "it"; 3.loc) }}
[8]  Google Docs · From template     switch(7.value; "it"; TEMPLATE_IT; TEMPLATE_TRANSLATED)
[9]  Google Drive · Download         format: PDF
[10] Tools · Array aggregator        zbiera oba PDF-y
[11] Brevo · Send transactional      Template 1, Attachments = {{10.array}}
[12] WhatsApp / Telegram             filtr: type = registration
[13] Google Sheets · Update a row    status, pdf_url, email_status
```

Zmienne w module [3]:

```
loc       = if(contains("it,pl,en,de,es,fr"; 1.locale); 1.locale; "it")
t         = get(parseJSON(2.copy); loc)
tIt       = get(parseJSON(2.copy); "it")
ev        = get(parseJSON(2.copy); "_event")
fullName  = 1.firstName + " " + 1.lastName
generated = formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")
```

Filtry zamiast gałęzi routera:

| Przed modułem | Filtr |
|---|---|
| [4] Add a row | `type` equals `registration` |
| [7] Iterator | `type` equals `registration` |
| [11] Brevo | `type` not equal `attendance` **i** not equal `counts` |
| [12] WhatsApp | `type` equals `registration` |

Wybór szablonu bez routera, w polu *Template ID* modułu [11]:

```
switch(1.type; "registration"; 1; "reminder"; 2; "contact"; 3; 1)
```

### Scenariusz B — `Carruleddhi 2026 — Reminders`

```
[1] Scheduler · co 15 minut
[2] Google Sheets · Search rows      arkusz Reminders, filtr status = active
[3] Tools · Set multiple variables   due, loc, t
    due = if(now >= 2.reminder_3h_at && empty(2.sent_3h_at); "3h";
          if(now >= 2.reminder_1d_at && empty(2.sent_1d_at); "1d";
          if(now >= 2.reminder_7d_at && empty(2.sent_7d_at); "7d"; "")))
    ── filtr: due is not empty ──
[4] Brevo · Send transactional       Template 2
    subject = switch(3.due; "7d"; 3.t.remSubject7; "1d"; 3.t.remSubject1; 3.t.remSubject3)
    heading = switch(3.due; "7d"; 3.t.remHeading7; "1d"; 3.t.remHeading1; 3.t.remHeading3)
    body    = switch(3.due; "7d"; 3.t.remBody7;    "1d"; 3.t.remBody1;    3.t.remBody3)
[5] Google Sheets · Update a row     sent_{{3.due}}_at = now
```

Jeden szablon obsługuje trzy przypomnienia w sześciu językach.

### Scenariusz C — `Carruleddhi 2026 — Roster`

```
[1] Webhooks · Custom webhook        filtr: type = roster
[2] Google Sheets · Search rows      Registrations, max 500
[3] Webhooks · Webhook response      {{ toJSON(2.array) }}
```

To zasila sekcję 07 w panelu.

### Arkusz `Registrations` — kolumny w tej kolejności

Numer startowy wynika z numeru wiersza, więc **nie sortuj i nie usuwaj wierszy**
w trakcie zapisów.

```
A created_at    H phone            O privacy_consent
B race_number   I address          P news_consent
C first_name    J cart_name        Q status
D last_name     K category         R pdf_it_url
E birth_date    L team_name        S pdf_translated_url
F tax_code      M cart_notes       T email_status
G email         N rules_consent    U printed_at
```

### Czego scenariusz celowo nie robi

- **Nie liczy obecności.** `type = attendance` jest odfiltrowany. Kliknięcie
  „Będę tam" w Make to 2–4 kredyty; przy kilku tysiącach kliknięć darmowy plan
  padnie w jeden dzień. Licznik trzymaj w Cloudflare KV/D1 albo Supabase.
- **Nie generuje podpisu na PDF.** Uczestnik podpisuje odręcznie wersję włoską.
- **Nie wysyła codice fiscale w temacie ani w WhatsAppie.** Tylko w PDF.

Pełne mapowanie parametrów Brevo: `MAKE-SINGLE-SCENARIO.md` sekcja 3.

---

## 6. Maile w sześciu językach i dwa PDF-y

Strona wysyła język odwiedzającego w polu `locale`. W Make **jeden** moduł
`Set variable` trzyma cały `emails/copy.json`, a `get(parseJSON(copy); locale)`
wyciąga teksty. Dlatego:

- jeden szablon Brevo na wszystkie 6 języków, nie sześć
- jeden szablon na wszystkie 3 przypomnienia, nie trzy
- dodanie języka to dopisanie klucza w `copy.json`, bez zmian w scenariuszu

`copy.json` ma 32 klucze w każdym z sześciu języków — sprawdzone, że zestawy są
identyczne, więc żaden język nie wyświetli surowego klucza zamiast tekstu.

### Dwa PDF-y

Uczestnik dostaje w jednym mailu:

1. `Carruleddhi-039-IT-DA-FIRMARE.pdf` — **do wydruku i podpisu**
2. `Carruleddhi-039-PL-copia-informativa.pdf` — kopia w jego języku, tylko do zrozumienia

Iterator [7] dostaje `["it", loc]`. Przy `loc = it` filtr po Iteratorze redukuje
to do jednego PDF-a. Array aggregator [10] składa je w jedną tablicę załączników,
a kolejność jest istotna: **włoski pierwszy**, bo klienty pocztowe pokazują
pierwszy załącznik na górze.

Ostrzeżenie „drukuj tylko wersję włoską" jest w **trzech miejscach jednocześnie**:

- czerwona ramka w mailu (`regPrintBody` w `copy.json`)
- pasek na górze przetłumaczonego PDF-a (`L_TRANSLATION_WARNING`)
- nazwa pliku (`IT-DA-FIRMARE` vs `copia-informativa`)

Szablony Google Docs: `emails/pdf-template.md` — tam jest gotowy układ dokumentu,
lista placeholderów i treść deklaracji.

> **Treść liberatorii wymaga zatwierdzenia przez ubezpieczyciela i prawnika.**
> To co jest w pliku to propozycja redakcyjna, nie opinia prawna.

---

## 7. WhatsApp przy zapisie

Powiadomienie idzie **do organizatora**, nie do uczestnika. Dzięki temu nie
potrzebujesz osobnej zgody uczestnika na WhatsApp i nie wchodzisz w limity
marketingowe Meta.

1. Meta Business → aplikacja typu Business → dodaj WhatsApp → połącz WABA
2. Zatwierdź szablon kategorii `utility`, np. `carruleddhi_new_entry`:

```
Nowe zgłoszenie #{{1}}
{{2}} — {{3}} ({{4}})
Kategoria: {{5}} · Język: {{6}}
```

3. W Make: **WhatsApp Business Cloud → Send a template message**
   - odbiorca: numer organizatora w E.164, np. `+393284981574`
   - parametry: `{{5.raceNumber}}`, `{{3.fullName}}`, `{{1.cartName}}`,
     `{{1.phone}}`, `{{upper(1.category)}}`, `{{upper(3.loc)}}`
4. Włącz na module **„Continue the execution of the route even if the module
   returns an error"** — awaria WhatsAppa nie może zablokować maila z PDF.

Meta rozlicza wiadomości szablonowe według kategorii i kraju; stawki są na
[oficjalnej stronie cenowej WhatsApp Business Platform](https://business.whatsapp.com/products/platform-pricing).
Przy kilkudziesięciu zgłoszeniach koszt jest groszowy, ale nie jest zerowy.

**Tańszy start:** ten sam moduł zamień na **Telegram Bot → Send a message**
na prywatny czat. Zero kosztu, zero szablonów do zatwierdzania, działa od razu.

---

## 8. Proxy i wdrożenie

### Dlaczego strona nie gada z Make bezpośrednio

`site-config.js` przyjmuje w `endpoints` **wyłącznie** puste stringi albo ścieżki
`/api/carruleddhi/...`. Wklejenie `https://hook.eu1.make.com/...` zostanie po cichu
odrzucone. To celowe: publiczny webhook każdy odczyta z kodu strony i zaspamuje
Ci kredyty.

```
przeglądarka → POST /api/carruleddhi/<typ> → Cloudflare Worker → webhook Make
                                              ↑
                                  MAKE_WEBHOOK_URL jako secret
```

### Uruchomienie

```powershell
npm run build

cd worker
npx wrangler secret put MAKE_WEBHOOK_URL     # wymagane
npx wrangler secret put ROSTER_KEY           # dla listy uczestników w panelu
npx wrangler secret put INTAKE_SHARED_KEY    # opcjonalne
npx wrangler secret put TURNSTILE_SECRET     # opcjonalne

npx wrangler kv namespace create RATE_LIMIT  # opcjonalne, limity na IP
# id z odpowiedzi wklej do wrangler.toml i odkomentuj [[kv_namespaces]]

npx wrangler deploy
```

Test lokalny bez deployu: skopiuj `worker/.dev.vars.example` na `worker/.dev.vars`,
wpisz webhook i uruchom `npx wrangler dev`.

### Ścieżki do wpisania

W panelu sekcja 06 **i** w `index.html` w `window.CARRULEDDHI_CONFIG.endpoints`:

```
/api/carruleddhi/registration
/api/carruleddhi/reminder
/api/carruleddhi/attendance
/api/carruleddhi/counts
/api/carruleddhi/contact
```

Status obok pola zmieni się na **Proxy aktywne**. Puste pole = tryb demo.

### Co Worker odrzuca zanim dotknie Make

| Kod | Znaczenie |
|---|---|
| `UNKNOWN_TYPE` | typ poza listą dozwolonych |
| `VALIDATION_FAILED` | brak wymaganych pól, zły e-mail, brak zgody |
| `PAYLOAD_TOO_LARGE` | ciało żądania > 16 kB |
| `RATE_LIMITED` | > 6 żądań danego typu z jednego IP w 10 minut |
| `CAPTCHA_FAILED` | Turnstile włączony, token nieprawidłowy |
| `ROSTER_UNAUTHORISED` | złe hasło do listy uczestników |
| `ROSTER_DISABLED` | brak sekretu `ROSTER_KEY`, czyli lista wyłączona |

Strona oczekuje JSON. Dla rejestracji Make powinien zwrócić
`{"ok": true, "raceNumber": "039"}` — wtedy numer startowy jest prawdziwy,
a nie policzony lokalnie.

---

## 9. MCP — sterowanie Make z Kiro

`.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "make": {
      "command": "npx",
      "args": ["-y", "@makehq/mcp-server"],
      "env": {
        "MAKE_API_KEY": "<nowy klucz API>",
        "MAKE_ZONE": "eu1.make.com",
        "MAKE_TEAM": "<id zespołu>"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

| Zmienna | Gdzie ją znaleźć |
|---|---|
| `MAKE_API_KEY` | Make → Profile → API access → Add token |
| `MAKE_ZONE` | domena w pasku adresu, np. `eu1.make.com`, `eu2.make.com`, `us1.make.com` |
| `MAKE_TEAM` | liczba w URL strony Team: `/team/123456/dashboard` → `123456` |

Wymaga Node.js (`npx` musi działać w terminalu).

Po zapisaniu odśwież serwer z panelu MCP w Kiro, potem napisz mi
„wylistuj scenariusze Make".

**Serwer pokazuje tylko scenariusze z harmonogramem `On demand`.** Scenariusz
z webhookiem albo harmonogramem czasowym się nie pojawi. Jeśli lista jest pusta,
sprawdź kolejno: `MAKE_TEAM`, zakresy klucza, tryb *On demand*.

---

## 10. Jak zbudowana jest strona

### Panele 100vh

Każda sekcja jest `position: sticky; top: 0`. Przykleja się na górze ekranu,
a następna wjeżdża na nią. Nie ma ujemnych marginesów.

Zmierzone przy 1440×749 — wszystkie mieszczą się w jednym ekranie:

| sekcja | wysokość | tryb |
|---|---|---|
| hero | 636 | przyklejona |
| story | 484 | przyklejona |
| route | 626 | przyklejona |
| schedule | 540 | przyklejona |
| attendance | 651 | przyklejona |
| faq | 542 | przyklejona |
| contact | 498 | przyklejona |
| categories | 2644 | przewijana |
| gallery | 2413 | przewijana |
| prizes | 764 | przewijana |
| signup | 998 | przewijana |

Cztery ostatnie mają za dużo treści na jeden ekran i tak zostanie: `categories`
ma własny stos kart, `gallery` pięć kadrów, `prizes` talię 12 kart, `signup`
formularz 3-krokowy. Nadal wjeżdżają na poprzedni panel, więc efekt stosu jest
zachowany.

`app.js` → `setupPanels()` mierzy każdą sekcję przy starcie, po zmianie rozmiaru
okna i po zmianie języka, i sam oznacza ją jako przewijaną, jeśli się nie mieści.
Nic nie zostanie ucięte. Sekcje, które nigdy nie mają się przyklejać, są w zbiorze
`alwaysFlow` w tej funkcji.

Na telefonie 390×844 przyklejone są: hero, story, schedule, attendance, faq, contact.
`route` wypada o ~10 px, więc na wąskich ekranach przewija się normalnie.

### Magnetyczne przewijanie

`scroll-snap-type: y proximity` na `html`, `scroll-snap-align: start` na przyklejonych
panelach. **Proximity, nie mandatory** — dzięki temu długie sekcje nigdy nie
blokują przewijania. Wyłączone przy `prefers-reduced-motion` i na ekranach
niższych niż 620 px.

### Przejście przy skoku do sekcji

Kliknięcie linku `#sekcja` odpala krótki wipe z animowanymi kropkami, potem skok,
potem odsłonięcie. Desktop i telefon zachowują się identycznie. Element to
`.page-wipe`, tworzony przez `setupSectionTransition()` w `app.js`.

### Gęstość typografii

Rozmiary są ograniczone jednocześnie przez szerokość i **wysokość** okna:

```css
.section-title { font-size: clamp(34px, min(6.6vw, 10svh), 92px); }
```

Bez limitu na `svh` sam nagłówek przekraczał 100vh na laptopach. Jeśli
powiększasz font, sprawdź potem w DevTools atrybut `data-panel` na sekcji —
jeśli zmienił się na `flow`, przesadziłeś.

### Zgoda na regulamin

Zamiast dwóch checkboxów jest **jeden przycisk**. Klik otwiera pop-up, który
wczytuje prawdziwą treść z `regolamento.html` i `privacy.html` przez `fetch` —
nie kopię, więc dokumenty nigdy się nie rozejdą z tym, co jest na stronie.

Przycisk „Akceptuję" jest zablokowany do 98,5% przewinięcia; pasek u góry pokazuje
postęp. Krzyżyk zamyka bez akceptacji. Po akceptacji przycisk wypełnia się
zielenią z ptaszkiem i zaznacza dwa ukryte pola `rulesConsent` i `privacyConsent` —
czyli dane wysyłane do Make się nie zmieniły. Próba wysłania bez zgody potrząsa
przyciskiem i przewija do niego.

Zmierzone: 5071 px treści przy 499 px okna dialogu, więc przewinięcie jest realne.

### Trasa z perspektywą

`route-path.js` ma dwie funkcje:

- `buildRoutePathData()` — punkty 0–1 → gładka krzywa Catmull-Rom
- `buildRibbonPathData()` — krzywa → wypełniona wstążka zwężająca się ku horyzontowi

Szerokość zależy od pionowej pozycji punktu (`y/height` podniesione do kwadratu),
nie od postępu po linii — dzięki temu perspektywa jest poprawna niezależnie od
tego, który koniec jest startem.

viewBox SVG jest przeliczany z rzeczywistych proporcji kadru, żeby jedna jednostka
miała tę samą długość w obu osiach. Bez tego normalne wektory byłyby skośne
i wstążka wyglądałaby na skręconą.

Animacja rysowania działa przez maskę: gruby obrys z `stroke-dashoffset` odsłania
wypełnioną wstążkę. Zwykły `dasharray` nie działa na kształtach wypełnionych.

### Flagi

Windows nie ma kolorowych emoji dla par znaków regionalnych, więc `🇵🇱` renderuje
się jako litery „PL" — dlatego widziałeś „PL PL". `assets/js/flags.js` rysuje
prawdziwe flagi SVG dla IT, PL, GB, DE, ES, FR.

---

## 11. Czcionki — dwa kroje, wgrane do projektu

Strona ma teraz prawdziwy karnawałowy krój, nie systemowy zamiennik.

| Zmienna | Krój | Gdzie widać |
|---|---|---|
| `--font-display` | **Bungee** | tytuł hero, nazwy sekcji, licznik, marquee |
| `--font-meta` | **Baloo 2** (700–800) | przyciski, etykiety, eyebrow, stepper |
| `--font-body` | **Baloo 2** | akapity, formularze, cała reszta tekstu |

Definicje są na początku `assets/css/carnival.css`. Pliki leżą w
`public/assets/fonts/` — cztery sztuki, 85 kB razem:

```
bungee-latin.woff2       14 kB   podstawowa łacina, włoskie akcenty
bungee-latin-ext.woff2   11 kB   ą ć ę ł ń ó ś ź ż
baloo2-latin.woff2       33 kB
baloo2-latin-ext.woff2   27 kB
```

Bungee i Baloo 2 są na licencji OFL, więc self-hosting jest legalny i darmowy.

### Co było zepsute

Wcześniej stosy nazywały tylko Aptos, Segoe UI Variable i Bahnschrift Condensed —
kroje dostępne **wyłącznie na Windows albo w Microsoft 365**. Na macOS, iOS,
Androidzie i Linuksie każdy fallback schodził do Arial, więc strona wyglądała jak
inny projekt zależnie od urządzenia. Zgłaszałeś to trzy razy jako „czcionki nie
zmieniłeś" — i miałeś rację: zmieniane były same fallbacki, nie pierwszy krój
w stosie. Teraz pierwszym krojem jest plik, który leci razem ze stroną.

### Dlaczego nie Google Fonts z CDN

Ładowanie z `fonts.googleapis.com` wysyła IP każdego odwiedzającego do Google.
Strona przetwarza dane osobowe uczestników z UE i ma politykę prywatności, więc
to niepotrzebne ryzyko i niepotrzebny wpis w rejestrze przetwarzania. Pliki
`.woff2` w `public/` nie wychodzą poza Twój serwer.

### Jak podmienić krój na inny

1. Pobierz `.woff2` (Google Fonts → *Download family*, albo fontsource).
2. Wrzuć do `public/assets/fonts/`.
3. W `assets/css/carnival.css` podmień `src:` w bloku `@font-face` i pierwszą
   nazwę w `--font-display` albo `--font-meta`.
4. W `index.html` popraw dwa `<link rel="preload">` na nowe nazwy plików.

Nic więcej — cała strona czyta te trzy zmienne.

> **Uwaga na grubość.** Bungee ma jedną wagę (400). Gdyby ustawić mu
> `font-weight: 900`, przeglądarka dorysowałaby pogrubienie sama i litery
> zrobiłyby się rozmazane. Dlatego `--display-weight` to 400.

### Sprawdzenie, czy naprawdę się wgrały

```powershell
npm run preview
node tools/cdp.mjs probe tools/probe-sections.js --origin http://localhost:4173
```

W wyniku muszą być `"displayFont": "Bungee"`, `"bodyFont": "Baloo 2"` oraz
cztery pozycje `loaded` na liście `fonts`. Jeśli widzisz tam Segoe albo Aptos,
pliki nie doszły do `dist/assets/fonts/`.

---

## 12. Obrazy i prompty

Wszystkie obrazy w `public/assets/images/`:

| Plik | Gdzie użyty |
|---|---|
| `zjazd.png` | zdjęcie trasy (2,5 MB — warto przekonwertować na WebP) |
| `gallery-start.svg` … `gallery-finish.svg` | pięć kadrów galerii |
| `prizes.svg` | ikony 12 nagród, jeden plik z symbolami |
| `route-aerial.svg` | stara ilustracja trasy, nieużywana |

Gotowe prompty do wygenerowania nowych obrazów: **`PROMPTY-ZDJEC.md`**.
Są tam też wymagane proporcje i rozmiary każdego kadru oraz wspólny opis stylu,
żeby pięć obrazów wyglądało jak jedna sesja, a nie pięć różnych.

Po podmianie: wrzuć pliki do `public/assets/images/`, w panelu sekcja 03 wpisz
nowe ścieżki, zapisz draft i przenieś do `index.html`.

> **Nie podawaj obrazów AI za zdjęcia z wydarzenia.** Strona ma podpis
> „Podglądy ilustracyjne" — zostaw go, dopóki nie masz prawdziwych zdjęć.

---

## 13. Bezpieczeństwo i RODO

Co jest już zrobione w kodzie:

- webhook Make ukryty w sekrecie Workera, nie w kodzie strony
- biała lista pól: cokolwiek poza listą jest wycinane, nie trafia do Make
- `type` brany ze ścieżki URL, nie z ciała żądania, więc nie da się go podrobić
- limit 16 kB na żądanie, limit żądań na IP przy włączonym KV
- lista uczestników za hasłem, porównywanym w czasie stałym
- dane kontaktowe maskowane domyślnie, codice fiscale maskowany zawsze
- lista uczestników nigdzie nie zapisywana, hasło tylko w `sessionStorage`
- panel nie przechowuje imion, e-maili ani telefonów w konfiguracji
- `.gitignore` obejmuje `mcp.json`, `.dev.vars`, `.env`

Co musisz zrobić Ty:

- [ ] **Zabezpiecz `admin.html` po stronie hostingu.** `noindex` to nie hasło,
      a hasło do listy to nie autoryzacja. Cloudflare Access albo równoważne.
- [ ] Uzupełnij dane prawne organizatora w `privacy.html`
- [ ] Daj `regolamento.html` i treść liberatorii prawnikowi oraz ubezpieczycielowi
- [ ] Włącz MFA w Google, Make, Brevo i Meta
- [ ] Skonfiguruj SPF, DKIM i DMARC dla domeny nadawcy
- [ ] Ogranicz dostęp do arkusza Google do konkretnych osób
- [ ] Ustaw retencję historii scenariuszy w Make na minimum
- [ ] Przejdź checklistę z `MAKE-PLAN.md` sekcja 14

---

## 14. Co zostało zrobione

### Naprawione błędy

| Problem | Przyczyna | Status |
|---|---|---|
| Panel admina nie działał | `admin.css` i `admin.js` nie istniały w repo | naprawione |
| Wszystkie obrazy 404 w produkcji | Vite inline'ował SVG, a JS nadpisywał `src` surową ścieżką | naprawione, obrazy w `public/` |
| Nadpisania CSS nie działały w produkcji | Vite odwracał kolejność dwóch `<link>`; dev był poprawny | naprawione, jeden `site.css` z `@import` |
| Baner marquee zasłonięty | ujemny margines następnej sekcji zjadał 40 px pasa | naprawione, panele bez ujemnych marginesów |
| „PL PL" zamiast flagi | Windows nie ma kolorowych emoji flag | naprawione, flagi SVG |
| Sekcje nie nakładały się poprawnie | model na ujemnych marginesach | naprawione, `position: sticky` |
| Pierścienie nie na przycisku | wzór wyśrodkowany na sekcji, nie na przycisku | naprawione, JS mierzy pozycję |
| Kalendarz: lista 126 lat | zwykły `<select>` | naprawione, siatka 12 lat + dekady |
| Ikony Classic / ART jako emoji | `🛞` i `✦` | naprawione, ikony SVG |
| Czcionki tylko dla Windows | Aptos, Segoe UI Variable, Bahnschrift bez fallbacków | naprawione |
| **Strona utykała na loaderze 0%** | nakładka napędzana `requestAnimationFrame`; przy martwym JS albo zatrzymanym rAF zostawała na zawsze i zasłaniała stronę | naprawione, trzy niezależne zabezpieczenia |
| Nie było widać gdzie ustawić trasę | edytor był czwartą z siedmiu sekcji, bez nawigacji | naprawione, pasek „Skocz do" + wyróżniona sekcja + instrukcja w środku |
| Nie było wiadomo co wpisywać w panelu | pola bez przykładów | naprawione, placeholder i podpowiedź w każdym polu |

### Dodane funkcje

- panele 100vh z przyklejaniem i automatyczną degradacją zbyt wysokich sekcji
- magnetyczne przewijanie (proximity)
- przejście z wipe przy skokach do sekcji
- prawdziwe zdjęcie trasy + animowana wstążka z perspektywą
- edytor trasy w panelu: punkty, przeciąganie, klawiatura, dwa suwaki perspektywy
- jedna bramka zgody z pop-upem odblokowywanym przewijaniem
- lista uczestników w panelu: Make albo CSV, maskowanie, filtr, wydruk kart A4
- proxy Cloudflare Worker z walidacją, białą listą i limitami
- endpoint `roster` za hasłem
- szablony maili w 6 językach, dwa PDF-y na zgłoszenie
- flagi SVG, ikony kategorii SVG, kalendarz z siatką lat
- kompaktowy formularz: krok mieści się w ekranie (432 px z 749 na desktopie,
  585 z 693 na telefonie)
- mail organizatora zmieniony na `info@carruleddhishow.com` w 16 miejscach

### Wynik ostatniego audytu

```
strona 1440×900 : 0 błędów JS, 11 paneli, 7 przyklejonych, 0 nieoznaczonych,
                  7 flag SVG, 2 ikony kategorii, 6 obrazów, 0 uszkodzonych
strona 390×844  : 0 błędów JS, 6 paneli przyklejonych, 0 uszkodzonych obrazów
panel admina    : 0 błędów JS, 7 sekcji, 6 uchwytów trasy, wstążka rysowana,
                  suwaki 26/5, tabela listy, arkusz wydruku, 5 endpointów w trybie demo
```

---

## 15. Czego nie ma

| Zadanie | Dlaczego |
|---|---|
| **PDF uzupełniony danymi uczestnika** | teraz w mailu leci pusty formularz do wypełnienia ręcznie; docelowo ma przychodzić gotowy, do samego podpisu |
| **Kino trasy** | zdjęcie zjazdu wjeżdżające na środek, rozszerzające się, z wózkiem jadącym do mety |
| Podpis cyfrowy na PDF | uczestnik podpisuje odręcznie wersję włoską — to wymóg, nie brak |
| Prawdziwe zdjęcia w galerii | prompty gotowe w `PROMPTY-ZDJEC.md`, generowanie po Twojej stronie |
| Formularz zapisu bez przewijania poniżej 840 px | trzy kroki mieszczą się w 844 px; na krótszych ekranach nadal trzeba przewinąć |

Dwie rzeczy z tej listy **przestały** tu należeć i warto wiedzieć, że są zrobione:
globalny licznik „Będę tam" (liczy Supabase, nie Make) oraz webfonty (`.woff2`
leżą w `public/assets/fonts/`, nic nie idzie do Google).

---

## 16. Rozwiązywanie problemów

**Zmieniłem CSS, w dev widać, w produkcji nie.**
Reguła jest w pliku podłączonym osobnym `<link>`. Wszystko musi iść przez
`assets/css/site.css`. Nie dodawaj drugiego `<link rel="stylesheet">` do
`index.html` — Vite odwraca wtedy kolejność w builadzie.

**Obrazy działają lokalnie, na serwerze 404.**
Plik nie leży w `public/assets/images/`. Przenieś go tam i używaj ścieżek
zaczynających się od `/assets/images/`.

**Panel nie przyjmuje mojej ścieżki do obrazu.**
Dozwolony jest tylko wzorzec `/assets/images/nazwa.(svg|png|jpg|jpeg|webp|avif)`.
Wszystko inne panel odrzuca i zostawia poprzednią wartość.

**Wpisałem webhook Make w panelu i zniknął.**
Tak ma być. Pola endpointów przyjmują wyłącznie `/api/carruleddhi/...`.
Adres Make trzymaj jako sekret Workera.

**Sekcja jest ucięta na dole.**
Sprawdź w DevTools atrybut `data-panel` na tej sekcji. Jeśli `pinned`, a treść
nie wchodzi — zmniejsz w niej rozmiary albo dopisz jej `id` do `alwaysFlow`
w `setupPanels()` w `app.js`.

**Zamiast flagi widzę „PL".**
Gdzieś został emoji flagi. Używaj `flagSvg()` z `assets/js/flags.js`.

**Lista uczestników zwraca 401.**
Hasło w panelu nie zgadza się z sekretem `ROSTER_KEY` Workera. Ustaw ponownie:
`npx wrangler secret put ROSTER_KEY` i zdeployuj.

**Lista uczestników zwraca 503.**
Sekret `ROSTER_KEY` nie jest ustawiony, czyli endpoint jest wyłączony. To
zachowanie domyślne, żeby dane osobowe nie wyciekły przez zapomniany endpoint.

**Numery startowe się powtarzają albo przeskakują.**
Numer wynika z numeru wiersza w arkuszu `Registrations`. Nie sortuj i nie usuwaj
wierszy w trakcie zapisów. Włącz w scenariuszu **sequential processing**, żeby
dwa równoczesne zgłoszenia nie dostały tego samego numeru.

**Maile lecą w spam.**
Brakuje SPF i DKIM dla domeny nadawcy. Nie wysyłaj z prywatnego adresu Gmail
przez Brevo bez zweryfikowanej domeny.

**Przycisk „Akceptuję" w regulaminie się nie odblokowuje.**
Trzeba przewinąć treść do samego końca, do 98,5%. Jeśli dokumenty się nie
wczytały, pop-up pokaże link do otwarcia ich w nowej karcie — wtedy sprawdź,
czy `regolamento.html` i `privacy.html` są dostępne pod tym samym hostem.

**Scenariusze nie pojawiają się w MCP.**
Muszą mieć harmonogram **On demand**. Potem sprawdź `MAKE_TEAM` i zakresy klucza.

**Strona stoi na animacji wejścia i nic się nie dzieje.**
Nie otwieraj `dist/index.html` podwójnym klikiem. Przez `file://` przeglądarka
blokuje moduły ES, więc cały JavaScript strony nie startuje. Używaj
`npm run preview` albo prawdziwego serwera.

Nakładka ma teraz trzy zabezpieczenia, więc nawet w tym scenariuszu sama się
usunie: pasek postępu jest animacją CSS (nie może się zaciąć), watchdog w JS
zdejmuje ją po stałym czasie, a klasa `no-js` na `<html>` sprawia, że przy
całkowicie wyłączonym JavaScripcie nakładka wcale się nie pokazuje. Jeśli mimo
tego coś stoi, otwórz konsolę — każdy modułowy błąd jest teraz łapany osobno
i wypisany jako `Carruleddhi: "nazwa" failed to initialise`.

---

## 17. Podpowiadanie adresu z Google — jak to zrobić

Pytałeś, jak sprawić, żeby przy wpisywaniu adresu od razu podpowiadał Google.
Nie wbudowałem tego, bo wymaga Twojego klucza i karty w Google Cloud, a klucz
jest widoczny w kodzie strony — bez ograniczeń zapłaciłbyś za czyjeś zapytania.
Poniżej co dokładnie trzeba zrobić, jak zdecydujesz.

### Wariant Google (najlepsze podpowiedzi, płatny po przekroczeniu limitu)

1. [console.cloud.google.com](https://console.cloud.google.com) → nowy projekt.
2. **APIs & Services → Library** → włącz **Places API (New)**.
3. **Credentials → Create credentials → API key**.
4. Natychmiast kliknij klucz → **Application restrictions → Websites** i dodaj
   `https://carruleddhishow.com/*` oraz `http://localhost:*`. Bez tego kroku
   każdy może skopiować klucz ze źródła strony i wygenerować Ci fakturę.
5. **API restrictions → Restrict key** → tylko *Places API (New)*.
6. **Billing** — trzeba podać kartę. Google daje miesięczny darmowy limit,
   ale bez karty API nie działa.
7. W `index.html` przed `</body>`:

```html
<script async
  src="https://maps.googleapis.com/maps/api/js?key=TWOJ_KLUCZ&libraries=places&language=it">
</script>
```

8. Dopisz w `assets/js/app.js` w `setupForm()`:

```js
const address = document.querySelector('[name="address"]');
if (address && window.google?.maps?.places) {
  const auto = new google.maps.places.Autocomplete(address, {
    fields: ['formatted_address'],
    types: ['address']
  });
  auto.addListener('place_changed', () => {
    const place = auto.getPlace();
    if (place?.formatted_address) address.value = place.formatted_address;
  });
}
```

**Zanim to wdrożysz:** dopisz Google do listy odbiorców danych w
`privacy.html`. Skrypt Places wysyła do Google to, co uczestnik wpisuje
w pole adresu, jeszcze przed wysłaniem formularza. To jest przekazanie danych
osobowych do państwa trzeciego i musi być w polityce prywatności.

### Wariant OpenStreetMap (darmowy, bez karty, bez klucza)

Nominatim ma darmowe wyszukiwanie adresów. Podpowiedzi są słabsze niż Google,
zwłaszcza w małych miejscowościach. Limit to jedno zapytanie na sekundę, więc
trzeba dodać opóźnienie po ostatnim wciśniętym klawiszu:

```js
https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=WPISANY_TEKST
```

Tu też trzeba wpisać OSM do polityki prywatności — dane wychodzą na zewnątrz
dokładnie tak samo.

### Wariant zero (to, co jest teraz)

Pole ma `autocomplete="street-address"`, więc przeglądarka i telefon
podpowiadają adres z własnej pamięci. Nic nie wychodzi na zewnątrz, nic nie
kosztuje, żadnego wpisu w polityce prywatności. Dla 40 zgłoszeń rocznie to
prawdopodobnie wystarczy — dlatego zostawiłem to tak i pytam, zamiast wdrażać
za Ciebie coś, co kosztuje i wymaga zgody RODO.

---

## 18. Ściana komentarzy — Supabase

Nowa sekcja `#wall` między FAQ a kontaktem. Komentarze leżą w Supabase, a strona
rozmawia z nimi **wyłącznie przez Workera**.

### Krok 1 — trzy migracje, po kolei

Supabase → **SQL Editor** → New query → wklej całą treść pliku → **Run**.
Kolejność ma znaczenie, `0003` rozszerza tabelę z `0001`.

| Plik | Co tworzy |
|---|---|
| `supabase/migrations/0001_wall_comments.sql` | tabela komentarzy + moderacja |
| `supabase/migrations/0002_event_data.sql` | zapisy, obecność, lista przypomnień, kontakt, newsletter, widok `public_counts` |
| `supabase/migrations/0003_wall_media.sql` | gwiazdki i zdjęcia w komentarzach + prywatny bucket |

Albo, jeśli masz CLI: `supabase db push` wykona wszystkie trzy.

**Uwaga na `0002`.** Numery startowe pochodzą z sekwencji Postgresa, nie z
`count(*) + 1`. Dwa jednoczesne zapisy przy `count` odczytałyby tę samą liczbę i
oba wzięłyby ten sam numer. Sekwencja tego nie potrafi. Obecność to jeden wiersz
na odwiedzającego z unikalnym indeksem, a nie licznik w kolumnie — bo licznik
trzeba odczytać, dodać i zapisać, i przy dwóch osobach naciskających w tej samej
sekundzie jedno naciśnięcie ginie.

### Krok 2 — cztery sekrety Workera

```powershell
cd worker
npx wrangler secret put SUPABASE_URL           # https://xxxx.supabase.co
npx wrangler secret put SUPABASE_SERVICE_KEY   # Settings → API → service_role
npx wrangler secret put WALL_SALT              # dowolny długi losowy ciąg
npx wrangler secret put ROSTER_KEY             # hasło do sekcji 08 i 09 admina
npx wrangler deploy
```

Prościej: `tools\deploy-worker.ps1` przechodzi z Tobą przez wszystkie sekrety po
kolei i sam mówi, których brakuje.

Bez tych sekretów Worker zwraca `WALL_DISABLED`, a sekcja pokazuje „ściana
chwilowo niedostępna". Endpoint w `index.html` jest już wpisany
(`/api/carruleddhi/wall`), więc po wdrożeniu zadziała bez zmian w kodzie.

### Dlaczego przez Workera, a nie wprost z przeglądarki

Klucz `service_role` omija Row Level Security. To znaczy, że **wszystko, co może
nim wstawić wiersz, może nim też czytać i usuwać** — łącznie ze zgłoszeniami
uczestników, gdyby kiedyś wylądowały w tym samym projekcie. Klucz nie ma prawa
znaleźć się w kodzie strony, którą każdy może podejrzeć. RLS w migracji jest
włączony i **nie ma żadnej polityki dla `anon`**, więc nawet gdyby ktoś zdobył
klucz publiczny, nie zobaczy ani nie zapisze nic.

### Moderacja — komentarze nie pojawiają się od razu

Każdy wiersz wpada z `approved = false` i strona go nie pokazuje. To celowe:
ściana na publicznej stronie wydarzenia zbiera spam i obelgi szybciej, niż da się
to obserwować, a jedno kliknięcie zatwierdzenia jest tańsze niż nazwa Twojego
wydarzenia obok cudzego wyzwiska.

Zatwierdzasz w **panelu admina → sekcja 09 Moderacja**. Hasło to ten sam
`ROSTER_KEY`, co przy liście uczestników — wpisujesz je raz w sekcji 08 i zostaje
na czas tej karty przeglądarki.

Trzy przyciski przy każdej wiadomości:

| Przycisk | Co robi |
|---|---|
| **Zatwierdź** | wiadomość pojawia się na stronie |
| **Ukryj** | zdejmuje ze strony, ale zostawia w bazie — można zatwierdzić ponownie |
| **Usuń** | usuwa wiersz **i zdjęcie z bucketa**, nieodwracalnie, dlatego pyta o potwierdzenie |

Filtr nad listą stoi domyślnie na **Oczekujące**, bo to jedyna rzecz, która
wymaga uwagi. Liczniki przy filtrach pokazują, ile czego jest.

Lista trzyma się w pamięci karty i po każdej akcji jest tylko **łatana
lokalnie**, nie pobierana od nowa. Przy dwudziestu wiadomościach pełne
odświeżenie po każdym kliknięciu gubiłoby pozycję przewijania — a Worker i tak
potwierdził zmianę, zanim odpowiedź do nas wróciła.

Limit: **3 wiadomości na 15 minut z jednego adresu**, liczone w bazie, nie w
pamięci Workera, żeby restart go nie zerował.

### Gwiazdki, zdjęcia i tłumaczenie

**Gwiazdki (1–5, opcjonalne).** To grupa `<input type="radio">`, nie pięć
przycisków — dzięki temu strzałki, tabulator i czytniki ekranu działają bez
jednej linii skryptu. Ocena poza zakresem 1–5 jest **odrzucana, nie przycinana**:
przycięta dziewiątka zapisałaby się jako piątka, której nikt nie wystawił.
Średnia liczy widok `wall_rating` i pokazuje się tylko wtedy, gdy ktoś już
zagłosował — „0,0 z 5, 0 głosów" czyta się jak zła recenzja wydarzenia, które się
jeszcze nie odbyło.

**Zdjęcia.** Przeglądarka zmniejsza je do 1600 px i przekodowuje na JPEG
**przed** wysłaniem: zdjęcie z telefonu ma 3–5 MB i 4000 px szerokości, a po
zmniejszeniu ~200–400 KB. Zmierzone: 3200×2400 → 1600×1200, 16 KB. Bez tego
upload szedłby po tym samym łączu komórkowym, na którym zdjęcie zrobiono.

Ustawienie `imageOrientation: 'from-image'` przy dekodowaniu jest ważniejsze, niż
wygląda — bez niego **każde** zdjęcie zrobione pionowo telefonem przychodzi
obrócone, bo matryca zapisuje je poziomo i zostawia obrót w nagłówku EXIF, który
canvas ignoruje.

Worker sprawdza plik **dwa razy**: zadeklarowany typ MIME (bo to on decyduje, co
przyjmie bucket) **i pierwsze bajty pliku**. Deklaracja to tylko napis, który
nadawca wybrał; skrypt przemianowany na `.jpg` nadal zaczyna się od złych bajtów.
Bez drugiego sprawdzenia bucket przyjąłby dowolną treść pod typem obrazka.

Bucket `wall-photos` jest **prywatny**. Zdjęcie z niezatwierdzonej wiadomości jest
więc nieosiągalne nawet dla kogoś, kto zgadłby adres. Zatwierdzone dostają
**podpisany link na godzinę** — dość na wizytę, za krótko, żeby link krążył.

Plik ląduje w buckecie **przed** wierszem w tabeli. Odwrotna kolejność wstawiłaby
na ścianę zepsuty obrazek w momencie zatwierdzenia. Jeśli zapis wiersza nie
wyjdzie, plik jest usuwany — inaczej zostawałby w buckecie na zawsze, bez niczego,
co by na niego wskazywało.

Klik na miniaturę otwiera `<dialog>` z krzyżykiem w kółku w prawym górnym rogu.
Native `<dialog>` z `showModal()` daje pułapkę fokusu, tło i obsługę Escape od
przeglądarki — trzy rzeczy, które ręcznie łatwo zrobić źle.

**Tłumaczenie to przycisk, nie automat.** Tłumaczenie wszystkiego przy wejściu
oznaczałoby jedno zapytanie na wiadomość na odwiedzającego do darmowej,
limitowanej usługi (MyMemory) — i podmieniałoby to, co ktoś naprawdę napisał, na
domysł maszyny. Drugie kliknięcie wraca do oryginału, a oryginał siedzi w DOM aż
do pierwszego kliknięcia. Wyniki są zapamiętane na czas życia strony, więc
przełączanie tam i z powrotem to jedno zapytanie, nie trzy. Tekst dłuższy niż 500
znaków jest **odrzucany, nie ucinany** — pół przetłumaczonego zdania jest gorsze
niż żadne.

Przycisk pokazuje się tylko wtedy, gdy język wiadomości różni się od języka
strony. Zmierzone: przy czterech wiadomościach (it, pl, de, es) i stronie po
polsku — **trzy** przyciski.

### Co jest przechowywane

| Kolumna | Po co |
|---|---|
| `display_name`, `place`, `message`, `locale` | to, co widać na stronie |
| `approved`, `approved_at`, `hidden_reason` | moderacja |
| `ip_hash` | **solony skrót**, nie adres — tylko do limitu i sprzątania po zalewie |
| `user_agent` | diagnostyka, obcięty do 300 znaków |

Surowych adresów IP nie zapisuję. Byłyby danymi osobowymi z obowiązkiem retencji
i zerową korzyścią operacyjną.

---

## 19. Codice fiscale zamieniony na kod pocztowy

Na Twoją prośbę pole `taxCode` (w polskiej wersji było opisane jako „Kod
podatkowy") zostało zamienione na `postalCode` — „Kod pocztowy", `CAP` po
włosku. Zmiana objęła jednym skryptem jedenaście plików: formularz, sześć
tłumaczeń, białą listę i walidator Workera, słownik maili, importer CSV listy
uczestników, szablon PDF, generator blueprintów i skrypt karmiący webhooka.

> **Zanim wydrukujesz moduły:** włoska liberatoria zwykle wymaga **codice
> fiscale**, nie kodu pocztowego. Jeśli organizatorzy albo ubezpieczyciel go
> potrzebują, trzeba to pole przywrócić — cofnij efekty
> `tools/rename-taxcode-to-postal.mjs` i uruchom `node tools/build-make-blueprints.mjs`.
> Nie zgaduję tego za Ciebie, bo to kwestia papierologii wydarzenia, nie kodu.

W arkuszu Google zmień nagłówek kolumny **G** z `taxCode` na `postalCode`.
Aktualny wiersz nagłówków jest w `make/JAK-WGRAC.md`.

---

## 20. Prawdziwa liczba osób i prawdziwe inicjały

Licznik pod „Naciśnij wielki przycisk" i sześć kółek z inicjałami czytają teraz
bazę, nie stałą z konfiguracji.

### Skąd się to bierze

Jeden endpoint, jedno zapytanie: `POST /api/carruleddhi/counts`. Worker czyta
widok `public_counts` z Supabase i zwraca:

```json
{ "ok": true, "attendees": 1234, "pilots": 57, "initials": ["MR","GP","HP","AB","ZK"] }
```

Kółka pokazują pierwszych pięciu zapisanych zawodników, ostatnie zawsze mówi
**„+ ile jeszcze"**. Zmierzone na podstawionej odpowiedzi: przy pięciu inicjałach
`MR GP HP AB ZK` i `+1229`, przy dwóch — dwa kółka z danymi, trzy schowane,
`+1`.

### Dlaczego tylko inicjały

Widok `public_counts` zwraca **wyłącznie liczby i dwuliterowe skróty**. Żadnego
nazwiska, adresu, maila ani telefonu. Dwie litery nie prowadzą do konkretnej
osoby, i to jest cała różnica między ścianą prawdziwych ludzi a publikowaniem
listy uczestników.

Widok działa z uprawnieniami właściciela (`security_invoker = false`), więc
potrafi czytać tabele, których wołający nie może dotknąć. Dlatego strona ma
prawdziwe liczby, a nikt nie może z niej wyciągnąć nazwiska.

### Dlaczego nie z arkusza Google

Odczyt z arkusza to zapytanie do API Google na każdego odwiedzającego, a limit
liczy się na minutę, nie na osobę. Licznik przestałby działać dokładnie wtedy,
kiedy strona stałaby się popularna. Arkusz zostaje tym, czym jest — miejscem
pracy organizatorów.

### Obecność idzie w dwa miejsca

Naciśnięcie przycisku zapisuje wiersz w Supabase **i** leci dalej do Make.
Odpowiedź wraca od razu z nowym łącznym wynikiem, a wysyłka do Make dzieje się
w `waitUntil`, czyli już po odpowiedzi. Wolny webhook nie opóźnia licznika, a
awaria webhooka nie gubi zapisanego naciśnięcia.

Identyfikator odwiedzającego powstaje w przeglądarce i leży w localStorage. To
nie konto i nie odcisk palca — tylko coś stałego na tyle, żeby jedna osoba nie
policzyła się dwa razy. Pilnuje tego unikalny indeks w bazie, więc drugie
naciśnięcie jest **niemożliwe**, nie „nieprawdopodobne".

---

## 21. Formularz zapisu na jednym ekranie

Zmierzone przy 390×844 przed poprawką: krok 1 kończył się na 808 px, krok 2 na
988 px, przy ekranie 844 px. Czyli na obu krokach ostatnie pola i przycisk
„Dalej" były pod zgięciem.

Odzyskane 190 px z trzech miejsc, z których żadne nie jest potrzebne podczas
wypełniania formularza:

| Co | Ile |
|---|---|
| akapit wstępu nad formularzem | 93 px |
| wysokość pól i odstępy w wierszach | ~70 px |
| pasek kroków | 26 px |

Po poprawce wszystkie trzy kroki mieszczą się w 844 px. Sekcja dostała
`scroll-snap-align: start`, więc zatrzymuje się magnetycznie — ale **została
w normalnym przepływie**, nie jest przyklejona i nie obcina treści. Gdyby jakieś
tłumaczenie kiedyś wydłużyło krok, treść nadal będzie osiągalna przewijaniem.

**Na ekranach niższych niż ~840 px kroki 1 i 2 nadal wymagają przewinięcia.**
Zmierzone przy 390×780: krok 1 kończy się na 805 px. Dalsze upychanie oznaczałoby
pola tak ciasne, że trudno w nie trafić palcem, więc tego nie zrobiłem.
