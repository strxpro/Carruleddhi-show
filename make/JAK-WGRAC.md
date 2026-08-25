# Make.com — jak wgrać oba scenariusze

Stan na dziś: **dwa scenariusze**, oba bez Arkuszy Google. Baza to Supabase, teksty
i szablony maili renderuje funkcja na Vercelu. Make robi jedną rzecz — wysyła.

Pliki do importu:

| Plik | Nazwa w Make | Moduły | Uruchamiany przez |
|---|---|---|---|
| `make/blueprint-1-instant.json` | Carruleddhi — 1 — natychmiastowe (webhook) | 18 | zgłoszenie na stronie |
| `make/blueprint-2-reminders.json` | Carruleddhi — 2 — przypomnienia (co godzinę) | 3 | zegar |

Trzeciego scenariusza (ogłoszenie nowej edycji) jeszcze nie ma — patrz koniec pliku.

---

## Zanim zaczniesz

Trzy rzeczy muszą być gotowe, inaczej import się uda, a scenariusz nie.

1. **Migracje w Supabase.** SQL Editor → wklej → Run, po kolei:
   `0001` … `0007`. Jeśli któraś już przeszła, uruchom ją ponownie — wszystkie są
   napisane tak, że drugie uruchomienie nic nie psuje (`if not exists`,
   `on conflict do nothing`, `create or replace`).

2. **Zmienne w Vercelu** (Settings → Environment Variables), potem **Redeploy**:

   | Nazwa | Do czego |
   |---|---|
   | `MAKE_WEBHOOK_URL` | adres webhooka ze scenariusza 1 |
   | `SUPABASE_URL` | adres projektu |
   | `SUPABASE_SERVICE_KEY` | klucz service_role |
   | `ROSTER_KEY` | hasło do panelu admina **i** do endpointu przypomnień |
   | `SITE_PASSWORD` | brama „Pracujemy nad tym”; usuń, gdy strona ma być publiczna |
   | `INTAKE_SHARED_KEY` | opcjonalne, nagłówek dodawany do żądań do Make |

3. **Pliki PDF na stronie.** `node tools/build-pdfs.mjs` generuje 12 plików do
   `public/emails/`. Są w repo, więc po wdrożeniu są pod
   `https://www.carruleddhishow.com/emails/Carruleddhi-modulo-it.pdf` itd.
   Sprawdź jeden w przeglądarce **przed** testem — moduł HTTP w Make dostanie 404
   i zatrzyma trasę, a mail nie wyjdzie.

---

## Scenariusz 1 — natychmiastowe, 18 modułów

### Co robi

Jeden webhook, jeden router, sześć tras.

```
1 Webhook
└─ 4 Router
   ├─ A  registration-adult-it     7 HTTP(PDF it) ────────────────→ 8  Email
   ├─ B  registration-adult-xx    22 HTTP(it) → 23 HTTP(jego jęz.) → 24 Email
   ├─ C  registration-minor-it    19 HTTP(it) ────────────────────→ 16 Email
   ├─ D  registration-minor-xx    25 HTTP(it) → 26 HTTP(jego jęz.) → 27 Email
   ├─ E  type = registration       9 HTTP WhatsApp, 30 HTTP WhatsApp
   ├─ F  reminder                 12 Email
   ├─ G  contact                  14 Email
   └─ H  newsConsent = true       21 Sleep 90 s → 18 Email
```

**Dlaczego cztery trasy rejestracji, a nie dwie.** Filtr w Make nie jest „jeżeli” —
kiedy nie przechodzi, **kończy całą trasę**, a nie pomija moduł. Włoch dostaje jeden
PDF, obcokrajowiec dwa, więc drugi moduł HTTP musiałby być warunkowy. Nie da się.
Stąd osobna trasa na każdy przypadek.

Filtr na każdej trasie to **jedno porównanie tekstu** z `{{1.branch}}`. Funkcja na
Vercelu wylicza to pole z daty urodzenia i wybranego języka, więc w Make nie ma
żadnego AND, żadnej daty i żadnej logiki.

### Krok po kroku

1. **Wyłącz stary scenariusz** (przełącznik ON/OFF na dole).
   Jeśli w kolejce coś stoi: trzy kropki → **Show queue** → zaznacz wszystko →
   usuń. Stare payloady nie mają nowych pól i będą się wywalać.

2. **Nowy scenariusz** → trzy kropki w prawym górnym → **Import Blueprint** →
   wybierz `make/blueprint-1-instant.json` → **Save**.

3. **Webhook (moduł 1).** Kliknij → **Add** → nazwa dowolna → **Save**.
   Skopiuj adres i wklej go w Vercelu jako `MAKE_WEBHOOK_URL` → **Redeploy**.

4. **Naucz webhook struktury danych.** To jest krok, który najczęściej się pomija.
   Otwórz moduł 1, kliknij **Redetermine data structure** — musi pisać
   *Listening for data*. Potem w terminalu:

   ```
   powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 -All -WorkerBase "https://www.carruleddhishow.com"
   ```

   `-All` wysyła najpierw jedną wiadomość ze **wszystkimi** polami naraz. To jest
   ważne: Make **nie sumuje** struktur między wywołaniami, tylko podmienia. Jeśli
   pierwsze przyjdzie zgłoszenie dorosłego, Make zapamięta strukturę bez pól
   opiekuna i `guardianName` zostanie na zawsze puste.

   Potem **OK** i **Save** (dyskietka na dolnym pasku).

5. **Podłącz SMTP w siedmiu modułach Email**: 8, 24, 16, 27, 12, 14, 18.
   W pierwszym utwórz połączenie, w pozostałych wybierz je z listy.

   | Pole | Wartość |
   |---|---|
   | Host | `ssl0.ovh.net` |
   | Port | `465` |
   | TLS | **Yes** |
   | Use explicit TLS (STARTTLS) | **No** |
   | User name | `info@carruleddhishow.com` (pełny adres) |
   | Password | hasło skrzynki |
   | From | `info@carruleddhishow.com` |

6. **WhatsApp — nic do konfiguracji.** Moduły 9 i 30 mają już wpisane numery
   i klucze. 9 → `48665626101`, 30 → `393284981574`.
   Bez `+` i bez spacji: to trafia do query stringa, gdzie `+` znaczy spację.

7. **Zapisz i włącz.** Dyskietka, potem przełącznik na ON.

### Test

```
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1 -WorkerBase "https://www.carruleddhishow.com"
```

Skrypt dokleja do adresów testowych godzinę uruchomienia, bo na e-mailu jest
unikalny indeks w trzech tabelach i drugi test tym samym adresem dostałby `409`.

Co powinno przyjść:

| Test | Maile | Załączniki | WhatsApp |
|---|---|---|---|
| dorosły, `locale: it` | 1 na jego adres + Bcc do Ciebie | 1 PDF (włoski) | 2 |
| dorosły, `locale: pl` | 1 na jego adres + Bcc | 2 PDF (włoski + polski) | 2 |
| nieletni, `locale: it` | 1 na adres opiekuna, uczestnik w kopii jawnej | 1 PDF | 2, z blokiem `⚠️ MINORENNE` |
| nieletni, `locale: de` | jak wyżej | 2 PDF | 2, z blokiem |
| przypomnienie | 1 potwierdzenie zapisu | — | — |
| kontakt | 1 na Twój adres, Reply-To = nadawca | — | — |

Zaznaczony newsletter → drugi mail **90 sekund później**. To celowo: oba listy
wychodzą z jednego wysłania formularza, więc bez opóźnienia lądują w tej samej
sekundzie i grzecznościowa notka o przyszłym roku przykrywa tę z numerem startowym.

### Jak czytać błąd

Funkcja na Vercelu przekazuje treść błędu z Make w polu `reason` w odpowiedzi HTTP,
więc skrypt testowy pokaże Ci go od razu. Jeśli mimo to trzeba zajrzeć do Make:
ikona zegara u góry → czerwony przebieg → moduł, który go zatrzymał. Tylko to
w tym widoku jest warte czytania.

Najczęstsze:

| Komunikat | Co znaczy |
|---|---|
| `references inaccessible module [module ID N]` | trasa cytuje moduł z sąsiedniej trasy — nie powinno się zdarzyć, walidator to wyłapuje |
| `The required followAllRedirects field is missing` | ręcznie dodany moduł HTTP bez tego pola |
| 404 na module HTTP | PDF nie jest jeszcze wdrożony pod tym adresem |
| `HTTP 410` ze skryptu testowego | scenariusz jest wyłączony; normalne przy nauce struktury |
| puste `Bcc` odrzucone przez SMTP | nie dotyczy — blueprint zawsze wstawia adres organizatora |

---

## Scenariusz 2 — przypomnienia, 3 moduły

### Co robi

```
1 HTTP  POST /api/carruleddhi/reminders-due     ← zegar, co godzinę
2 Iterator  {{1.data.messages}}
4 Email     to / subject / html z {{2.value.*}}
```

**To wszystko.** Funkcja na Vercelu robi całą robotę: liczy, ile zostało do startu,
decyduje które przypomnienie jest należne, czyta listę z Supabase, renderuje list
w języku każdej osoby, dokleja jej numer startowy jeśli startuje, i **zapisuje**
komu co wysłała. Make dostaje gotowe listy.

Poprzednia wersja miała 6 modułów: odczyt 500 wierszy z arkusza, arytmetykę dat
z `parseDate`, cały 26-kilobajtowy słownik w zmiennej, drugą zmienną do wyboru
języka, cztery warunki filtra połączone AND i aktualizację wiersza po numerze
kolumny. Nic z tego nie jest pracą dla narzędzia do wysyłania maili.

**Okna czasowe, nie dokładne godziny.** Stara wersja porównywała pozostałe godziny
do 168, 24 i 3 na równość. Działa, dopóki żaden przebieg nie zostanie pominięty —
a potem to przypomnienie przepada, bo liczba już nigdy nie będzie równa 168. Kto
zapisał się dwa dni przed zjazdem, nie dostawał nic. Teraz: „nie więcej niż 7 dni
i więcej niż dzień” to przypomnienie 7-dniowe, i każdy dostaje najświeższe, którego
jeszcze nie miał.

### Krok po kroku

1. **Import** `make/blueprint-2-reminders.json`.

2. **Moduł 1 (HTTP).** W nagłówku `X-Carruleddhi-Roster-Key` jest napisane
   `WSTAW_ROSTER_KEY`. Podmień na swój `ROSTER_KEY` z Vercela.
   Sprawdź też adres w polu URL — musi być Twoja domena.

3. **Moduł 4 (Email).** Wybierz to samo połączenie SMTP co w scenariuszu 1.

4. **Zegar.** Kliknij ikonę zegara na module 1 → **Every hour** → minuta dowolna.

5. **Test bez wysyłania.** W module 1 zmień pole *Request content* z `{}` na
   `{"dryRun": true}`, uruchom **Run once**. Funkcja wyrenderuje listy, ale
   **nie zapisze**, że poszły — możesz powtarzać do woli. Kliknij bąbelek nad
   modułem 1: powinno być `due`, `hoursLeft`, `count` i tablica `messages`.
   Po teście przywróć `{}`.

6. **Zapisz i włącz.**

Jeśli `due` jest puste, a `hoursLeft` duże — to nie błąd. Do zjazdu jest więcej niż
7 dni, więc nie ma czego wysyłać. Pierwsze przypomnienie wyjdzie **10 października
2026**.

### Jedna świadoma decyzja

Funkcja zapisuje `last_reminder` **przed** tym, jak Make wyśle. Do wyboru były dwa
sposoby zawodzenia: „błąd SMTP gubi jedno przypomnienie dla jednej osoby” albo
„błąd SMTP powoduje, że godzinę później to samo przypomnienie idzie do wszystkich
jeszcze raz”. Wybrany jest pierwszy. Nieudany przebieg widać w historii Make,
a kolumnę można wyczyścić w Supabase.

---

## Scenariusz 3 — ogłoszenie nowej edycji

Nie istnieje. Przycisk w panelu admina jest wyłączony i tak zostanie, dopóki nie
powstanie. Co ma robić: przycisk → `/api/carruleddhi/announce` → lista z
`newsletter_subscribers` → mail w sześciu językach → oznaczenie `announced_at`,
żeby drugie kliknięcie nie wysłało tego samego dwa razy.

Kształt będzie taki sam jak scenariusza 2, bo problem jest ten sam: trzy moduły,
bo cała decyzja o treści zapada w funkcji.

---

## Po każdej zmianie w generatorze

```
npm run make
```

Przebudowuje oba blueprinty, sprawdza odwołania między modułami i uruchamia 92
asercje na tym, co wyszło. Buduje z błędem, jeśli któryś moduł cytuje moduł,
którego nie widzi, jeśli szablon zawiera funkcję Make, albo jeśli w którymś z
sześciu języków brakuje klucza.

Po każdej zmianie w blueprincie trzeba go **ponownie zaimportować** do Make.
Make nie czyta pliku z repo — import jest kopią.
