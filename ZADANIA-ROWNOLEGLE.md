# Zadania do rozdzielenia na równoległe sesje

Stan na 29.08.2026, `main` = `d4a601e`, 150/150 asercji.

Podział jest **po plikach, nie po tematach** — bo dwie sesje edytujące ten sam plik nadpiszą
się nawzajem, a `git add -A` w jednej z nich zgarnie pracę drugiej. To się już dzisiaj raz
zdarzyło.

**Zasada dla każdej sesji:** commituj **konkretnymi ścieżkami** (`git add plik1 plik2`),
nigdy `git add -A` i nigdy `git add .`.

---

## NAJPIERW, ZANIM COKOLWIEK — poza kodem

**DKIM i DMARC w OVH.** Potwierdzone 29.08: mail z systemu dotarł do Gmaila **do spamu**.
Maile wychodzą, Gmail je przyjmuje, ale nie ufa nadawcy. Dopóki tego nie ma, **każdy** mail
tej strony ląduje w spamie u każdego uczestnika — potwierdzenia, przypomnienia, kody,
newsletter. Żadne zadanie poniżej tego nie naprawi, bo to DNS, nie kod.

Rekord DMARC: TXT, nazwa `_dmarc`, wartość
`v=DMARC1; p=none; rua=mailto:info@carruleddhishow.com`

---

## TOR A — czat: zakończenie rozmowy i załączniki

**Pliki:** `worker/index.js`, `assets/js/app.js`, `assets/css/chat.css`
**Nie dotykać:** niczego w `emails/`, `src/admin/`, `tools/`

### A1. Przycisk „zakończ rozmowę / zacznij nową" — NAJPILNIEJSZE

To rozwiązuje objaw zgłaszany jako „AI nie odpowiada". Nie jest zepsute: gdy organizator
raz odpisze, wątek przechodzi na `mode: 'human'` i bot **celowo** milczy do końca tej
rozmowy (komentarz w `chatVisitor`: „Already with a person… answering anyway would talk
over them"). Bez przycisku wątek zostaje z człowiekiem na zawsze i gość widzi ciszę.

Zmierzone 29.08: trzy wątki użytkownika mają `mode: human`, świeży wątek z tym samym
pytaniem dostaje poprawną odpowiedź AI w 300 ms.

Zrobić: akcja `close` w `chatVisitor`, nowy `visitor_token`, stan „rozmowa zakończona"
z przyciskiem „nowa rozmowa", i ponowne pytanie o imię i e-mail przy nowej.

### A2. Czat na telefonie
Dziś lista rozmów i okno są pod sobą. Ma być: klikasz osobę → otwiera się całe okno.

### A3. Jeden czat zamiast dwóch
Użytkownik sam zaproponował usunięcie „szybkiej wiadomości" i zostawienie tylko czatu na
żywo. Zgadza się to z resztą: formularz kontaktowy i czat robią to samo, a czat robi to
lepiej. Uwaga: trasa `contact` w Make i handler zostają — z nich korzysta mailhook.

### A4. Załączniki i analiza obrazu
Wysyłanie plików przez gościa + przekazanie obrazu do modelu. Groq: sprawdzić, czy wybrany
model przyjmuje obrazy — `openai/gpt-oss-120b` **nie jest** modelem wizyjnym.

---

## TOR B — maile i zgody

**Pliki:** `emails/copy.json`, `emails/make-registration.html`, `emails/make-reminder.html`
**Nie dotykać:** `worker/index.js` poza `attachCopy()`, `assets/js/app.js`

Po każdej zmianie: `npm run check` (generuje `worker/copy-deck.js` i `email-templates.js`).

### B1. Dopisek o przypomnieniach w mailu zgłoszeniowym
**Każdy, kto zapisze się na wyścig, jest już automatycznie na liście przypomnień** — bez
pytania o zgodę, celowo (patrz `START-TUTAJ.md`). Brakuje tylko zdania w mailu: „Damy znać
tydzień, dzień i trzy godziny przed startem." Sześć języków.

### B2. Zgoda na newsletter przy komentarzu
Pole e-mail + checkbox zgody przy dodawaniu komentarza. Po zapisie: podziękowanie za opinię
i — jeśli zaznaczone — dopisanie do newslettera. Trasa `outbox` już stoi.

### B3. Maile bardziej kolorowe
Szablony są poprawne, ale suche. Uwaga: `emails/registration.html` i `emails/reminder.html`
to **martwe pliki po Brevo** — generator ich nie czyta. Żywe są te z przedrostkiem `make-`.

---

## TOR C — strona: header, efekty, sponsorzy

**Pliki:** `assets/css/*.css`, `index.html`
**Nie dotykać:** `assets/js/app.js` (należy do toru A), `worker/`, `emails/`

### C1. Sponsorzy pod sekcją „Całe miasteczko jedzie w dół"
Backend zapisuje poprawnie od `d4a601e` — sprawdzone. W bazie jest ich zero, więc trzeba
najpierw dodać jednego w panelu. Uwaga: `?demo=1` w adresie **podmienia** sponsorów na
przykładowe z `assets/js/demo-content.js`.

Dopisać: „chcesz być sponsorem — 100 euro, kontakt", przycisk otwierający czat z gotowym
pytaniem, i te fakty do wiedzy modelu w `chatSystemPrompt()` (to jedyne wejście tego toru
w `worker/index.js` — uzgodnić z torem A).

### C2. Header
Wyśrodkować nazwę sekcji. Naprawić mignięcie „będę tam" przy zwijaniu. Rozwinięcie ma
obejmować też wybór języka.

### C3. Efekt powiększania zdjęcia na trasie
Ma zaczynać się dopiero, gdy cała sekcja jest widoczna, i być płynny.
Pliki: `assets/css/route-zoom.css`.

### C4. Licznik osób przy „będę tam"
Ma pokazywać prawdziwą liczbę, a kółko ma być okrągłe, nie elipsą.

---

## TOR D — Make i Telegram

**Pliki:** żadne w repo — wszystko przez MCP. **Bezpieczny do puszczenia równolegle z każdym.**

### D1. Telegram, wariant A (wybrany przez użytkownika)
Telegram pisze **prosto do funkcji**, nie przez Make. Powód: moduł `telegram:WatchUpdates`
w Make **nie oddaje pola `reply_to_message`**, a na nim stoi cały pomysł „odpisz przez
Reply". Sprawdzone w schemacie modułu.

Potrzebny endpoint w workerze — uzgodnić z torem A, bo to ten sam plik.

**Token bota był trzykrotnie wklejony do czatu — jest spalony. Najpierw `/revoke`
u @BotFather.**

### D2. Scenariusze głosowania
Tabele `votes`, `participants`, `voting_settings` **już istnieją** (dodane 29.08).
Potwierdzenie głosu z linkiem do jednorazowej zmiany, i mail do zwycięzców.

Uwaga na nazwy: specyfikacja krążąca w promptach mówi `session_id` i `sender: 'user'`.
W tej bazie jest `thread_id` i `author` z wartościami `visitor | ai | organiser`.

---

## TOR E — panel `/admin`

**Pliki:** `src/admin/**`
**To robi drugie AI.** Nie wchodzić tu z innych torów.

Zakładka głosowania, preloader zamiast „caricamento", zdjęcia uczestników z numerami,
sortowanie zgłoszeń od najnowszych, oznaczanie wiadomości jako przeczytane.

---

## Czego NIE dzielić — musi zostać w jednej sesji

**PDF z danymi zgłoszenia, krok 4.** Dotyka generatora, workera, szablonu maila i struktury
webhooka w Make naraz. Plan: `make/PLAN-FORMULARZ-Z-DANYMI.md`.

**Wywalanie się telefonu.** Zmiana warstw GPU (11 → 4, commit `acbba2d`) **nie wystarczyła**.
Następny podejrzany: galeria 3D i talia nagród — `preserve-3d` i `perspective` trzymają całe
poddrzewo w pamięci GPU. To jest diagnostyka, nie lista zmian, i wymaga pomiaru na
prawdziwym urządzeniu.

---

## Co jest już naprawione — nie ruszać

Przeskakiwanie przewijania (kotwiczenie, `8ef32ee`), teleportowanie przy czacie (fokus bez
`preventScroll`, `ef2949a`), słownik czatu odpowiadający nie na temat (`e9d987c`), model AI
(Groq wycofał `llama-3.3-70b-versatile`), newsletter (`0008`), `unsub-*` i `purge`, numery
startowe (`0012`), PDF-y 14/14 na jednej stronie (`c17e783`), kursor, header z flagą
i progresem, formularz z danymi pod tokenem (`0e938ee`), funkcje RPC (`0021`), WhatsApp po
włosku (`fa7b931`), zapis ustawień (`d4a601e`).

---

## Jedna rzecz, którą warto powiedzieć każdej sesji

W tym projekcie **pięć razy w ciągu doby** trafiła się ta sama klasa błędu: funkcja
zgłasza sukces i nic nie robi. Zapis ustawień, CallMeBot, newsletter, `revoke` w bazie,
model AI. Za każdym razem wykryło to dopiero zmierzenie skutku, nigdy przeczytanie kodu.

Więc: po każdej zmianie sprawdź **skutek**, nie odpowiedź. `ok: true` nie znaczy, że coś
się zapisało.
