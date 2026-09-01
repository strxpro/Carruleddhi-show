# Make.com — krok po kroku, od zera do działających maili

## ŚCIĄGA — wszystkie scenariusze na jednym ekranie

Potrzebujesz **trzech** scenariuszy. Nigdzie nie ma routera.

### Scenariusz 1 · `Intake` — reaguje natychmiast, gdy przyjdą dane

Odbiera wszystko ze strony: zgłoszenia, zapisy na przypomnienia, kontakt.

```
 1. Webhooks · Custom webhook            ← skopiuj URL, wpiszesz go do Workera
 2. Tools · Set variable                 copy = całe emails/copy.json
 3. Tools · Set multiple variables        loc, t, ev, fullName, generated
 4. Google Sheets · Add a Row             → Registrations      [filtr: type = registration]
 5. Tools · Set variable                  raceNumber = numer wiersza + 37
 6. Webhooks · Webhook response           {"ok":true,"raceNumber":"..."}
 7. Flow Control · Iterator               ["it", język klienta]  [filtr: type = registration]
 8. Google Docs · From a Template          IT albo tłumaczenie, wybór przez switch()
 9. Google Drive · Download a File         format PDF
10. Tools · Array aggregator               zbiera oba PDF-y
11. Email · Send an Email                  mail + załączniki  [filtr: type = registration]
12. Telegram / WhatsApp / CallMeBot        powiadomienie do Ciebie [filtr: type = registration]
13. Google Sheets · Update a Row           status = confirmed
14. Google Sheets · Add a Row             → Reminders          [filtr: type = reminder]
15. Email · Send an Email                  wiadomość do Ciebie [filtr: type = contact]
```

### Scenariusz 2 · `Reminders` — chodzi z zegara co 15 minut

Nie może być na webhooku: przypomnienie 7 dni przed wydarzeniem trzeba wysłać
wtedy, gdy nikt nic nie przysyła.

```
1. Google Sheets · Search Rows      Reminders, status = active, max 50
2. Tools · Set multiple variables   due (7d / 1d / 3h), loc
3. Tools · Set variable + Set multi copy, t, ev
   ── filtr: due nie jest puste ──
4. Email · Send an Email            temat i treść przez switch(due)
5. Google Sheets · Update a Row     sent_7d_at / sent_1d_at / sent_3h_at
```

### Scenariusz 3 · `Roster` — reaguje natychmiast, gdy panel poprosi

Zasila sekcję 08 w panelu admina.

```
1. Webhooks · Custom webhook     [filtr: type = roster]
2. Google Sheets · Search Rows   Registrations, max 500
3. Tools · Array aggregator
4. Webhooks · Webhook response   {{toJSON(3.array)}}
```

### Kolejność pracy

| # | Co robisz | Gdzie w tym pliku |
|---|---|---|
| 1 | Wyłącz publiczny link CSV do arkusza | sekcja „Masz już arkusz" |
| 2 | Arkusz masz gotowy — pomiń część 1 | część 1 |
| 3 | SMTP Zimbra/OVH + SPF i DKIM | część 2 |
| 4 | Dwa szablony PDF w Google Docs | część 3 |
| 5 | Zbuduj scenariusz 1 | część 4 |
| 6 | Dopisz moduły 14 i 15 | część 5 |
| 7 | Zbuduj scenariusz 2 | część 6 |
| 8 | Powiadomienie: Telegram, WhatsApp albo CallMeBot | część 7 |
| 9 | Wdróż proxy i wpisz ścieżki na stronie | część 8 |
| 10 | Zbuduj scenariusz 3 | część 9 |
| 11 | Przejdź checklistę | część 10 |

Filtr ustawiasz klikając **kropkę na linii między modułami** → *Set up a filter*.
To zastępuje gałąź routera: gdy warunek nie przejdzie, Make po prostu kończy przebieg.

W ustawieniach scenariusza 1 włącz **Sequential processing**, inaczej dwa
równoczesne zgłoszenia mogą dostać ten sam numer startowy.

Dalej jest to samo, tylko rozpisane klik po kliku, z dokładnymi wartościami pól.

---

Instrukcja klikana. Rób po kolei, nie przeskakuj. Po każdej części jest test,
który musi przejść, zanim ruszysz dalej.

Czas: około 3 godziny na spokojnie.

Potrzebujesz trzech darmowych kont: **Google**, **Make.com**, **Cloudflare**.
WhatsApp/Telegram dopiero w części 7 i jest opcjonalny.

---

## Czym jest Brevo i czy go potrzebujesz

**Nie potrzebujesz.** Brevo to usługa do wysyłki maili. Make sam maili nie wysyła —
musi mieć czym, więc albo dajesz mu konto Brevo, albo **własny serwer SMTP**.

Skoro robisz wszystko w Make, wybierz drugą drogę: moduł **Email → Send an Email**
z Twoim SMTP. Cała ta instrukcja jest napisana pod ten wariant.

| | Make + własne SMTP | Make + Brevo |
|---|---|---|
| Dodatkowe konto | nie | tak |
| Szablony HTML | wklejasz w moduł | zarządzasz w panelu Brevo |
| Załączniki PDF | tak | tak |
| Limit dzienny | limit Twojego dostawcy (Gmail ~500/dzień) | 300/dzień na darmowym |
| Raporty dostarczenia | brak | tak |
| Ryzyko spamu | wyższe bez SPF/DKIM | niższe |

Przy kilkudziesięciu uczestnikach własne SMTP wystarczy z zapasem. Do Brevo warto
wrócić tylko wtedy, gdy zaczniesz wysyłać setki maili dziennie.

Pliki, których użyjesz:

- `emails/make-registration.html` — potwierdzenie zapisu, gotowe do wklejenia w Make
- `emails/make-reminder.html` — przypomnienia, gotowe do wklejenia w Make
- `emails/copy.json` — teksty w 6 językach, wklejasz raz do jednej zmiennej

> Pliki `emails/registration.html` i `emails/reminder.html` (bez przedrostka `make-`)
> są wersją dla Brevo. Zignoruj je, chyba że kiedyś przejdziesz na Brevo.

---

## Masz już arkusz — co teraz konkretnie

Przeczytaj to zanim pójdziesz do części 1. Trzy sprawy do wyjaśnienia.

### Link CSV, który wysłałeś, nie nadaje się do zapisu

```
https://docs.google.com/spreadsheets/d/e/2PACX-1vQ.../pub?output=csv
```

To adres z *Plik → Opublikuj w internecie*. Jest **tylko do czytania** i ma jeszcze
dwie wady: aktualizuje się z opóźnieniem do kilku minut, a każdy, kto go zdobędzie,
zobaczy dane wszystkich uczestników bez żadnego hasła.

Do czego go użyć, a do czego nie:

| Cel | Ten link | Co użyć zamiast |
|---|---|---|
| Zapis zgłoszenia | ❌ nie da się | moduł **Google Sheets → Add a Row** (część 4) |
| Odczyt listy w panelu | ⚠️ działa, ale publicznie | scenariusz C za hasłem (część 9) |
| Awaryjny eksport na dzień wydarzenia | ✅ | — |

**Zalecenie: wyłącz publikowanie.** *Plik → Opublikuj w internecie → Zatrzymaj
publikowanie*. Make łączy się z arkuszem przez Twoje konto Google, więc publiczny
link nie jest do niczego potrzebny, a wystawia dane osobowe uczestników.

Jeśli chcesz go zostawić dla wygody — usuń z arkusza publikowanego kolumny
`tax_code`, `email`, `phone` i `address`. Publikuj wtedy tylko wybraną kartę
z numerami i nazwami pojazdów.

### Arkusz masz zrobiony poprawnie

Na Twoich zrzutach widzę wszystkie trzy karty: `Registrations`, `Reminders`,
`Contacts`, z prawidłowymi nagłówkami w wierszu 1. **Część 1 możesz pominąć.**

Jedno do poprawienia: pierwsza karta nazywa się `Arkusz1` na jednym ze zrzutów,
a na kolejnym `Registrations`. Upewnij się, że została ostateczna nazwa
`Registrations`, bo Make wybiera kartę po nazwie.

Zrób też jedną rzecz: zaznacz wiersz 1 i *Widok → Zablokuj → 1 wiersz*.

### Poczta Zimbra z OVH — dane do modułu Email

Zimbra od OVH działa jako zwykły SMTP, więc moduł **Email → Send an Email**
połączy się bez problemu. Dane:

| Pole w Make | Wartość |
|---|---|
| Connection type | **Other** (SMTP) |
| Host name | `ssl0.ovh.net` |
| Port | `465` |
| Secure connection | **SSL/TLS** |
| User name | `info@carruleddhishow.com` |
| Password | hasło skrzynki z panelu OVH |

Jeśli `ssl0.ovh.net` nie zadziała, w panelu OVH → **Poczta e-mail → Konta e-mail**
sprawdź nazwę swojego serwera (czasem `pro*.mail.ovh.net` albo `sslX.ovh.net`).
Alternatywa: port `587` z opcją **STARTTLS**.

Co ustawić w DNS domeny `carruleddhishow.com` u OVH:

```
Typ: TXT   Nazwa: @   Wartość: v=spf1 include:mx.ovh.com ~all
```

Plus DKIM: panel OVH → **Poczta e-mail → Twoja domena → DKIM** → włącz i pozwól
OVH dodać rekordy automatycznie.

Bez SPF i DKIM maile z załącznikami PDF w większości trafią do spamu.
Sprawdź wynik na [mail-tester.com](https://www.mail-tester.com), celuj w 8/10.

**Limity OVH:** zwykle rzędu kilkuset wiadomości na godzinę i na dobę na skrzynkę.
Przy 40 uczestnikach i trzech przypomnieniach to około 160 maili w całym projekcie,
więc zmieścisz się z dużym zapasem. Nie wysyłaj jednak wszystkich przypomnień
w jednej minucie: scenariusz B ma limit 50 rekordów na uruchomienie i chodzi
co 15 minut, co samo z siebie rozkłada wysyłkę.

---

## Część 1 · Google Sheets — baza danych

### 1.1 Utwórz plik

1. Wejdź na [sheets.new](https://sheets.new)
2. Nazwij plik: `Carruleddhi Show 2026 — database`

### 1.2 Arkusz `Registrations`

1. Zmień nazwę pierwszej karty (dolna lewa) na `Registrations`
2. Kliknij komórkę **A1**
3. Wklej **jedną linię** — Sheets rozłoży ją na kolumny:

```
created_at	race_number	first_name	last_name	birth_date	tax_code	email	phone	address	cart_name	category	team_name	cart_notes	locale	rules_consent	privacy_consent	news_consent	status	pdf_it_url	pdf_translated_url	email_status	printed_at
```

> Odstępy między nazwami to **tabulatory**. Jeśli wklei się do jednej komórki,
> zrób *Dane → Podziel tekst na kolumny → Separator: Tab*.

4. Zaznacz wiersz 1 → *Widok → Zablokuj → 1 wiersz*

**Ważne:** numer startowy bierze się z numeru wiersza. **Nigdy nie sortuj tego
arkusza i nie usuwaj wierszy** w trakcie zapisów, bo numery się rozjadą.

### 1.3 Arkusz `Reminders`

1. Dodaj nową kartę (plus na dole), nazwij `Reminders`
2. W **A1** wklej:

```
id	created_at	name	email	locale	race_number	consent_at	unsubscribe_token	reminder_7d_at	reminder_1d_at	reminder_3h_at	sent_7d_at	sent_1d_at	sent_3h_at	locked_until	status
```

### 1.4 Arkusz `Contacts`

1. Nowa karta, nazwa `Contacts`
2. W **A1**:

```
created_at	name	email	message	locale	status
```

### Test części 1

Trzy karty: `Registrations`, `Reminders`, `Contacts`. Wiersz 1 wypełniony
nagłówkami. Nic więcej.

---

## Część 2 · Poczta wychodząca w Make

### 2.1 Zdobądź dane SMTP

Potrzebujesz adresu `info@carruleddhishow.com` i jego danych SMTP. Skąd:

**Jeśli masz hosting z domeną** (najlepsza opcja) — w panelu hostingu utwórz
skrzynkę `info@carruleddhishow.com` i znajdź dane SMTP. Zwykle:

```
Serwer:  smtp.twojhosting.pl
Port:    465 (SSL) albo 587 (TLS)
Login:   info@carruleddhishow.com
Hasło:   hasło skrzynki
```

**Jeśli używasz Google Workspace** — Gmail wymaga hasła aplikacji:

```
Serwer:  smtp.gmail.com
Port:    465 (SSL)
Login:   info@carruleddhishow.com
Hasło:   Google → Zarządzanie kontem → Bezpieczeństwo → Hasła do aplikacji
```

Zwykłe hasło do konta Google **nie zadziała** — musi być hasło aplikacji,
a na koncie musi być włączone dwustopniowe uwierzytelnianie.

### 2.2 Ustaw SPF i DKIM

Ten krok decyduje o tym, czy maile trafią do skrzynki, czy do spamu. U rejestratora
domeny `carruleddhishow.com` dodaj rekordy DNS podane przez Twojego dostawcę poczty.
Dla Google Workspace to:

```
Typ: TXT   Nazwa: @   Wartość: v=spf1 include:_spf.google.com ~all
```

plus rekord DKIM, który Google wygeneruje w *Apps → Gmail → Uwierzytelnianie poczty*.

Bez tego maile z załącznikami PDF w większości trafią do spamu. Sprawdź wynik
na [mail-tester.com](https://www.mail-tester.com) — celuj w 8/10 albo wyżej.

### 2.3 Połączenie w Make

Zrobisz je za chwilę, przy module wysyłki w części 4. Make poprosi wtedy o:
serwer, port, login, hasło, TLS/SSL. Miej te dane pod ręką.

### Test części 2

- [ ] Skrzynka `info@carruleddhishow.com` istnieje i da się z niej wysłać maila
      zwykłym klientem pocztowym
- [ ] Rekord SPF widoczny (sprawdź na [mxtoolbox.com/spf.aspx](https://mxtoolbox.com/spf.aspx))

---

## Część 3 · Google Docs — dwa szablony PDF

### 3.1 Szablon włoski

1. [docs.new](https://docs.new), nazwa: `Carruleddhi 2026 — modulo IT [TEMPLATE]`
2. Otwórz `emails/pdf-template.md` z projektu
3. Przepisz układ z sekcji „Treść IT" do dokumentu
4. Etykiety wpisz jako placeholdery `{{L_...}}`, wartości jako `{{...}}` — dokładna
   lista jest w tym samym pliku
5. Zamknij. ID dokumentu to część URL między `/d/` i `/edit`:
   `docs.google.com/document/d/`**`1AbC...XyZ`**`/edit`
6. Zapisz to ID jako **TEMPLATE_IT**

### 3.2 Szablon przetłumaczony

1. W Google Drive: prawy przycisk na tym dokumencie → **Utwórz kopię**
2. Nazwa: `Carruleddhi 2026 — modulo TRANSLATED [TEMPLATE]`
3. Otwórz i **na samej górze**, przed nagłówkiem, dodaj jedną linię w ramce:

```
{{L_TRANSLATION_WARNING}}
```

4. Zapisz ID jako **TEMPLATE_TRANSLATED**

### 3.3 Folder na gotowe PDF-y

1. Google Drive → nowy folder `Carruleddhi 2026 — PDF`
2. Zapisz jego ID z URL

### Test części 3

Dwa dokumenty-szablony z ID zapisanymi w notatniku, jeden folder.

---

## Część 4 · Scenariusz A — przyjmowanie zgłoszeń

To serce układu. Jeden webhook, żadnego routera, 13 modułów w jednej linii.

Make → **Scenarios → Create a new scenario**. Nazwa: `Carruleddhi 2026 — Intake`.

### Moduł 1 · Webhook

1. Kliknij duży plus → wyszukaj **Webhooks** → wybierz **Custom webhook**
2. **Add** → Webhook name: `carruleddhi-intake` → **Save**
3. Kliknij **Copy address to clipboard** i zapisz ten URL w notatniku.
   To będzie `MAKE_WEBHOOK_URL` w części 8.
4. Kliknij **OK**

Webhook czeka teraz na pierwsze dane. Zostaw kartę otwartą i przejdź na chwilę do
części 8.1, żeby wysłać próbne zgłoszenie — Make musi zobaczyć strukturę danych,
inaczej nie podpowie Ci pól. Potem wróć tutaj.

### Moduł 2 · Teksty maili

1. Plus po prawej od webhooka → **Tools → Set variable**
2. Variable name: `copy`
3. Variable lifetime: **One cycle**
4. Variable value: otwórz `emails/copy.json`, skopiuj **całą** treść i wklej
5. **OK**

### Moduł 3 · Zmienne pomocnicze

1. Plus → **Tools → Set multiple variables**
2. Dodaj po kolei (przycisk **Add item** przy każdej):

| Name | Value |
|---|---|
| `loc` | `{{if(contains("it,pl,en,de,es,fr"; 1.locale); 1.locale; "it")}}` |
| `t` | `{{get(parseJSON(2.copy); 3.loc)}}` |
| `ev` | `{{get(parseJSON(2.copy); "_event")}}` |
| `fullName` | `{{1.firstName}} {{1.lastName}}` |
| `generated` | `{{formatDate(now; "DD.MM.YYYY HH:mm"; "Europe/Rome")}}` |

> `t` odwołuje się do `3.loc`, czyli do zmiennej z tego samego modułu. Make na to
> pozwala, bo zmienne liczą się po kolei. Jeśli edytor protestuje, rozbij to na
> dwa moduły `Set multiple variables`.

To wszystko. Żadnej tablicy `details` nie budujesz — szablon
`emails/make-registration.html` ma tabelkę danych wpisaną na sztywno jako dziewięć
wierszy i sam sięga po `{{3.t.labels.fullName}}`, `{{1.phone}}` i tak dalej.
Lista kontrolna jest składana jednym `join()`. Dzięki temu nie ma tu ani jednej
kruchej formuły do zepsucia.

### Moduł 4 · Zapis do arkusza

1. Plus → **Google Sheets → Add a Row**
2. **Create a connection** → zaloguj się kontem Google, zezwól na dostęp
3. Search Method: **Select from list**
4. Drive: **My Drive**, Spreadsheet: `Carruleddhi Show 2026 — database`
5. Sheet Name: `Registrations`
6. Table contains headers: **Yes**
7. Wypełnij kolumny:

| Kolumna | Wartość |
|---|---|
| created_at | `{{formatDate(now; "YYYY-MM-DD HH:mm:ss"; "Europe/Rome")}}` |
| race_number | *zostaw puste — wypełni moduł 13* |
| first_name | `{{1.firstName}}` |
| last_name | `{{1.lastName}}` |
| birth_date | `{{1.birthDate}}` |
| tax_code | `{{upper(1.taxCode)}}` |
| email | `{{lower(1.email)}}` |
| phone | `{{1.phone}}` |
| address | `{{1.address}}` |
| cart_name | `{{1.cartName}}` |
| category | `{{1.category}}` |
| team_name | `{{1.teamName}}` |
| cart_notes | `{{1.cartNotes}}` |
| locale | `{{3.loc}}` |
| rules_consent | `{{1.rulesConsent}}` |
| privacy_consent | `{{1.privacyConsent}}` |
| news_consent | `{{1.newsConsent}}` |
| status | `pending` |

8. **OK**

### Filtr przed modułem 4 — zamiast routera

1. Kliknij **kropkę na linii** między modułem 3 i 4 → **Set up a filter**
2. Label: `tylko rejestracje`
3. Condition: pole `{{1.type}}` → operator **Text: Equal to** → wartość `registration`
4. **OK**

To zastępuje gałąź routera. Powtórzysz to jeszcze trzy razy.

### Moduł 5 · Numer startowy

1. Plus → **Tools → Set variable**
2. Name: `raceNumber`
3. Value:

```
{{formatNumber(4.`__ROW_NUMBER__` + 37; 0; "."; "")}}
```

Liczba **37** to przesunięcie: pierwszy uczestnik trafia do wiersza 2, więc
`2 + 37 = 39` i pierwszy numer to `039`. Zmień 37, jeśli chcesz zacząć inaczej.

4. **OK**

### Moduł 6 · Odpowiedź do strony

1. Plus → **Webhooks → Webhook response**
2. Status: `200`
3. Body:

```
{"ok": true, "raceNumber": "{{5.raceNumber}}"}
```

4. Custom headers → **Add item**: Key `Content-Type`, Value `application/json`
5. **OK**

Dzięki temu numer startowy na stronie jest prawdziwy, a nie policzony lokalnie.
Reszta scenariusza wykonuje się już po odpowiedzi, więc uczestnik nie czeka na PDF.

### Moduł 7 · Iterator dwóch kopii PDF

1. Plus → **Flow Control → Iterator**
2. Array:

```
{{add(emptyarray; "it"; 3.loc)}}
```

3. **OK**
4. Filtr przed iteratorem: `{{1.type}}` **Equal to** `registration`

Iterator wykona kolejne moduły dwa razy: raz dla `it`, raz dla języka uczestnika.

5. Filtr **po** iteratorze (na linii między 7 i 8), żeby Włoch nie dostał dwóch
   identycznych PDF-ów:
   - Label: `pomiń duplikat IT`
   - Condition: `{{7.value}}` **Text: Not equal to** `it`
   - Kliknij **OR**, dodaj drugą regułę: `{{7.__IMTINDEX__}}` **Numeric: Equal to** `1`

### Moduł 8 · PDF z szablonu

1. Plus → **Google Docs → Create a Document from a Template**
2. Connection: ta sama co Sheets
3. Enter a Document ID: **By mapping**, wartość:

```
{{switch(7.value; "it"; "TEMPLATE_IT"; "TEMPLATE_TRANSLATED")}}
```

Podmień `TEMPLATE_IT` i `TEMPLATE_TRANSLATED` na prawdziwe ID z części 3.

4. New Document Name:

```
Carruleddhi-{{5.raceNumber}}-{{upper(7.value)}}
```

5. New Document's Location: folder `Carruleddhi 2026 — PDF`
6. Values — wartości uczestnika (te same w obu kopiach):

| Placeholder | Wartość |
|---|---|
| RACE_NUMBER | `{{5.raceNumber}}` |
| FULL_NAME | `{{3.fullName}}` |
| BIRTH_DATE | `{{formatDate(1.birthDate; "DD.MM.YYYY")}}` |
| TAX_CODE | `{{upper(1.taxCode)}}` |
| ADDRESS | `{{1.address}}` |
| EMAIL | `{{lower(1.email)}}` |
| PHONE | `{{1.phone}}` |
| CART_NAME | `{{1.cartName}}` |
| CATEGORY | `{{upper(1.category)}}` |
| TEAM | `{{ifempty(1.teamName; "—")}}` |
| CART_NOTES | `{{ifempty(1.cartNotes; "—")}}` |
| GENERATED_AT | `{{3.generated}}` |
| LOCALE_UPPER | `{{upper(7.value)}}` |

7. Values — etykiety, **tłumaczone według `7.value`**. Wzór dla każdej:

```
{{get(get(get(parseJSON(2.copy); 7.value); "labels"); "fullName")}}
```

Podmieniasz tylko ostatni klucz: `fullName`, `birthDate`, `taxCode`, `email`,
`phone`, `address`, `cartName`, `category`, `team`, `notes`.

Dla `L_TRANSLATION_WARNING` użyj:

```
{{get(get(parseJSON(2.copy); 7.value); "regPrintBody")}}
```

Pozostałe etykiety (`L_DOC_TITLE`, `L_SECTION_RIDER`, `L_DECL_BODY` i tak dalej)
nie są w `copy.json` — wpisz je ręcznie po włosku w szablonie IT i w tłumaczeniu
w drugim szablonie. Nie muszą być dynamiczne, bo każdy szablon obsługuje jeden
zestaw językowy naraz przez `7.value`.

8. **OK**

### Moduł 9 · Eksport do PDF

1. Plus → **Google Drive → Download a File**
2. File ID: **By mapping** → `{{8.id}}`
3. Convert a Document to Format: **PDF**
4. **OK**

### Moduł 10 · Zebranie załączników

1. Plus → **Tools → Array aggregator**
2. Source Module: **Iterator [7]**
3. Target structure type: **Email → Send an Email → Attachments**
   *(pojawi się na liście dopiero po dodaniu modułu 11 — dodaj najpierw 11, potem
   wróć i ustaw tę opcję)*
4. Mapowanie: `Data` = `{{9.data}}`, `File name` = `{{9.fileName}}`
5. **OK**

### Moduł 11 · Mail z PDF-ami

1. Plus → wyszukaj **Email** → wybierz **Send an Email**
2. **Create a connection** → typ **Other** (SMTP) → wpisz dane z części 2.1:

| Pole | Wartość |
|---|---|
| Connection name | `carruleddhi-smtp` |
| Host name | Twój serwer SMTP |
| Port | `465` |
| Secure connection | `TLS` (dla portu 465 zwykle `SSL`) |
| User name | `info@carruleddhishow.com` |
| Password | hasło skrzynki albo hasło aplikacji |

3. **Save** — Make od razu testuje połączenie. Jeśli błąd, sprawdź port i typ szyfrowania.
4. Wypełnij moduł:

| Pole | Wartość |
|---|---|
| From | `Carruleddhi Show 2026 <info@carruleddhishow.com>` |
| To → Add item | `{{lower(1.email)}}` |
| Subject | `{{3.t.regSubject}}` |
| Content Type | **HTML** |
| Attachments | `{{10.array}}` |

5. **Content**: otwórz `emails/make-registration.html`, skopiuj **całą** treść i wklej.
   Nic w niej nie podmieniaj — wyrażenia `{{3.t.…}}` Make rozwiąże sam.
6. **OK**
7. Filtr przed modułem 11: `{{1.type}}` **Equal to** `registration`

> **Dlaczego temat jest osobno.** W module Email temat i treść to dwa różne pola,
> więc `{{3.t.regSubject}}` wklejasz do *Subject*, a HTML do *Content*.
> Oba i tak biorą tekst z `copy.json`, więc mail jest w języku uczestnika.

### Moduł 13 · Domknięcie wiersza

*(numer 12 to WhatsApp z części 7 — na razie pomiń)*

1. Plus → **Google Sheets → Update a Row**
2. Ten sam plik i arkusz `Registrations`
3. Row number: `{{4.__ROW_NUMBER__}}`
4. Wypełnij:

| Kolumna | Wartość |
|---|---|
| race_number | `{{5.raceNumber}}` |
| status | `confirmed` |
| pdf_it_url | `{{8.webViewLink}}` |
| email_status | `sent` |

5. **OK**

### Ustawienia scenariusza

1. Kliknij **ikonę koła zębatego** (dolny pasek) → **Settings**
2. Włącz **Sequential processing** — bez tego dwa równoczesne zgłoszenia mogą
   dostać ten sam numer startowy
3. Data loss: **zostaw wyłączone**
4. **OK**, potem **Save** (dyskietka) i przełącz scenariusz na **ON**

### Test części 4

1. Wejdź na stronę, wypełnij formularz zapisu prawdziwym swoim adresem
2. Sprawdź kolejno:
   - [ ] numer startowy pojawił się na stronie
   - [ ] w arkuszu `Registrations` jest nowy wiersz ze `status = confirmed`
   - [ ] w skrzynce jest mail z **dwoma** PDF-ami (albo jednym, jeśli testowałeś po włosku)
   - [ ] pierwszy załącznik ma w nazwie `IT`
   - [ ] czerwona ramka w mailu mówi, żeby drukować wersję włoską
   - [ ] w PDF są Twoje dane, a nie `{{FULL_NAME}}`
3. Powtórz test z przełączoną stroną na inny język i sprawdź, czy mail przyszedł
   w tym języku

---

## Część 5 · Zapisy na przypomnienia w tym samym scenariuszu

Formularz „Będę tam" wysyła `type = reminder`. Nie potrzebujesz nowego scenariusza —
dopisz dwa moduły do scenariusza A, z własnymi filtrami.

### Moduł 14 · Zapis do `Reminders`

1. Wróć na kanwę scenariusza A
2. Kliknij plus **na końcu** linii → **Google Sheets → Add a Row**
3. Arkusz: `Reminders`
4. Wypełnij:

| Kolumna | Wartość |
|---|---|
| id | `{{uuid}}` |
| created_at | `{{formatDate(now; "YYYY-MM-DD HH:mm:ss"; "Europe/Rome")}}` |
| name | `{{1.name}}` |
| email | `{{lower(1.email)}}` |
| locale | `{{3.loc}}` |
| race_number | *puste* |
| consent_at | `{{formatDate(now; "YYYY-MM-DD HH:mm:ss"; "Europe/Rome")}}` |
| unsubscribe_token | `{{md5(lower(1.email) + uuid)}}` |
| reminder_7d_at | `{{formatDate(addDays(parseDate("2026-10-17 14:30"; "YYYY-MM-DD HH:mm"; "Europe/Rome"); -7); "YYYY-MM-DD HH:mm")}}` |
| reminder_1d_at | `{{formatDate(addDays(parseDate("2026-10-17 14:30"; "YYYY-MM-DD HH:mm"; "Europe/Rome"); -1); "YYYY-MM-DD HH:mm")}}` |
| reminder_3h_at | `{{formatDate(addHours(parseDate("2026-10-17 14:30"; "YYYY-MM-DD HH:mm"; "Europe/Rome"); -3); "YYYY-MM-DD HH:mm")}}` |
| status | `active` |

5. Filtr przed tym modułem: `{{1.type}}` **Equal to** `reminder`

### Moduł 15 · Wiadomość do organizatora przy kontakcie

1. Plus → **Email → Send an Email**, connection `carruleddhi-smtp`
2. From: `Carruleddhi Show 2026 <info@carruleddhishow.com>`
3. To: `info@carruleddhishow.com`
4. **Reply-To**: `{{lower(1.email)}}` — dzięki temu „Odpowiedz" pisze do nadawcy
5. Subject: `Wiadomość ze strony — {{1.name}}`
6. Content Type: **Text**, Content:

```
Od: {{1.name}} <{{lower(1.email)}}>
Język: {{upper(3.loc)}}

{{1.message}}
```

7. Filtr: `{{1.type}}` **Equal to** `contact`

### Test części 5

- [ ] Kliknij „Będę tam" i zostaw e-mail → nowy wiersz w `Reminders` z trzema
      datami przypomnień i `status = active`
- [ ] Wyślij wiadomość z formularza kontaktowego → mail przyszedł na adres
      organizatora, a **Odpowiedz** kieruje na adres nadawcy

---

## Część 6 · Scenariusz B — wysyłka przypomnień

Nowy scenariusz. Make → **Create a new scenario**, nazwa `Carruleddhi 2026 — Reminders`.

### Moduł 1 · Zegar

1. Pierwszy moduł: **Google Sheets → Search Rows**
2. Arkusz: `Reminders`, Table contains headers: **Yes**
3. Filter: kolumna `status` **Equal to** `active`
4. Maximum number of returned rows: `50`
5. **OK**
6. Na dolnym pasku kliknij **Every 15 minutes** (ikona zegara przy pierwszym module)
   → Run scenario: **At regular intervals**, Minutes: `15`

> Bezpłatny plan Make ma minimum 15 minut. Dla przypomnienia „3 godziny przed"
> odchyłka do 15 minut jest bez znaczenia.

### Moduł 2 · Który etap jest należny

1. Plus → **Tools → Set multiple variables**

| Name | Value |
|---|---|
| `due` | `{{if(now >= parseDate(1.reminder_3h_at; "YYYY-MM-DD HH:mm") && length(1.sent_3h_at) = 0; "3h"; if(now >= parseDate(1.reminder_1d_at; "YYYY-MM-DD HH:mm") && length(1.sent_1d_at) = 0; "1d"; if(now >= parseDate(1.reminder_7d_at; "YYYY-MM-DD HH:mm") && length(1.sent_7d_at) = 0; "7d"; "")))}}` |
| `loc` | `{{if(contains("it,pl,en,de,es,fr"; 1.locale); 1.locale; "it")}}` |

2. **OK**

### Moduł 3 · Teksty

1. Plus → **Tools → Set variable**, name `copy`, lifetime **One cycle**,
   wklej całe `emails/copy.json`
2. Plus → **Tools → Set multiple variables**:

| Name | Value |
|---|---|
| `t` | `{{get(parseJSON(3.copy); 2.loc)}}` |
| `ev` | `{{get(parseJSON(3.copy); "_event")}}` |

### Filtr — tylko należne

1. Kropka na linii przed modułem wysyłki maila → **Set up a filter**
2. Label: `tylko należne`
3. Condition: `{{2.due}}` **Text: Not equal to** *(puste)* → w Make wybierz operator
   **Exists** albo wpisz warunek `{{2.due}}` **Not equal to** i pole wartości zostaw puste
4. **OK**

### Moduł 4 · Mail przypomnienia

1. Plus → **Email → Send an Email**
2. Connection: `carruleddhi-smtp` (to samo, co w scenariuszu A)
3. Wypełnij:

| Pole | Wartość |
|---|---|
| From | `Carruleddhi Show 2026 <info@carruleddhishow.com>` |
| To → Add item | `{{1.email}}` |
| Subject | `{{switch(2.due; "7d"; 4.t.remSubject7; "1d"; 4.t.remSubject1; 4.t.remSubject3)}}` |
| Content Type | **HTML** |

4. **Content**: wklej całą treść z `emails/make-reminder.html`
5. **OK**

> Rezygnacja z przypomnień działa na razie przez maila: link w stopce otwiera
> wiadomość z tematem „STOP promemoria" na adres organizatora. Wypisanie jednym
> kliknięciem wymaga dodatkowej ścieżki w Workerze i jest osobnym zadaniem.

### Moduł 5 · Oznaczenie wysyłki

1. Plus → **Google Sheets → Update a Row**
2. Arkusz `Reminders`, Row number: `{{1.__ROW_NUMBER__}}`
3. Ustaw **tylko jedną** kolumnę, wybraną dynamicznie. Make nie umie tego w jednym
   polu, więc najprościej ustaw wszystkie trzy z zachowaniem starej wartości:

| Kolumna | Wartość |
|---|---|
| sent_7d_at | `{{if(2.due = "7d"; formatDate(now; "YYYY-MM-DD HH:mm"); 1.sent_7d_at)}}` |
| sent_1d_at | `{{if(2.due = "1d"; formatDate(now; "YYYY-MM-DD HH:mm"); 1.sent_1d_at)}}` |
| sent_3h_at | `{{if(2.due = "3h"; formatDate(now; "YYYY-MM-DD HH:mm"); 1.sent_3h_at)}}` |
| status | `{{if(2.due = "3h"; "completed"; "active")}}` |

4. **OK**, **Save**, scenariusz na **ON**

### Test części 6

1. W arkuszu `Reminders` zmień ręcznie `reminder_7d_at` swojego wiersza na
   dzisiejszą datę i godzinę minus 5 minut
2. W Make kliknij **Run once**
3. Sprawdź:
   - [ ] mail przypomnienia przyszedł, w Twoim języku
   - [ ] w arkuszu wypełniło się `sent_7d_at`
   - [ ] drugie **Run once** **nie** wysyła tego samego maila ponownie

---

## Część 7 · Powiadomienie dla organizatora

Wybierz jedną z dwóch dróg. Telegram jest darmowy i działa od razu, WhatsApp
wygląda profesjonalniej i kosztuje groszowo za wiadomość.

### 7A · Telegram (zalecane na start)

1. W Telegramie napisz do **@BotFather** → `/newbot` → nazwa i username bota
2. Skopiuj token, który poda
3. Napisz cokolwiek do swojego nowego bota (musi dostać pierwszą wiadomość)
4. Otwórz `https://api.telegram.org/bot<TOKEN>/getUpdates` i znajdź `"chat":{"id":...}`
5. W Make, w scenariuszu A: plus po module 11 → **Telegram Bot → Send a Text Message
   or a Reply**
6. Connection: wklej token
7. Chat ID: liczba z punktu 4
8. Text:

```
Nowe zgłoszenie #{{5.raceNumber}}
{{3.fullName}} — {{1.cartName}}
Kategoria: {{upper(1.category)}} · Język: {{upper(3.loc)}}
Tel: {{1.phone}}
```

9. Filtr: `{{1.type}}` **Equal to** `registration`
10. Prawy przycisk na module → **Settings** → zaznacz **Continue the execution of
    the route even if this module returns an error**

### 7C · CallMeBot — konfiguracja, o którą pytałeś

Da się i zajmie pięć minut. Najpierw jednak dwie rzeczy, które musisz wiedzieć,
bo wcześniej odradzałem to rozwiązanie.

**Dlaczego jest ryzykowne:** CallMeBot nie jest oficjalną bramką WhatsApp. Nie ma
umowy powierzenia danych, nie ma gwarancji działania, a numer może zostać
zablokowany przez Metę bez ostrzeżenia. Wiadomość przechodzi przez cudzy serwer.

**Kiedy jest akceptowalne:** gdy wysyłasz **tylko do siebie** i **bez danych
osobowych uczestnika**. Twój własny numer i Twoja decyzja — to Twoje ryzyko,
nie ryzyko uczestników.

Dlatego treść poniżej celowo **nie zawiera nazwiska, e-maila ani telefonu**.
Dostajesz numer startowy i nazwę pojazdu; resztę widzisz w arkuszu.

#### Konfiguracja

1. Zapisz w telefonie kontakt **+34 621 331 709** (numer bota CallMeBot).
2. Wyślij do niego przez WhatsApp dokładnie taką wiadomość:

```
I allow callmebot to send me messages
```

3. Bot odpowie Twoim osobistym kluczem — siedem cyfr. Zapisz go **poza repozytorium**:
   w `WHATSAPP_ALERTS` w Vercelu i w `.env.local`. Do żadnego pliku w repo nie wpisuj samej
   wartości; checker `check-minor-blueprint.mjs` tego pilnuje i przerwie `npm run make`.
4. W Make, w scenariuszu A: plus po module 11 → **HTTP → Make a request**
5. Ustaw:

| Pole | Wartość |
|---|---|
| URL | `https://api.callmebot.com/whatsapp.php` |
| Method | `GET` |
| Query String → Add item | `phone` = Twój numer w formacie `+48600700800` |
| Query String → Add item | `apikey` = klucz z punktu 3 |
| Query String → Add item | `text` = treść poniżej |
| Parse response | `No` |

Wartość `text`:

```
Nowe zgloszenie #{{5.raceNumber}} - {{1.cartName}} ({{upper(1.category)}}), jezyk {{upper(3.loc)}}
```

Bez polskich znaków — CallMeBot przekazuje parametr w URL-u i ogonki potrafią się
rozjechać. Make sam zakoduje spacje.

6. Filtr przed modułem: `{{1.type}}` **Equal to** `registration`
7. Prawy przycisk na module → **Settings** → zaznacz **Continue the execution of
   the route even if this module returns an error**

Punkt 7 jest obowiązkowy. Gdy CallMeBot padnie — a padnie — bez tego zgłoszenie
uczestnika nie dostanie maila z PDF-em. Powiadomienie dla Ciebie nie może być
ważniejsze niż mail do uczestnika.

#### Ograniczenia, na które się natkniesz

- limit około jednej wiadomości na minutę na numer
- brak potwierdzenia dostarczenia
- przy awarii bota po prostu nic nie przychodzi, bez informacji
- jeśli zmienisz numer telefonu, trzeba przejść rejestrację od nowa

Dlatego trzymaj to jako **kanał pomocniczy**. Źródłem prawdy jest arkusz i sekcja
08 w panelu admina. Gdy będziesz chciał coś pewnego, zamień ten moduł na Telegram
(punkt 7A) — zero kosztu, zero limitów, oficjalne API.

### 7B · WhatsApp Business Cloud

1. [business.facebook.com](https://business.facebook.com) → uzupełnij dane firmy
2. [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**
   → typ **Business** → dodaj produkt **WhatsApp**
3. Utwórz lub połącz **WhatsApp Business Account**
4. Dodaj metodę płatności — Meta jej wymaga, nawet jeśli część ruchu jest bezpłatna
5. **WhatsApp Manager → Message templates → Create template**
   - Category: **Utility**
   - Name: `carruleddhi_new_entry`
   - Language: włoski albo polski
   - Body:

```
Nowe zgłoszenie #{{1}}
{{2}} — {{3}} ({{4}})
Kategoria: {{5}} · Język: {{6}}
```

6. Wyślij do akceptacji, poczekaj na status **Approved** (zwykle minuty)
7. W Make: **WhatsApp Business Cloud → Send a Template Message**
8. Connection: token z aplikacji Meta
9. To: numer organizatora w formacie E.164, np. `+393284981574`
10. Template: `carruleddhi_new_entry`
11. Parametry po kolei: `{{5.raceNumber}}`, `{{3.fullName}}`, `{{1.cartName}}`,
    `{{1.phone}}`, `{{upper(1.category)}}`, `{{upper(3.loc)}}`
12. Filtr: `{{1.type}}` **Equal to** `registration`
13. **Settings** → **Continue the execution of the route even if this module
    returns an error**

Powiadomienie idzie **do Ciebie**, nie do uczestnika. Dzięki temu nie potrzebujesz
osobnej zgody uczestnika na WhatsApp.

### Test części 7

- [ ] Wyślij próbne zgłoszenie → powiadomienie przyszło na Telegram/WhatsApp
- [ ] Wyłącz tymczasowo połączenie tego modułu → zgłoszenie i mail z PDF nadal działają

---

## Część 8 · Podłączenie strony

### 8.1 Szybki test bez proxy

Tylko do zobaczenia struktury danych w Make. **Nie zostawiaj tego na produkcji.**

1. Otwórz `index.html`, na dole znajdź `endpoints`
2. Tymczasowo w `assets/js/site-config.js` funkcja `isSafeProxyEndpoint` blokuje
   pełne adresy, więc szybszy sposób: w Make kliknij **Run once** na webhooku,
   a potem wyślij ręcznie z terminala:

```powershell
$body = @{
  type = 'registration'; event = 'Carruleddhi Show 2026'
  eventDate = '2026-10-17T14:30:00+02:00'; locale = 'pl'; source = 'test'
  submittedAt = (Get-Date -Format o)
  firstName = 'Jan'; lastName = 'Testowy'; birthDate = '1990-05-04'
  taxCode = 'TSTJAN90E04Z127X'; email = 'twoj@email.pl'; phone = '+48600700800'
  address = 'ul. Testowa 1, Gdansk'; cartName = 'Testowy Wozek'
  category = 'classic'; teamName = 'Test'; cartNotes = 'brak'
  rulesConsent = $true; privacyConsent = $true; newsConsent = $false
} | ConvertTo-Json
Invoke-RestMethod -Uri 'WKLEJ_TU_URL_WEBHOOKA' -Method Post -ContentType 'application/json' -Body $body
```

Make pokaże strukturę i od tej pory podpowie Ci pola `1.firstName` itd.

### 8.2 Proxy produkcyjne

```powershell
npm run build

cd worker
npx wrangler secret put MAKE_WEBHOOK_URL   # wklej URL webhooka z części 4
npx wrangler secret put ROSTER_KEY         # wymyśl długie hasło do listy uczestników
npx wrangler deploy
```

### 8.3 Wpisz ścieżki

W `index.html` na dole:

```js
endpoints: {
  registration: '/api/carruleddhi/registration',
  reminder:     '/api/carruleddhi/reminder',
  attendance:   '',
  counts:       '',
  contact:      '/api/carruleddhi/contact'
}
```

`attendance` i `counts` zostaw **puste**. Kliknięcia „Będę tam" w Make zjadają
2–4 kredyty za sztukę i darmowy plan padnie w jeden dzień. Licznik zostanie lokalny,
dopóki nie postawisz Cloudflare KV albo Supabase.

Te same ścieżki wpisz w panelu admina, sekcja 06 — status zmieni się na
**Proxy aktywne**.

Potem jeszcze raz `npm run build` i wgraj `dist/`.

---

## Część 9 · Scenariusz C — lista uczestników w panelu

1. Make → **Create a new scenario**, nazwa `Carruleddhi 2026 — Roster`
2. Moduł 1: **Webhooks → Custom webhook** → **Add** → nazwa `carruleddhi-roster`
   → skopiuj URL
3. Moduł 2: **Google Sheets → Search Rows**, arkusz `Registrations`,
   Maximum number of returned rows `500`
4. Moduł 3: **Tools → Array aggregator**, Source Module: **Search Rows [2]**
5. Moduł 4: **Webhooks → Webhook response**
   - Status `200`
   - Body: `{{toJSON(3.array)}}`
   - Header: `Content-Type: application/json`
6. **Save**, scenariusz na **ON**

Jeśli chcesz mieć to w jednym scenariuszu z A, dodaj po prostu te trzy moduły na
końcu z filtrem `{{1.type}}` **Equal to** `roster` — router i tak nie jest potrzebny.

### Test części 9

1. Otwórz `admin.html`, sekcja **07 Zapisani uczestnicy**
2. Wpisz hasło, które ustawiłeś jako `ROSTER_KEY`
3. **Wczytaj listę**
4. Sprawdź:
   - [ ] uczestnicy się pokazali
   - [ ] e-maile są zamaskowane, a checkbox je odsłania
   - [ ] „Drukuj kartę" otwiera podgląd wydruku bez miejsca na podpis

Jeśli dostajesz **401** — hasło nie zgadza się z sekretem Workera.
Jeśli **503** — sekret `ROSTER_KEY` nie jest ustawiony.

Wariant awaryjny na dzień wydarzenia: w Google Sheets *Plik → Pobierz → CSV*
i w panelu **Wybierz plik CSV**. Działa bez internetu.

---

## Część 10 · Checklista przed publikacją

- [ ] SPF i DKIM dla domeny carruleddhishow.com ustawione, mail-tester co najmniej 8/10
- [ ] Mail testowy nie wpada do spamu na Gmailu i na Outlooku
- [ ] Dwa równoczesne zgłoszenia dostają różne numery (sequential processing ON)
- [ ] PDF zawiera polskie i włoskie znaki poprawnie
- [ ] Pierwszy załącznik w mailu to wersja włoska
- [ ] Zgłoszenie bez zaakceptowanego regulaminu jest odrzucane
- [ ] Błędny e-mail jest odrzucany przez Workera z kodem `VALIDATION_FAILED`
- [ ] Awaria WhatsAppa/Telegrama nie blokuje maila z PDF
- [ ] Drugie uruchomienie scenariusza B nie wysyła przypomnienia dwa razy
- [ ] `admin.html` zabezpieczony na hostingu (Cloudflare Access)
- [ ] Dane prawne organizatora uzupełnione w `privacy.html`
- [ ] Regulamin i treść liberatorii zatwierdzone przez prawnika i ubezpieczyciela
- [ ] MFA włączone w Google, Make, Meta i w panelu hostingu poczty
- [ ] Kopia arkusza zrobiona przed wydarzeniem
- [ ] Umiesz zatrzymać oba scenariusze jednym kliknięciem

---

## Gdy coś nie działa

**Make pokazuje pola jako `1.firstName` ale są puste.**
Webhook nie zobaczył jeszcze prawdziwych danych. Zrób test z części 8.1.

**Mail przyszedł, ale zamiast tekstu są nazwy parametrów.**
Literówka w nazwie parametru w module 11. Nazwy muszą się zgadzać co do znaku
z tym, co jest w `emails/registration.html` po `params.`.

**PDF ma `{{FULL_NAME}}` zamiast nazwiska.**
Placeholder w Google Docs nie zgadza się z nazwą w module 8. Sprawdź też, czy
Google Docs nie rozbił `{{` i `}}` na osobne fragmenty formatowania — najbezpieczniej
wpisać placeholder ręcznie, bez kopiowania ze sformatowanego tekstu.

**Numery startowe się powtarzają.**
Sequential processing wyłączone, albo ktoś sortował arkusz.

**Iterator daje dwa identyczne PDF-y po włosku.**
Brakuje filtra po iteratorze z części 4, moduł 7 punkt 5.

**Moduł Email zwraca błąd przy załącznikach.**
Array aggregator nie ma ustawionego *Target structure type* na Attachments modułu
Email. Dodaj najpierw moduł 11, potem wróć do 10 i ustaw.

**Moduł Email nie łączy się z SMTP.**
Najczęściej zły port lub typ szyfrowania: port `465` wymaga `SSL`, port `587`
wymaga `TLS`. Przy Gmailu potrzebne jest hasło aplikacji, nie hasło konta.

**Scenariusz nie pojawia się w MCP w Kiro.**
Musi mieć harmonogram **On demand**, a klucz API zakresy `scenarios:read`
i `scenarios:run`.
