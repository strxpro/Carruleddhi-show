# Make — dwa pliki, dziesięć minut

Nie budujesz nic ręcznie. Importujesz dwa gotowe scenariusze i podłączasz konta.

## 1. Arkusz Google — NIE ruszasz nagłówków

**Zmiana względem pierwszej wersji.** Blueprint był napisany pod mój wymyślony
układ kolumn, a Twój arkusz ma własny — dlatego `loc` wylądował w `race_number`
i wszystko przesunęło się o jedną kolumnę. Teraz blueprint jest dopasowany do
**Twojego** arkusza. Nagłówków nie zmieniasz.

Odczytane z Twojego pliku:

| Karta | Kolumny |
|---|---|
| `Registrations` | A `created_at` · B `race_number` · C `first_name` · D `last_name` · E `birth_date` · **F `tax_code`** · G `email` · H `phone` · I `address` · J `cart_name` · K `category` · L `team_name` · M `cart_notes` · N `locale` · O `rules_consent` · P `privacy_consent` · Q `news_consent` · R `status` · S `pdf_it_url` · T `pdf_translated_url` · U `email_status` · V `printed_at` |
| `Reminders` | A `id` · B `created_at` · C `name` · D `email` · E `locale` · F `race_number` · G `consent_at` · H `unsubscribe_token` · I–K `reminder_*_at` · L–N `sent_*_at` · O `locked_until` · P `status` |
| `Contacts` | A `created_at` · B `name` · C `email` · D `message` · E `locale` · F `status` |

### Trzy rzeczy do zrobienia w arkuszu

**1. Zmień jedną komórkę.** `Registrations` → **F1** → z `tax_code` na
`postal_code`. Formularz zbiera teraz kod pocztowy, nie codice fiscale.

**2. Dodaj kartę `Newsletter`** (tej nie masz, a czwarta gałąź do niej pisze).
Wklej w **A1**:

```
created_at	name	email	locale	source	status
```

Pola są rozdzielone tabulatorami, więc Google sam rozbije to na sześć kolumn.

**3. Numer startowy liczy arkusz, nie Make.** W `Registrations` w komórkę **B2**
wklej jedną formułę:

```
=ARRAYFORMULA(IF(C2:C<>""; ROW(C2:C)-1; ""))
```

Kolumna B wypełni się sama dla każdego wiersza, teraz i w przyszłości, także dla
wpisów dodanych ręcznie.

> **Dlaczego tak, a nie modułem w Make.** Był tam moduł „Update a Cell", który
> wpisywał ten numer — i to on świecił na czerwono z `Cell: Value must not be
> empty`. Nazwa tego pola w blueprincie nie zgadzała się z tym, czego Make
> oczekuje, a zgadywanie wewnętrznych nazw parametrów Make raz już dało
> „Module Not Found". Wyleciał. Numer to po prostu pozycja wiersza, więc arkusz
> policzy go sam, bez modułu, który może się zepsuć. W mailu numer nadal jest
> liczony z `__ROW_NUMBER__`, więc obie liczby zawsze się zgadzają.

> Jeśli kiedyś dodasz albo przestawisz kolumnę, popraw `HEADERS` na górze
> `tools/build-make-blueprints.mjs` i przebuduj pliki. Make mapuje kolumny **po
> pozycji**, nie po nazwie, więc te dwie listy muszą się zgadzać.

## 2. Import scenariusza 1 (natychmiastowy)

1. Make → **Create a new scenario** → trzy kropki u dołu → **Import Blueprint**.
2. Wybierz `make/blueprint-1-instant.json`.
3. Kliknij moduł **1 Webhook** → wybierz swój hook („ZAPISY NA WYŚCIG"):
   `https://hook.eu1.make.com/2stphbryuh84wzer92leg7fgub1aikqg`
   Panel pokaże **„Listening for data"** — zostaw go otwartego i przejdź do
   sekcji 2A poniżej.
4. W każdym module **Google Sheets** wskaż swój plik (pole *Spreadsheet* jest
   puste specjalnie — wpisany na sztywno identyfikator wskazywałby w pustkę).
5. W każdym module **Email** wybierz połączenie SMTP — dane w sekcji 4.
6. Moduł **10 (Webhook response)** nic nie wymaga. Odpowiada stronie prawdziwym
   numerem startowym z arkusza, zamiast pozwolić jej policzyć własny.
7. Moduł **9** to powiadomienie na WhatsApp. Numer i klucz CallMeBot są już
   w blueprincie. Nie chcesz tego? Prawy przycisk → *Disable*.
8. Zapisz i włącz przełącznik **ON**.

> **Gałąź zapisu ma teraz drugi router (17) i dwa moduły Email.** `8` idzie do
> dorosłego, `16` do opiekuna osoby niepełnoletniej. W obu wybierasz to samo
> połączenie SMTP.
>
> Dlaczego router, a nie dwa filtry pod sobą: w Make niespełniony filtr **kończy
> całą trasę**, nie przeskakuje modułu. Dwa filtrowane maile w jednej linii
> znaczyłyby, że zgłoszenie niepełnoletniego umiera na pierwszym filtrze i nie
> dostaje ani maila, ani powiadomienia.
>
> Treść maila siedzi teraz w polu **Content** modułu Email, nie w zmiennej modułu 3.
> Make odrzucał poprzednią wersję z komunikatem `references inaccessible module`:
> szablon cytował `{{3.t.…}}` z wnętrza modułu 3 i `{{6.minHi}}` z modułu, który
> jeszcze nie ruszył.

> Karta `Registrations` ma **32 kolumny** (A–AF): dwadzieścia dwie z tabeli
> powyżej plus dziesięć dla niepełnoletnich, dopisanych od **W1**. Dokładny wiersz
> nagłówków do wklejenia jest w `KROKI.md`, krok 5.

## 2A. „Listening for data" — co tu wpisać

Nic nie wpisujesz. Webhook nie wie, jakich pól się spodziewać, dopóki ich nie
dostanie. Trzeba mu je raz wysłać.

Przy otwartym panelu uruchom w katalogu projektu:

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1
```

Wysyła **jedną** wiadomość z wszystkimi 24 polami naraz. Panel przeskoczy na
„Successfully determined", kliknij OK, potem **Save**.

> **Dlaczego jedna, a nie trzy.** Pierwsza wersja skryptu wysyłała trzy osobne
> wiadomości i dostawałeś `1 / 3 delivered` oraz dwa razy **HTTP 410**. Make
> zamyka nasłuch w momencie, gdy ustali strukturę z pierwszego żądania — kolejne
> trafiają do wyłączonego scenariusza i wracają jako 410 Gone. Jedna wiadomość ze
> sumą wszystkich pól uczy Make wszystkiego w jednym strzale.

Test każdej gałęzi osobno, **dopiero gdy scenariusz jest ON**:

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 -All
```

Wtedy pójdą prawdziwe maile na adresy `test.*@example.com` i jeden WhatsApp.

Test całej drogi razem z Workerem (dopiero po wdrożeniu Workera):

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 `
  -WorkerBase "https://twoj-worker.workers.dev"
```

Skrypt jest w czystym ASCII i buduje polskie znaki z kodów Unicode, bo
PowerShell 5.1 czyta pliki `.ps1` jako ANSI i literalne „ą" doszłoby do Make
połamane. Sprawdzone: do odbiorcy trafiają dokładnie U+0105 U+017C U+015B
U+0142 U+00F3 U+00E8.

Co robi: rozdziela ruch na cztery gałęzie po polu `type` — zapis na wyścig,
zapis na przypomnienia, formularz kontaktowy, zgoda na informacje o kolejnych
edycjach. Treść maila jest już w środku, w sześciu językach.

## 3. Import scenariusza 2 (przypomnienia)

Najpierw jedna komórka w arkuszu: karta `Reminders` → **Q1** → wpisz
`last_reminder`. To tam scenariusz zapisuje, które przypomnienie już poszło, żeby
nikt nie dostał tego samego dwa razy. Kolumna Q jest wolna, więc nic się nie
przesuwa.

1. Import pliku `make/blueprint-2-reminders.json`.
2. Wskaż arkusz w modułach **1** i **6** — karta **`Reminders`** (nie
   Registrations; ta karta ma kolumny na znaczniki wysyłki).
3. Wybierz połączenie SMTP w module 5.
4. **Scheduling** (zegarek przy przełączniku) → *Every hour*.
5. Włącz **ON**.

## 4. SMTP — Zimbra w OVH

Sprawdzone dla `carruleddhishow.com`: rekordy MX wskazują na `mx0.mail.ovh.net`,
SPF to `v=spf1 include:mx.ovh.com ~all`. To poczta OVH (Zimbra korzysta z tych
samych ustawień co MX Plan). Port 465 na `ssl0.ovh.net` odpowiada.

W Make: moduł **Email → Send an Email** → *Add* obok pola **Connection** →
typ połączenia **Email (SMTP)**. Formularz wypełniasz tak:

| Pole w Make | Co wpisać |
|---|---|
| **Email address** | `info@carruleddhishow.com` |
| **Your full name** | `Carruleddhi Show 2026` |
| **SMTP server** | `ssl0.ovh.net` |
| **Port** | `465` |
| **Use a secure connection (TLS)** | **Yes** |
| **Use explicit TLS** | **No** |
| **User name** | `info@carruleddhishow.com` |
| **Password** | hasło do skrzynki, nie do panelu OVH |

Dwa pola, na których to najczęściej pada:

- **Use explicit TLS = No.** „Explicit" to STARTTLS, który działa na porcie 587.
  Na 465 połączenie jest szyfrowane od pierwszego bajtu (implicit), więc explicit
  musi być wyłączony. Jeśli ustawisz Yes przy 465, połączenie zawiesi się i Make
  zgłosi timeout.
- **User name to pełny adres**, nie `info`.

Jeśli 465 gdzieś blokuje: port `587`, **Use a secure connection = Yes**,
**Use explicit TLS = Yes**. Oba porty na `ssl0.ovh.net` są otwarte, sprawdziłem
połączeniem TCP.

Sprawdzone dla Twojej domeny: MX wskazuje na `mx0.mail.ovh.net`, SPF to
`v=spf1 include:mx.ovh.com ~all` — to poczta OVH, a Zimbra używa tam tych samych
ustawień co MX Plan.

### Kopia powiadomienia dla Ciebie

Żeby każde zgłoszenie przychodziło też do Ciebie, w module **8 (Email)** rozwiń
**Show advanced settings** i w polu **Bcc** dodaj `info@carruleddhishow.com`.
Jedno pole, zero dodatkowych modułów.

Dwie rzeczy, które psują wysyłkę najczęściej:

- **Pole „From" musi być tym samym adresem co login.** OVH odrzuca próbę wysłania
  „w imieniu" innego adresu. W blueprincie `from` jest puste, więc Make użyje
  adresu z połączenia — tak ma być, nie wpisuj tam nic innego.
- **Nazwa użytkownika to cały adres**, nie `info`.

Nie zaznaczaj *Save message after sending* — wymaga drugiego, oddzielnego
połączenia IMAP. Zimbra i tak trzyma kopię w Wysłanych.

Limit OVH to około 200 maili na godzinę na skrzynkę. Przy 40 zgłoszeniach
i trzech przypomnieniach nie zbliżysz się do niego.

Co robi: co godzinę liczy, ile godzin zostało do 17.10.2026 14:30. Przy 168 h
wysyła mail „za tydzień", przy 24 h „jutro", przy 3 h „za chwilę". Kolumna Q
zapamiętuje, co już poszło, więc nikt nie dostanie tego samego dwa razy.

Żeby objąć też osoby z karty `Reminders`, zaimportuj ten sam plik drugi raz
i w modułach 1 i 6 wskaż kartę `Reminders`.

## Dlaczego przypomnienia nie mogą iść ze strony

Strona to kod w przeglądarce. Kiedy ktoś ją zamknie — a zamknie po zapisaniu się
— nie ma już co odliczać siedmiu dni. Natychmiastowy mail potwierdzający wysyła
scenariusz 1 w sekundę po zapisie. Przypomnienia musi wysłać zegar na serwerze,
i to jest scenariusz 2.

## Skąd się bierze język maila

Jeden moduł (**2**) trzyma cały słownik: 6 języków × 32 teksty. Moduł **3**
wybiera z niego język zgłoszenia i podstawia awaryjnie włoski, jeśli ktoś ma
przeglądarkę po fińsku. Żadnego routera po języku, żadnych sześciu kopii szablonu.

## Numer startowy i PDF

Numer to numer wiersza w arkuszu minus wiersz nagłówka, zapisywany z powrotem
do kolumny C. PDF w załączniku pobierany jest z Twojej strony
(`/emails/Carruleddhi-modulo.pdf`) — dwie strony, włoska do podpisu i tłumaczenie.
Karty z danymi konkretnych uczestników drukujesz z panelu admina, sekcja 08.

## Szare kółka „Module Not Found"

Jeśli je widzisz — masz starą wersję blueprintu. Moduł `email:ActionSendEmail`
istnieje w Make w **wersji 7**, a pierwsza wersja plików podawała 4. Make nie
mówi, na czym polega problem, tylko rysuje szare kółko.

Naprawione. Usuń zaimportowany scenariusz i zaimportuj plik jeszcze raz —
w miejscu szarych kółek pojawi się **Email · Send an Email**.

Moduły HTTP pokazują się jako **HTTP (legacy)**. To normalne i działa; Make
trzyma dwie generacje aplikacji HTTP pod tą samą nazwą wewnętrzną.

## Jak przebudować blueprinty po zmianie tekstów

```
node tools/build-make-blueprints.mjs
```

Czyta `emails/copy.json` i oba szablony HTML i składa pliki od nowa. Po zmianie
tekstów zaimportuj scenariusz jeszcze raz.

## Załącznik PDF — jedna pułapka

Moduł **7 (HTTP – Get a file)** pobiera `/emails/Carruleddhi-modulo.pdf` z Twojej
strony. Dopóki strona nie jest wdrożona pod `www.carruleddhishow.com`, ten moduł
zwróci 404 i **zatrzyma całą gałąź zapisu — mail nie wyjdzie**.

Zanim wdrożysz stronę: prawy przycisk na module 7 → *Disable*, a w module 8
(Email) usuń pozycję z pola *Attachments*. Po wdrożeniu włącz z powrotem.
