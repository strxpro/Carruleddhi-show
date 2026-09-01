# Requirements Document

Weryfikacja e-maila w rozmowie i zgłoszenie sponsora.

## Introduction

Czat na stronie ma dziś trzy niedokończone rzeczy, które ten dokument domyka.

**Pierwsza: język odpowiedzi.** `chatSystemPrompt()` zawiera już zdanie „Odpowiadaj w tym samym
języku, w którym napisał gość", ale nic tego nie sprawdza ani nie wymusza. Gość pisze po włosku
i dostaje odpowiedź w języku, który wybrał model — a wybiera go czasem z pola `locale`
przeglądarki, czasem z historii wątku, czasem z ostatniego zdania organizatora.

**Druga: weryfikacja adresu jako wspólny mechanizm.** Dziś kod ze skrzynki jest wpisywany
w rozmowie tylko przy wypisaniu z powiadomień (`notify-code` / `notify-off`). Zmiana danych
i rezygnacja z wyścigu oddają sprawę osobnemu formularzowi (`openEntryManager`), który ma własne
pole na kod i własne komunikaty. Zgłoszenie sponsora nie weryfikuje adresu wcale. To trzy różne
zachowania dla tej samej czynności — „udowodnij, że czytasz tę skrzynkę" — i trzy miejsca,
w których teksty i reguły mogą się rozjechać.

**Trzecia: zgłoszenie sponsora.** Obecny przepływ pyta o nazwę carruleddhi, telefon i e-mail,
przy czym **oba kontakty są opcjonalne** i wystarczy jeden. Nie ma zgody na prywatność ani na
regulamin, nie ma imienia i nazwiska, adres nie jest weryfikowany, a zgłaszający nie dostaje
żadnego potwierdzenia — powiadomienie idzie wyłącznie do organizatorów.

Celem jest jedna bramka weryfikacyjna używana przez wszystkie sprawy wymagające dowodu dostępu
do skrzynki, oraz zgłoszenie sponsora, które przez tę bramkę przechodzi.

### Co zostaje nietknięte

Reguły samych kodów są w bazie i nie zmieniają się: sześć cyfr, kwadrans ważności, pięć prób,
jednorazowość, oraz sufit trzech wysłanych kodów na adres na kwadrans (`overCodeSendLimit`).
Zasada „sam adres wpisany w czacie nie jest dowodem niczego" też zostaje — jest fundamentem
całej tej konstrukcji.

---

## Glossary

| Pojęcie | Znaczenie w tym dokumencie |
|---|---|
| **bramka** | Krok rozmowy, w którym gość musi podać kod ze skrzynki, żeby przejść dalej. Wspólna dla wszystkich spraw wymagających potwierdzenia tożsamości. |
| **kreator** | Prowadzona przez system sekwencja pytań w czacie (`flow` w `app.js`), która na czas swojego trwania przejmuje wiadomości gościa. |
| **sprawa** | Jedna z rzeczy, którą gość chce zrobić: zgłoszenie sponsora, zmiana danych, rezygnacja z wyścigu, wypisanie z powiadomień. |
| **cel kodu** | Wartość kolumny `verification_codes.purpose`. Kod wystawiony na jedną sprawę nie działa na inną. |
| **język rozmowy** | Język rozpoznany z wiadomości gościa. Gdy nie da się rozpoznać — język wybrany na stronie, a w ostatniej kolejności włoski. |
| **komunikat systemowy** | Wypowiedź w wątku pochodząca od strony, nie od automatu ani od organizatora; wizualnie odróżniona od obu. |
| **carruleddhi sponsora** | Wózek z nazwą sponsora, który sponsor dostaje w ramach oferty obok logo na stronie. |
| **potwierdzenie** | Fakt, że gość wpisał poprawny kod dla danego adresu i danej sprawy. |

## Requirements

### Wymaganie 1 — automat odpowiada w języku, w którym się do niego pisze

**Historia użytkownika:** Jako gość piszący po włosku chcę dostać odpowiedź po włosku, żeby nie
musieć czytać po polsku ani przełączać języka strony.

#### Kryteria akceptacji

1. KIEDY gość wysyła wiadomość w jednym z sześciu obsługiwanych języków (włoski, polski,
   angielski, niemiecki, hiszpański, francuski), WTEDY automat MUSI odpowiedzieć w tym samym
   języku, niezależnie od języka wybranego w przełączniku strony.
2. JEŚLI języka wiadomości nie da się rozpoznać, WTEDY automat MUSI odpowiedzieć w języku
   wybranym na stronie, a jeśli i tego nie ma — po włosku.
3. KIEDY gość zmienia język w trakcie jednej rozmowy, WTEDY następna odpowiedź MUSI być w nowym
   języku, a poprzednie wiadomości MUSZĄ zostać w wątku bez zmian.
4. GDZIE odpowiedź pochodzi ze słownika częstych pytań (`faqAnswer`), a nie z modelu, TAM
   odpowiedź MUSI być wzięta z bloku językowego zgodnego z językiem wiadomości gościa.
5. KIEDY rozmowa jest przekazana człowiekowi, WTEDY powiadomienie dla organizatorów MUSI nadal
   podawać rozpoznany język gościa, żeby odpowiadający wiedział, w czym pisać.

---

### Wymaganie 2 — jedna bramka weryfikacji e-maila w rozmowie

**Historia użytkownika:** Jako gość, który chce zrobić cokolwiek wymagającego potwierdzenia
tożsamości, chcę potwierdzić adres bez opuszczania rozmowy, żeby nie przechodzić do osobnego
formularza z innymi zasadami.

#### Kryteria akceptacji

1. KIEDY kreator rozmowy potrzebuje potwierdzenia adresu, WTEDY system MUSI wysłać
   sześciocyfrowy kod na podany adres i poprosić o niego w rozmowie.
2. KIEDY system prosi o kod, WTEDY komunikat MUSI być oznaczony jako systemowy, wizualnie
   odróżniony od wypowiedzi automatu i człowieka.
3. GDZIE komunikat jest systemowy, TAM MUSI być w języku wiadomości gościa, a jeśli tego nie
   rozpoznano — w języku wybranym na stronie.
4. KIEDY pojawia się pole na kod, WTEDY MUSI ono przyjmować wyłącznie cyfry i wywoływać na
   telefonie klawiaturę numeryczną, a na sześciu wpisanych cyfrach MUSI wysyłać kod bez
   dodatkowego naciśnięcia przycisku.
5. KIEDY gość poda poprawny kod, WTEDY system MUSI odblokować kolejne kroki tej sprawy i
   powiedzieć wprost, że adres jest potwierdzony.
6. KIEDY adres został potwierdzony, WTEDY automat MUSI wiedzieć o tym w dalszej części rozmowy,
   czyli nie MUSI pytać o ten adres ponownie ani proponować weryfikacji drugi raz.
7. JEŚLI gość poda błędny kod, WTEDY system MUSI powiedzieć, że kod jest błędny, podać liczbę
   pozostałych prób i pokazać trzy możliwości: **wyślij kod ponownie**, **zmień adres**,
   **rezygnuję**.
8. KIEDY gość wybierze „wyślij ponownie", WTEDY system MUSI wysłać nowy kod na ten sam adres i
   wrócić do kroku z kodem.
9. KIEDY gość wybierze „zmień adres", WTEDY system MUSI poprosić o nowy adres i zacząć
   weryfikację od początku dla nowego adresu.
10. KIEDY gość wybierze „rezygnuję", WTEDY system MUSI zakończyć kreator i wrócić do zwykłej
    rozmowy z automatem.
11. JEŚLI kod wygasł albo próby się wyczerpały, WTEDY system MUSI to powiedzieć i pokazać te
    same trzy możliwości, zamiast kończyć rozmowę.
12. JEŚLI na ten adres poszły już trzy kody w ciągu kwadransa, WTEDY system MUSI odmówić
    wysłania kolejnego i powiedzieć, ile trzeba odczekać.
13. DOPÓKI bramka czeka na kod, TEN system MUSI traktować wiadomości gościa jako odpowiedź
    bramce, a nie jako nowe pytanie do automatu.

---

### Wymaganie 3 — ta sama bramka dla zmiany danych, rezygnacji i wypisania z powiadomień

**Historia użytkownika:** Jako zawodnik chcę zmienić dane, wycofać się albo wyłączyć
powiadomienia tą samą drogą co każdą inną sprawę, żeby nie uczyć się dwóch różnych sposobów.

#### Kryteria akceptacji

1. KIEDY gość prosi w rozmowie o wypisanie z powiadomień, WTEDY system MUSI przeprowadzić go
   przez bramkę z Wymagania 2 i po potwierdzeniu wykonać wypisanie.
2. KIEDY gość prosi w rozmowie o zmianę danych albo o wycofanie ze wyścigu, WTEDY system MUSI
   przeprowadzić go przez bramkę z Wymagania 2 przed pokazaniem lub zmianą czegokolwiek.
3. KIEDY adres jest potwierdzony dla sprawy „zmiana danych" albo „rezygnacja", WTEDY system MUSI
   przekazać potwierdzenie do formularza zarządzania zgłoszeniem tak, żeby gość nie wpisywał kodu
   po raz drugi.
4. GDZIE sprawa dotyczy zgłoszenia osoby niepełnoletniej, TAM system MUSI odmówić zmiany w
   rozmowie i skierować do organizatorów, tak jak robi to dzisiaj formularz.
5. KIEDY kod jest wystawiany, WTEDY system MUSI zapisać, do czego służy, i kod wystawiony na
   jedną sprawę NIE MUSI działać na inną.
6. JEŚLI podany adres nie jest zapisany na żadnej liście, WTEDY system MUSI odpowiedzieć tak
   samo jak dla adresu znanego, nie ujawniając, czy ktoś jest zapisany.

---

### Wymaganie 4 — zgoda na prywatność i regulamin przed pytaniem o kontakt

**Historia użytkownika:** Jako gość zostawiający swój numer i adres chcę najpierw zobaczyć, na co
się zgadzam, żeby wiedzieć, komu i po co daję swoje dane.

#### Kryteria akceptacji

1. KIEDY gość poda nazwę carruleddhi w zgłoszeniu sponsora, WTEDY system MUSI — przed zadaniem
   pytania o kontakt — poprosić o zgodę na politykę prywatności i regulamin.
2. KIEDY system prosi o zgodę, WTEDY MUSI dać możliwość otwarcia obu dokumentów, w języku
   rozmowy, bez utraty stanu kreatora.
3. DOPÓKI zgoda nie jest udzielona, TEN system NIE MUSI pytać o telefon, adres, imię ani
   nazwisko.
4. KIEDY gość udzieli zgody, WTEDY system MUSI zapamiętać ten fakt razem ze zgłoszeniem i
   przejść do pytań o kontakt.
5. KIEDY gość odmówi zgody, WTEDY system MUSI zakończyć kreator zdaniem, że rozumiemy, i wrócić
   do zwykłej rozmowy — bez wysyłania czegokolwiek do organizatorów.

---

### Wymaganie 5 — zgłoszenie sponsora zbiera komplet danych

**Historia użytkownika:** Jako organizator chcę dostać zgłoszenie, na które da się odpowiedzieć:
z imieniem, nazwiskiem, nazwą carruleddhi i sprawdzonym adresem.

#### Kryteria akceptacji

1. KIEDY gość przechodzi zgłoszenie sponsora, WTEDY system MUSI zebrać: nazwę carruleddhi, imię
   i nazwisko osoby kontaktowej, adres e-mail oraz zgodę z Wymagania 4.
2. GDZIE zbierany jest adres e-mail, TAM jest on **obowiązkowy** i system NIE MUSI przyjąć
   zgłoszenia bez niego.
3. GDZIE zbierany jest numer telefonu, TAM jest on **opcjonalny** i gość MUSI móc ten krok
   pominąć.
4. JEŚLI podany adres jest niepoprawny składniowo, WTEDY system MUSI poprosić o niego ponownie,
   nie tracąc pozostałych już podanych danych.
5. KIEDY adres jest podany, WTEDY system MUSI przeprowadzić bramkę z Wymagania 2 przed
   wysłaniem zgłoszenia do organizatorów.
6. DOPÓKI adres nie jest potwierdzony kodem, TEN system NIE MUSI wysyłać ani powiadomienia na
   WhatsApp, ani maila do organizatorów.
7. KIEDY adres zostanie potwierdzony, WTEDY system MUSI odpowiedzieć zdaniem „dziękujemy,
   odezwiemy się najszybciej jak to możliwe" w języku rozmowy.

---

### Wymaganie 6 — powiadomienie organizatorów w ich własnym języku

**Historia użytkownika:** Jako organizator chcę dostać powiadomienie na WhatsApp w swoim języku,
żeby nie tłumaczyć sobie zgłoszenia z obcego.

#### Kryteria akceptacji

1. KIEDY zgłoszenie sponsora zostanie potwierdzone kodem, WTEDY system MUSI wysłać powiadomienie
   na WhatsApp do każdego numeru skonfigurowanego w `WHATSAPP_ALERTS`.
2. GDZIE numer ma przypisany język w konfiguracji, TAM ramka wiadomości MUSI być w tym języku —
   numer polski po polsku, numer włoski po włosku.
3. KIEDY powiadomienie jest składane, WTEDY MUSI zawierać: informację, że ktoś jest chętny do
   współpracy, nazwę carruleddhi, imię i nazwisko oraz podane kontakty.
4. GDZIE w powiadomieniu pojawiają się dane wpisane przez człowieka, TAM MUSZĄ być przeniesione
   dosłownie, bez tłumaczenia.
5. KIEDY powiadomienie zostanie potwierdzone, WTEDY system MUSI wysłać też maila do organizatorów
   z tą samą treścią.
6. JEŚLI wysłanie na WhatsApp się nie uda, WTEDY system MUSI zapisać powód w miejscu, w którym
   panel pokazuje ciche awarie kanałów, i NIE MUSI z tego powodu odmawiać zgłoszenia.
7. GDZIE powiadomienie jest wysyłane, TAM klucze i numery MUSZĄ pochodzić ze zmiennej
   środowiskowej, a nie z kodu ani z repozytorium.

---

### Wymaganie 7 — potwierdzenie dla zgłaszającego

**Historia użytkownika:** Jako zgłaszający chcę dostać maila potwierdzającego, żeby mieć dowód,
że zgłoszenie doszło, i wiedzieć, czego się spodziewać.

#### Kryteria akceptacji

1. KIEDY zgłoszenie sponsora zostanie potwierdzone kodem, WTEDY system MUSI wysłać maila na
   potwierdzony adres zgłaszającego.
2. GDZIE mail jest składany, TAM MUSI być w języku rozmowy i MUSI mówić, że odezwiemy się
   najszybciej jak to możliwe.
3. KIEDY mail jest składany, WTEDY MUSI zawierać podsumowanie zgłoszenia: nazwę carruleddhi,
   imię i nazwisko oraz podane kontakty.
4. GDZIE mail zawiera adres do kontaktu z organizatorami, TAM MUSI to być adres organizatorów,
   a odpowiedź na tego maila MUSI do nich trafiać.
5. JEŚLI wysłanie maila do zgłaszającego się nie uda, WTEDY system MUSI to zapisać i NIE MUSI
   z tego powodu odrzucać zgłoszenia, które już poszło do organizatorów.

---

## Wymagania pozafunkcjonalne i ograniczenia

### O1 — sześć języków, bez wyjątków

Każdy nowy tekst widoczny dla gościa MUSI istnieć w sześciu językach: włoskim, polskim,
angielskim, niemieckim, hiszpańskim i francuskim. Teksty interfejsu idą do `assets/js/i18n.js`,
teksty maili do `emails/copy.json`. Kompletność sprawdzają `check-i18n.mjs` i `check-refs.mjs`
i oba MUSZĄ przechodzić.

### O2 — nowy cel kodu wymaga migracji

`verification_codes.purpose` ma ograniczenie `CHECK` dopuszczające dziś wyłącznie
`unsubscribe`, `manage-entry`, `edit-entry` i `cancel-entry` (migracja `0018`). Zgłoszenie
sponsora potrzebuje własnego celu, więc MUSI powstać migracja rozszerzająca tę listę. Migracja
MUSI zdejmować ograniczenie po nazwie wyszukanej w katalogu, nie zgadywanej, i zakładać nowe —
tak jak robią to `0016` i `0018`.

### O3 — dane sponsora nie lądują w bazie

Zgłoszenie sponsora MUSI dalej dochodzić do organizatorów jako powiadomienie, bez tworzenia
tabeli na dane firm. Jedynym wierszem zapisywanym w bazie jest kod weryfikacyjny, który wygasa.

### O4 — sufit na wysyłkę kodów obowiązuje wszystkie sprawy

Nowy cel kodu MUSI podlegać temu samemu sufitowi co pozostałe: trzy kody na adres na kwadrans,
liczone w `verification_codes`. Zakres celów MUSI być rozdzielony tak, żeby jedna sprawa nie
zjadała limitu innej.

### O5 — potwierdzenie po stronie serwera, nie przeglądarki

Stan kreatora żyje w przeglądarce i nie jest niczym chroniony. Każda czynność wymagająca
potwierdzenia MUSI żądać pary (adres, kod) przy tym samym żądaniu, w którym jest wykonywana.
Podrobiony stan po stronie strony NIE MUSI dawać ani jednej czynności więcej.

### O6 — odmowa nie ujawnia, kto jest na liście

Odpowiedzi na pytania o adres MUSZĄ być identyczne dla adresu znanego i nieznanego. Dotyczy to
także komunikatów o błędach i o limitach.

### O7 — awaria kanału nie blokuje uczciwych

Nieudany odczyt z bazy przy sprawdzaniu limitu MUSI przepuszczać, a nie blokować. Nieudane
wysłanie powiadomienia MUSI być zapisane, a nie zamieniane w odmowę dla gościa.
