# Carruleddhi Show 2026 — plan automatyzacji Make.com

> **Konfiguracja techniczna (MCP, klucze, proxy) jest w [`MCP-MAKE-SETUP.md`](MCP-MAKE-SETUP.md).**
> Ten dokument opisuje *logikę* scenariuszy: arkusze, router, PDF, e-maile i przypomnienia.
> Proxy `/api/carruleddhi/*` z sekcji 4 jest już zaimplementowane w katalogu `worker/`.

Stan na **18 sierpnia 2026 r.** Dokument opisuje wdrożenie formularzy, numerów startowych, PDF, e-maili, przypomnień, licznika „Będę tam”, kontaktu oraz opcjonalnego WhatsApp Business.

## 1. Rekomendowany wariant

### Najrozsądniejszy bezpłatny start

1. Strona statyczna: Cloudflare Pages, Netlify albo GitHub Pages.
2. Make.com: jeden scenariusz odbierający wszystkie formularze oraz jeden scenariusz wysyłający przypomnienia.
3. Google Sheets: prosta baza uczestników, przypomnień i kontaktów.
4. Google Docs + Drive: szablon zgłoszenia i generowanie PDF.
5. Brevo: potwierdzenia i przypomnienia e-mail.
6. WhatsApp: na początku kanał WhatsApp albo ręczne listy transmisyjne w aplikacji WhatsApp Business; oficjalną automatyzację Cloud API uruchomić dopiero po akceptacji szablonów i kosztów.

Brevo publicznie podaje limit **300 bezpłatnych e-maili dziennie** dla API, bez wymagania karty: [Brevo Email API](https://www.brevo.com/features/email-api/). Make ma oficjalne moduły Brevo: [dokumentacja Make — Brevo](https://apps.make.com/sendinblue). Aktualny plan Make należy sprawdzić bezpośrednio na [stronie cenowej Make](https://www.make.com/en/pricing); bezpłatny plan ma minimum 15 minut między uruchomieniami harmonogramu, a dostępna pula kredytów może się zmieniać.

### Ważne ograniczenie „za darmo”

Przy 412 subskrybentach pojedynczy e-mail wysłany wszystkim tego samego dnia przekroczy limit Brevo 300/dzień. Darmowy wariant wystarczy, jeśli liczba osób zapisanych na przypomnienia nie przekroczy dziennego limitu. Powyżej limitu trzeba:

- przejść na płatny pakiet e-mail;
- rozłożyć niekrytyczne wiadomości na dwa dni;
- ograniczyć przypomnienia do najważniejszych dwóch;
- lub wykorzystać bezpłatny kanał WhatsApp/Telegram jako komunikację publiczną.

## 2. Dlaczego nie CallMeBot

CallMeBot nie jest oficjalną warstwą WhatsApp Business Platform. Dla strony wydarzenia przetwarzającej dane osobowe oznacza to ryzyko:

- przerwania działania bez gwarantowanego SLA;
- zablokowania numeru lub sesji;
- problemów z kontrolą zgód i wypisaniem;
- braku odpowiedniej umowy powierzenia danych;
- braku zatwierdzonych szablonów i audytowalnego statusu dostarczenia.

Do wdrożenia publicznego rekomendowana jest oficjalna integracja **WhatsApp Business Cloud** dostępna w Make: [dokumentacja modułu Make](https://apps.make.com/whatsapp-business-cloud) i [strona integracji Make](https://www.make.com/en/integrations/whatsapp-business-cloud).

## 3. WhatsApp Business — co jest naprawdę darmowe

### Oficjalna automatyzacja Cloud API

Meta rozlicza proaktywne wiadomości szablonowe według kategorii i kraju odbiorcy. Aktualne zasady i stawki są publikowane na [oficjalnej stronie cenowej WhatsApp Business Platform](https://business.whatsapp.com/products/platform-pricing). Meta wymaga, aby powiadomienia szablonowe trafiały do osób, które wcześniej wyraziły zgodę; opis szablonów znajduje się w [dokumentacji Meta](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates).

Dla Carruleddhi trzy wiadomości wysłane 7 dni, 1 dzień i 3 godziny przed wydarzeniem będą zwykle wiadomościami inicjowanymi przez firmę poza 24-godzinnym oknem obsługi. Należy więc założyć, że:

- wymagają zatwierdzonego szablonu `utility` albo kategorii nadanej przez Meta;
- wymagają osobnego, jednoznacznego opt-in na WhatsApp;
- mogą być naliczane osobno za każdą dostarczoną wiadomość;
- nie wolno obiecywać, że będą zawsze bezpłatne.

Oficjalna strona Meta opisuje szczególne bezpłatne okno 72 godzin po wejściu klienta z reklamy Click-to-WhatsApp lub przycisku CTA. Nie jest to trwały darmowy mechanizm dla zaplanowanych przypomnień o wydarzeniu.

### Bezpłatne alternatywy

| Opcja | Automatyczna | Koszt API | Personalizacja | Ocena |
|---|---:|---:|---:|---|
| Brevo e-mail | Tak | 0 do limitu 300/dzień | Pełna | Najlepszy start |
| Kanał WhatsApp | Nie przez Make, publikacja ręczna | 0 | Brak | Dobry do ogłoszeń |
| Listy transmisyjne WhatsApp Business | Ręczne | 0 | Ograniczona | Dobre dla małej grupy; odbiorca zwykle powinien mieć zapisany numer |
| Telegram Bot API | Tak | 0 | Pełna | Najlepsza bezpłatna automatyczna alternatywa, ale użytkownik musi uruchomić bota |
| Meta WhatsApp Cloud API | Tak | Zależny od stawek Meta | Pełna | Profesjonalne rozwiązanie docelowe |
| CallMeBot / nieoficjalne bramki | Tak | Bywa 0 | Ograniczona | Nie używać produkcyjnie |

## 4. Architektura

```text
Przeglądarka
   │
   ├── POST /api/carruleddhi ──► Cloudflare Worker / Netlify Function (zalecane)
   │                                │
   │                                ├── walidacja, rate limit, Turnstile
   │                                └── webhook Make.com
   │
   └── GET /api/counts ◄──────── globalny licznik obecności

Make: Scenariusz A „Carruleddhi — Intake”
   Custom webhook
       └── Router po polu `type`
           ├── registration ─► Google Sheets ─► PDF ─► Brevo
           ├── reminder     ─► Google Sheets ─► Brevo confirmation
           ├── attendance   ─► Data Store / Sheets counter
           ├── contact      ─► Sheets ─► e-mail organizatora
           └── counts       ─► Webhook response

Make: Scenariusz B „Carruleddhi — Reminder Dispatcher”
   Harmonogram co 15 minut
       └── Google Sheets: rekordy przypadające teraz
           ├── Brevo e-mail
           ├── opcjonalnie WhatsApp Cloud API / Telegram
           └── ustawienie `sent_at` oraz statusu
```

### Dlaczego proxy przed Make

Wklejenie adresu webhooka Make bezpośrednio do publicznego `index.html` działa, ale każdy może go odczytać i wysyłać spam. Przed publikacją produkcyjną zalecany jest bezpłatny Cloudflare Worker albo Netlify Function, który:

- ukryje webhook Make w zmiennej środowiskowej;
- sprawdzi Cloudflare Turnstile;
- ograniczy liczbę żądań z jednego IP;
- odrzuci nieznane pola i za długie wartości;
- doda sekret serwer–serwer, którego nie ma w kodzie przeglądarki.

Na szybki test można użyć webhooka Make bezpośrednio, ale nie należy tak pozostawić formularzy na publicznej domenie.

## 5. Konfiguracja arkusza Google Sheets

Utwórz plik `Carruleddhi Show 2026 — database` i arkusze:

### `Participants`

```text
race_number
created_at
first_name
last_name
birth_date
tax_code
email
phone
address
cart_name
category
team_name
cart_notes
rules_consent_at
privacy_consent_at
news_consent_at
locale
status
pdf_url
email_status
```

Statusy: `pending`, `confirmed`, `rejected`, `cancelled`.

### `Reminders`

```text
id
created_at
name
email
phone_e164
channel_email
channel_whatsapp
channel_telegram
consent_at
consent_source
unsubscribe_token
event_at
reminder_7d_at
reminder_1d_at
reminder_3h_at
sent_7d_at
sent_1d_at
sent_3h_at
status
```

Statusy: `active`, `unsubscribed`, `bounced`, `completed`.

### `Attendance`

```text
visitor_id
created_at
source
locale
```

`visitor_id` jest losowym identyfikatorem, bez imienia i e-maila.

### `Contacts`

```text
id
created_at
name
email
message
locale
status
answered_at
```

### `Counters`

```text
key,value,updated_at
last_race_number,38,...
attendees,412,...
```

## 6. Scenariusz A w Make — jeden webhook i router

Nazwa: `Carruleddhi 2026 — Intake API`

### Moduły wspólne

1. **Webhooks → Custom webhook** — nazwa `carruleddhi-intake`.
2. **Tools → Set variables**:
   - `request_type = lower(type)`;
   - `email_normalized = lower(trim(email))`;
   - `received_at = now`.
3. Filtr odrzucający żądanie, jeśli `type` nie jest jednym z: `registration`, `reminder`, `attendance`, `contact`, `counts`.
4. **Router** z pięcioma trasami.
5. W ustawieniach scenariusza włącz **sequential processing**, aby dwa równoczesne zgłoszenia nie dostały tego samego numeru.

### Trasa 1: `registration`

Filtr: `type = registration`.

1. Sprawdź wymagane pola i format e-mail.
2. Google Sheets → Search Rows: wyszukaj ten sam e-mail i `cart_name` dla wydarzenia.
3. Jeśli duplikat: Webhook Response `409` z `{"ok":false,"code":"DUPLICATE"}`.
4. Make Data Store albo arkusz `Counters` → pobierz `last_race_number`.
5. Zwiększ o 1 i zapisz. Format numeru: `padStart(3, "0")`.
6. Google Sheets → Add a Row do `Participants`.
7. Webhooks → Webhook response od razu:

```json
{
  "ok": true,
  "raceNumber": "039"
}
```

8. Google Docs → Create a Document from a Template.
9. Zastąp pola: `{{RACE_NUMBER}}`, `{{FULL_NAME}}`, `{{BIRTH_DATE}}`, `{{TAX_CODE}}`, `{{ADDRESS}}`, `{{PHONE}}`, `{{EMAIL}}`, `{{CART_NAME}}`, `{{CATEGORY}}`, `{{TEAM}}`, `{{DATE}}`.
10. Google Drive → Export/Download jako PDF.
11. Brevo → Send a Transactional Email:
    - do uczestnika;
    - temat: `Iscrizione Carruleddhi Show 2026 — numero {{race_number}}`;
    - załącz PDF lub bezpieczny link Drive;
    - kopia organizacyjna opcjonalnie do `info@carruleddhishow.com`.
12. Zaktualizuj `pdf_url`, `email_status` i `status=confirmed`.
13. Jeśli moduł PDF/e-mail zwróci błąd, pozostaw `status=pending_email` i wyślij alert do organizatora.

### Trasa 2: `reminder`

Filtr: `type = reminder` oraz `consent = true`.

1. Normalizuj e-mail i odrzuć duplikat aktywnego zapisu.
2. Wygeneruj `id` oraz losowy `unsubscribe_token`.
3. Wylicz względem `2026-10-17T14:30:00+02:00`:
   - `reminder_7d_at = event_at - 7 dni`;
   - `reminder_1d_at = event_at - 1 dzień`;
   - `reminder_3h_at = event_at - 3 godziny`.
4. Dodaj rekord do `Reminders`.
5. Brevo → wyślij potwierdzenie zapisu z linkiem rezygnacji.
6. Webhook response:

```json
{"ok":true,"status":"subscribed"}
```

Jeśli zapis nastąpi po jednym z terminów, nie próbuj wysyłać zaległej wiadomości; zaplanuj tylko przyszłe.

### Trasa 3: `attendance`

Filtr: `type = attendance` i istnieje `attendeeId`.

1. Search Rows/Data Store: sprawdź `visitor_id`.
2. Jeśli nowy: dodaj rekord i zwiększ `Counters.attendees`.
3. Jeśli duplikat: nie zwiększaj.
4. Odpowiedz aktualną wartością:

```json
{"ok":true,"attendees":413,"counted":true}
```

Przy większym ruchu nie kieruj każdego kliknięcia do Make, bo szybko zużywa kredyty. Globalny licznik lepiej przechowywać w Cloudflare D1/KV albo Supabase, a do Make przesyłać tylko podsumowanie.

### Trasa 4: `contact`

1. Walidacja e-mail, minimum 10 znaków wiadomości, maksimum np. 3000.
2. Dodaj wiersz do `Contacts`.
3. Brevo → wyślij wiadomość do `info@carruleddhishow.com` z `Reply-To` ustawionym na adres nadawcy.
4. Opcjonalnie wyślij krótkie potwierdzenie do nadawcy.
5. Odpowiedz `{"ok":true}`.

### Trasa 5: `counts`

1. Odczytaj `Counters.attendees` i liczbę `Participants` ze statusem `confirmed`.
2. Odpowiedz:

```json
{
  "ok": true,
  "attendees": 413,
  "pilots": 39,
  "updatedAt": "2026-08-18T12:00:00Z"
}
```

## 7. Scenariusz B — wysyłka przypomnień

Nazwa: `Carruleddhi 2026 — Reminder Dispatcher`.

Harmonogram bezpłatnego planu: co 15 minut. Dla przypomnienia „3 godziny przed” różnica do 15 minut jest akceptowalna; oficjalna strona Make wskazuje 15-minutowy minimalny interwał bezpłatnego planu: [Make pricing](https://www.make.com/en/pricing).

1. **Scheduler** → co 15 minut.
2. Google Sheets → Search Rows w `Reminders`:
   - `status = active`;
   - jeden z terminów `<= now`;
   - odpowiadające mu pole `sent_*_at` jest puste.
3. Iterator po maksymalnie 50 rekordach na wykonanie.
4. Router według terminu: `7d`, `1d`, `3h`.
5. Brevo → Send Transactional Email.
6. Opcjonalnie, tylko przy osobnym opt-in: WhatsApp Business Cloud → Send a Template Message albo Telegram Bot → Send a Text Message.
7. Po potwierdzonym wysłaniu wpisz `sent_*_at=now`.
8. Po trzeciej wiadomości ustaw `status=completed`.
9. Przy błędzie nie wpisuj `sent_at`; zapisz `last_error`, zwiększ `attempts`, ponów maksymalnie 3 razy.

### Ochrona przed podwójną wysyłką

Przed wysłaniem ustaw pomocniczo `locked_until = now + 10 minut` i `locked_by = executionId`. Filtruj rekordy z aktywną blokadą. Po sukcesie wyczyść blokadę i ustaw `sent_at`.

## 8. Szablony e-mail Brevo

Brevo wspiera wiadomości transakcyjne i API: [dokumentacja wysyłki transakcyjnej](https://developers.brevo.com/docs/send-a-transactional-email). Utwórz i zweryfikuj domenę nadawcy, np. `info@carruleddhi-show.it`; nie wysyłaj z prywatnego adresu bez SPF/DKIM.

### `registration_confirmed`

Temat: `Sei in gara — Carruleddhi Show #{{raceNumber}}`

Treść:

- potwierdzenie daty i miejsca;
- numer startowy;
- nazwa środka i kategoria;
- PDF;
- obowiązkowy kask i dokument;
- kontakt organizatora;
- link do regulaminu i privacy.

### `reminder_7d`

Temat: `Tra una settimana si scende!`

- data, miejsce, mapa;
- program;
- przypomnienie o kasku;
- link rezygnacji z kolejnych przypomnień.

### `reminder_1d`

Temat: `Domani: Carruleddhi Show 2026`

- godzina prezentacji i startu;
- mapa/dojazd;
- dokumenty i wyposażenie;
- numer kontaktowy.

### `reminder_3h`

Temat: `Ci vediamo tra poco alla Rena Bianca`

- krótka wiadomość;
- godzina zbiórki;
- link do mapy;
- informacja pogodowa tylko jeśli pochodzi z wiarygodnego źródła.

## 9. Oficjalny WhatsApp Cloud API — wdrożenie opcjonalne

1. W Meta Business Suite sprawdź i uzupełnij firmę.
2. Utwórz aplikację typu Business i dodaj WhatsApp.
3. Utwórz/połącz WhatsApp Business Account.
4. Nie przenoś głównego numeru bez sprawdzenia, czy dla konta dostępny jest tryb współistnienia z aplikacją WhatsApp Business.
5. Dodaj metodę rozliczeń wymaganą przez Meta — nawet jeśli część ruchu okaże się bezpłatna.
6. Dodaj w formularzu osobny checkbox:

```text
Chcę otrzymać trzy przypomnienia przez WhatsApp na podany numer.
Mogę wycofać zgodę w każdej chwili.
```

7. Zapisuj: dokładną treść zgody, datę, źródło, numer w formacie E.164 i wersję polityki.
8. Utwórz włoski szablon, np. `carruleddhi_event_reminder_it`:

```text
Ciao {{1}}, Carruleddhi Show 2026 inizia {{2}}.
Ritrovo: {{3}}. Mappa: {{4}}.
Per non ricevere altri promemoria rispondi STOP.
```

9. Prześlij szablon do akceptacji Meta. Nie nazywaj go marketingowym i nie dodawaj reklamy, jeśli jego celem jest wyłącznie przypomnienie zamówione przez użytkownika.
10. W Make użyj oficjalnego modułu WhatsApp Business Cloud i mapuj parametry szablonu.
11. Obsłuż webhook odpowiedzi `STOP`: ustaw `channel_whatsapp=false` i zapisz datę rezygnacji.
12. Monitoruj statusy `sent`, `delivered`, `read`, `failed`, ale nie używaj ich do profilowania.

## 10. Podłączenie strony

Na końcu `index.html` istnieje konfiguracja:

```js
window.CARRULEDDHI_CONFIG = {
  eventDate: '2026-10-17T14:30:00+02:00',
  pilotsBase: 38,
  attendeesBase: 412,
  endpoints: {
    registration: '',
    reminder: '',
    attendance: '',
    counts: '',
    contact: ''
  }
};
```

### Wariant testowy — bez proxy

Wklej ten sam adres Custom Webhook Make do czterech pól. Router rozpozna żądanie po `type`.

```js
endpoints: {
  registration: 'https://hook.eu1.make.com/TWOJ_WEBHOOK',
  reminder: 'https://hook.eu1.make.com/TWOJ_WEBHOOK',
  attendance: 'https://hook.eu1.make.com/TWOJ_WEBHOOK',
  counts: 'https://hook.eu1.make.com/TWOJ_WEBHOOK',
  contact: 'https://hook.eu1.make.com/TWOJ_WEBHOOK'
}
```

To rozwiązanie służy tylko do testu — URL stanie się publiczny.

### Wariant produkcyjny

Wpisz własne ścieżki proxy:

```js
endpoints: {
  registration: '/api/carruleddhi',
  reminder: '/api/carruleddhi',
  attendance: '/api/carruleddhi',
  counts: '/api/carruleddhi',
  contact: '/api/carruleddhi'
}
```

Webhook Make przechowuj jako sekret `MAKE_WEBHOOK_URL` po stronie Workera/Function.

### Dane wysyłane przez stronę

Każde żądanie zawiera:

```json
{
  "type": "registration | reminder | attendance | contact",
  "event": "Carruleddhi Show 2026",
  "eventDate": "2026-10-17T14:30:00+02:00",
  "locale": "it",
  "source": "website",
  "submittedAt": "ISO-8601",
  "...": "pola właściwe dla formularza"
}
```

Make powinien odrzucać każde pole spoza białej listy.

## 11. Bezpieczeństwo i RODO

1. Włącz HTTPS.
2. Dodaj Turnstile do formularza rejestracji, przypomnienia i kontaktu.
3. Ogranicz żądania, np. 5 formularzy/IP/10 minut i 1 obecność/visitorId.
4. Nie umieszczaj tokenów Brevo, Meta ani Make w JavaScript strony.
5. W Make maskuj dane w logach i ogranicz retencję historii scenariuszy.
6. Udziel dostępu do arkusza wyłącznie konkretnym organizatorom.
7. Włącz MFA w Google, Make, Brevo i Meta.
8. Nie wysyłaj kodu podatkowego w temacie e-mail ani w powiadomieniu WhatsApp.
9. PDF udostępniaj jako załącznik lub link wymagający tokenu i wygasający po wydarzeniu.
10. Dodaj proces usunięcia, korekty, rezygnacji i eksportu danych.
11. Podpisz/zaakceptuj umowy powierzenia danych z dostawcami.
12. Przed startem uzupełnij dane prawne organizatora w `privacy.html` i zweryfikuj `regolamento.html` z ubezpieczycielem oraz prawnikiem.

## 12. Szacunek kredytów Make

Make rozlicza czynności modułów jako kredyty; opis jest na [stronie cenowej Make](https://www.make.com/en/pricing). Przykładowy koszt jednego przebiegu:

- kliknięcie obecności obsługiwane całkowicie w Make: około 2–4 kredytów;
- zapis na przypomnienia: około 3–5;
- kontakt: około 3–5;
- pełna rejestracja z arkuszem, PDF i e-mailem: około 8–14;
- wysłanie jednego przypomnienia i aktualizacja statusu: około 3–5.

Dla setek osób bezpłatna pula Make może nie wystarczyć. Największe oszczędności:

- globalny licznik przenieść do Cloudflare D1/KV lub Supabase;
- nie wykonywać osobnego wyszukania, jeśli można użyć jednego klucza Data Store;
- pobierać due reminders grupami;
- nie wysyłać zbędnych kopii e-mail;
- Make zostawić dla rejestracji, PDF i wiadomości.

## 13. Kolejność wdrożenia

### Etap 1 — 1–2 godziny

- załóż arkusz i karty;
- załóż Brevo, zweryfikuj nadawcę;
- utwórz Custom Webhook i router;
- podłącz formularz przypomnienia i kontakt;
- wykonaj test bez proxy.

### Etap 2 — pół dnia

- rejestracja uczestnika;
- sekwencyjny licznik numerów;
- szablon Google Docs;
- generowanie PDF;
- e-mail potwierdzający.

### Etap 3 — pół dnia

- arkusz Reminder;
- scenariusz harmonogramu;
- trzy e-maile;
- token i link rezygnacji;
- obsługa błędów i ponowień.

### Etap 4 — przed publikacją

- Cloudflare Worker/Netlify Function;
- Turnstile i rate limiting;
- SPF, DKIM i DMARC domeny;
- MFA;
- testy mobilne i dostępności;
- uzupełnienie danych prawnych oraz przegląd regulaminu.

### Etap 5 — opcjonalny WhatsApp

- WABA i Cloud API;
- osobna zgoda;
- zatwierdzony szablon;
- test na numerach zespołu;
- budżet i limit wydatków;
- obsługa STOP oraz statusów dostarczenia.

## 14. Testy przed uruchomieniem

- [ ] brak zgody blokuje wysyłkę;
- [ ] błędny e-mail jest odrzucany;
- [ ] dwa kliknięcia nie tworzą dwóch zapisów;
- [ ] dwa równoczesne zgłoszenia dostają różne numery;
- [ ] PDF zawiera poprawne dane i znaki włoskie/polskie;
- [ ] e-mail nie wpada do spamu po konfiguracji SPF/DKIM/DMARC;
- [ ] link rezygnacji natychmiast blokuje kolejne przypomnienia;
- [ ] scenariusz nie wysyła ponownie po błędzie aktualizacji arkusza;
- [ ] licznik zwraca tę samą wartość na dwóch urządzeniach;
- [ ] webhook odrzuca nieznany `type`, zbyt długie pola i spam;
- [ ] historia Make nie przechowuje danych dłużej niż potrzebne;
- [ ] operator potrafi ręcznie zatrzymać oba scenariusze;
- [ ] istnieje eksport i kopia arkusza przed wydarzeniem.

## 15. Decyzja końcowa

Dla tego wydarzenia rekomenduję:

- **e-mail: Brevo + Make** — automatycznie, bezpłatnie w ramach limitów;
- **WhatsApp: kanał WhatsApp na start** — darmowe ogłoszenia, bez ryzyka nieoficjalnej bramki;
- **WhatsApp Cloud API później** — tylko oficjalnie, z osobną zgodą, zatwierdzonym szablonem i małym budżetem;
- **nie używać CallMeBot do danych uczestników**;
- jeśli bezpłatne automatyczne wiadomości mobilne są warunkiem, użyć **Telegram Bot API** jako dodatkowego kanału opt-in.

---

### Źródła

- [Make — plany i sposób naliczania kredytów](https://www.make.com/en/pricing)
- [Make — WhatsApp Business Cloud](https://apps.make.com/whatsapp-business-cloud)
- [Make — integracja Brevo](https://apps.make.com/sendinblue)
- [WhatsApp Business Platform — oficjalne ceny](https://business.whatsapp.com/products/platform-pricing)
- [Meta — szablony wiadomości WhatsApp](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates)
- [Brevo — bezpłatne Email API](https://www.brevo.com/features/email-api/)
- [Brevo — wysyłka transakcyjna](https://developers.brevo.com/docs/send-a-transactional-email)

Treści źródłowe zostały sparafrazowane w celu zachowania zgodności z ograniczeniami licencyjnymi. Ceny, limity i zasady dostawców mogą się zmienić — należy sprawdzić je ponownie bezpośrednio przed uruchomieniem produkcyjnym.
