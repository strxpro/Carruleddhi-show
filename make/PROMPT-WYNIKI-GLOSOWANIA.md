# Prompt dla AI od scenariuszy Make — wyniki głosowania publiczności

Skopiuj całość poniżej i wklej drugiemu AI. Zawiera wszystko, co potrzebne: co już istnieje,
co ma powstać, jakie pola przychodzą i czego **nie wolno** zmieniać.

---

## Kim jesteś i co masz zrobić

Jesteś inżynierem automatyzacji Make.com. Rozbudowujesz **istniejący** scenariusz mailowy
projektu „Carruleddhi Show" o obsługę wyników głosowania publiczności po jego zakończeniu.

Nie tworzysz nowego webhooka. Nie zmieniasz istniejących gałęzi. Dokładasz gałęzie do routera,
który już tam stoi.

## Architektura, w której działasz

- Strona i backend (Cloudflare Worker / funkcja Vercel) wysyłają **jeden POST** na **jeden
  webhook** w Make.
- Za webhookiem stoi **jeden router**. Gałąź wybiera się po polu **`branch`**.
- Treść listu jest **już wyrenderowana po stronie serwera**. W polach przychodzi gotowy HTML.
  **Nie generuj treści maili ani nie tłumacz tekstów.** Twoje moduły mają wysłać to, co dostały.
- Języków jest sześć: `it, pl, en, de, es, fr`. Język jest już rozstrzygnięty przez serwer.

## Co już istnieje i czego NIE RUSZASZ

| `branch` | Do czego służy |
|---|---|
| `registration-adult-it`, `registration-adult-xx`, `registration-minor-it`, `registration-minor-xx` | Potwierdzenia zapisu z załączonymi PDF-ami |
| `reminder` | Przypomnienia przed zjazdem |
| `contact`, `newsletter`, `code` | Wiadomości z formularza, newsletter, kod |
| `outbox` | **Gotowy list ogólnego przeznaczenia.** Trzy pola: `to`, `subject`, `html`. Nic nie rozstrzyga, po prostu wysyła |
| `voting-winner` | Gratulacje dla zwycięzcy podium (już istnieje, patrz niżej) |

## Zadanie 1 — gałąź `voting-winner` (gratulacje dla zwycięzców)

Wywoływana raz na każdego zwycięzcę z podium, po zamknięciu głosowania.

Pola w payloadzie:

```
branch          = "voting-winner"
type            = "voting-winner"
locale          = it | pl | en | de | es | fr
email           = adres zwycięzcy
name            = imię i nazwisko zwycięzcy
place           = 1 | 2 | 3
category        = kategoria pojazdu (np. "classic")
startNumber     = numer startowy (liczba)
projectName     = nazwa wózka (może być pusta)
participantName = imię i nazwisko zawodnika
totalScore      = suma punktów, którą zdobyto to miejsce
voteCount       = liczba oddanych głosów
averageScore    = średnia ocena
```

Wymagania:

1. Filtr gałęzi: `branch` **równa się** `voting-winner`.
2. Jeden moduł e-mail.
3. Temat i treść po **`locale`** — sześć wariantów. Treść ma powiedzieć:
   - gratulacje, wygrałeś **Nagrodę publiczności** (przy `place = 1`),
   - albo drugie/trzecie miejsce w Nagrodzie publiczności (`place = 2` / `place = 3`),
   - nazwa wózka, numer startowy, zdobyte punkty i liczba głosów,
   - jedno zdanie o odbiorze nagrody u organizatorów,
   - odsyłacz na `https://www.carruleddhishow.com/votazione.html`.
4. Ton: ciepły, świąteczny, karnawałowy. Bez korporacyjnego żargonu.
5. Nadawca ten sam co w pozostałych gałęziach.

## Zadanie 2 — potwierdzenie, że `outbox` obsługuje wyniki dla wszystkich

**To jest najważniejsza część i najczęstsze źródło błędu.**

Powiadomienie „sprawdź, kto wygrał" dla **wszystkich pozostałych** — czyli dla osób, które
głosowały i poprosiły o wynik, oraz dla uczestników — jest wysyłane przez serwer **jako gotowy
list** przez gałąź `outbox`. Serwer wysyła:

```
branch  = "outbox"
type    = "outbox"
to      = adres odbiorcy
subject = gotowy temat (już w jego języku)
html    = gotowy HTML całego listu (już w jego języku)
```

Twoje zadanie:

1. Upewnij się, że gałąź `outbox` istnieje i ma filtr `branch` = `outbox`.
2. Moduł e-mail mapuje **dokładnie**: `to` → odbiorca, `subject` → temat, `html` → treść HTML.
3. **Nie dodawaj** własnych nagłówków, stopek, tłumaczeń ani logiki wyboru języka w tej gałęzi.
   List jest kompletny. Każda dopisana linijka pojawi się u odbiorcy dwa razy.
4. Ta gałąź jest uruchamiana partiami przez godzinowy harmonogram. Musi znieść kilkadziesiąt
   wywołań pod rząd.

## Zadanie 3 — obsługa błędów

1. Na module e-mail w obu gałęziach ustaw **Break** z automatycznym ponowieniem, nie **Commit**.
   Zerwane połączenie SMTP nie ma prawa skasować wiadomości z kolejki.
2. Nie dodawaj modułów `Sleep`. Harmonogram i partie są po stronie serwera.
3. Nie dodawaj Google Sheets ani żadnego magazynu danych. Stan trzyma baza projektu.

## Czego nie wolno zrobić (sprawdzane automatycznie w repozytorium)

- ❌ drugiego webhooka,
- ❌ drugiego routera,
- ❌ modułów Google Sheets,
- ❌ modułów `Sleep`,
- ❌ dwóch modułów o tym samym `id`,
- ❌ generowania treści maila w Make dla gałęzi `outbox`,
- ❌ zmiany istniejących gałęzi rejestracji i przypomnień.

## Co masz oddać

1. Zaktualizowany blueprint JSON scenariusza (całość, gotowy do zaimportowania).
2. Krótką listę: które moduły dodałeś, jaki mają `id`, jaki filtr i do której gałęzi routera są
   podłączone.
3. Instrukcję testu: jaki payload wysłać na webhook, żeby sprawdzić `voting-winner` i `outbox`
   osobno, bez wysyłania czegokolwiek do prawdziwej listy.

## Kontekst wizualny (żeby treść pasowała do strony)

Wydarzenie to karnawałowy zjazd drewnianych wózków bez silnika w Santa Teresa Gallura na
Sardynii. Kolory: granat `#071a3d`, żółty `#ffca28`, róż `#ff6f9f`, fiolet `#8f71ff`. Nagroda
publiczności ma jednego zwycięzcę wybranego głosami widzów: 3–10 punktów, jeden głos na
urządzenie, jedna możliwa zmiana głosu.
