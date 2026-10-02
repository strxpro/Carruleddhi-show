# Ulanzi D200H — Carruleddhi Show 2026

## Ekran główny

Górny rząd: **ZAWODNICY · POWTÓRKI · SCENY · KAMERY · AUDIO**.
Drugi rząd: **GRAFIKI · INSTRUKCJA**. Pozostałe miejsca są celowo wolne — funkcje nie są kopiowane na ekran główny.
Przycisk INSTRUKCJA otwiera ten dokument. W każdym folderze lewy górny przycisk wraca wyżej. Mały ekran urządzenia pozostaje zachowany.

Kolory: złoty — zawodnicy/grafiki, fioletowy — replay, niebieski — sceny, zielony — obraz na żywo, koralowy — audio. Ikony są animowanymi plikami GIF w jednym stylu: ciemne tło, delikatny ruch obramowania i symbolu, nieruchomy podpis. Animacja jest dekoracyjna i nie sygnalizuje stanu urządzenia.

## Przejazd zawodnika

1. W folderze ZAWODNICY otwórz PANEL EDYCJI, wybierz właściwego zawodnika i sprawdź numer oraz nazwisko.
2. **ON AIR / START w panelu rozpoczyna pomiar**, nie używaj go wcześniej tylko do pokazania nazwiska. START CZAS na Ulanzi steruje tym samym centralnym przejazdem; nie resetuje już trwającego.
3. Na mecie naciśnij **STOP ZAPIS**. Czekaj na potwierdzenie w panelu; STAN CZASU odczytuje świeży stan serwera i otwiera wynik. Nie jest to stale odświeżany ekran.
4. Korektę czasu, nazwiska i innych danych wykonuj w panelu. Przyciski POKAŻ/UKRYJ w folderze GRAFIKI osobno pokazują i ukrywają grafikę, nie uruchamiają zegara.
5. W folderze POWTÓRKI **ZŁAP I ODTWÓRZ** pobiera bufor Replay Source i przełącza OBS na REPLAY. Widoczny jest ostatni zakończony zawodnik z czasem. **SCENY → NA ŻYWO** wraca do obrazu na żywo.

Centralny pomiar obejmuje opóźnienie sieci. Po błędzie STOP sprawdź stan oraz pierwotny `runId`; nie naciskaj STOP w ciemno po wybraniu następnej osoby. Szczegóły i bezpieczne ponawianie: [OBS-ULANZI-CZAS.md](OBS-ULANZI-CZAS.md).

Nakładka replay pokazuje zamrożony ostatni zakończony przejazd. Nie przechowuje osobnej tożsamości dla każdego starego klipu: **POPRZEDNI/NASTĘPNY zmienia film, ale nie zawodnika na grafice**. Przy pokazywaniu wcześniejszych klipów sprawdź zgodność podpisu. Ręczna korekta wyniku w obecnej wersji backendu nie zmienia zamrożonego wyniku replay.

## Powtórki

| Przycisk | Działanie | Skrót |
| --- | --- | --- |
| ZŁAP I ODTWÓRZ | Pobiera najnowszy bufor i przełącza na REPLAY | Ctrl+Alt+F6 |
| PAUZA/GRAJ | Zatrzymuje/wznawia film | Ctrl+Alt+F9 |
| OD POCZĄTKU | Ponownie odtwarza bieżący klip | Ctrl+Alt+F11 |
| WOLNIEJ / SZYBCIEJ | Zmienia prędkość o 5 punktów procentowych | Ctrl+Alt+F1 / F2 |
| SLOW MOTION / NORMALNIE / SZYBKO | 50% / 100% / 200% | Ctrl+Alt+F3 / F4 / F10 |
| POPRZEDNI / NASTĘPNY | Zmienia klip w buforze | Ctrl+Alt+Left / Right |
| EDYCJA KLIPU → ZAPISZ KLIP | Eksportuje klip przez Replay Source | Ctrl+Alt+Shift+F8 |
| SCENY → NA ŻYWO | Wraca na LIVE | Ctrl+Alt+F8 |

Folder **EDYCJA KLIPU**: krok o jedną klatkę, przycięcie początku/końca, cofnięcie cięcia, odwrócenie kierunku, pierwszy/ostatni klip oraz zapis. Zatrzymaj film przed precyzyjnym cięciem. Bufor ma dotychczasowe 25 sekund i maksymalnie 3 klipy. Eksport: `%LOCALAPPDATA%\Carruleddhi\Replays`.

**SCENA REPLAY** (Ctrl+Alt+F7) tylko przełącza scenę. Nie pobiera nowego bufora. Nie myl jej z ZŁAP I ODTWÓRZ.

## Sceny i kamery

Folder SCENY ma polskie podpisy: NA ŻYWO, SCENA REPLAY, ZACZYNAMY, PRZERWA, GŁOSOWANIE, WYNIKI, OCZEKIWANIE, ZAKOŃCZENIE i INTRO. Nazwy samych scen OBS pozostały bez zmian, aby istniejące automatyzacje dalej działały. Wcześniej puste sceny otrzymały plansze po włosku. RESULTS jest planszą „wyniki wkrótce”, nie automatyczną tabelą wyników. VOTING zawiera istniejący QR. INTRO korzysta z istniejącego filmu.

KAMERY zawiera **PULPIT ON/OFF** (Ctrl+Alt+Shift+F7). Ten przycisk włącza/wyłącza warstwę pulpitu nad wejściem FEELWORLD w LIVE. Gdy pulpit jest włączony, zasłania mikser. Nie zmieniono początkowej widoczności tej warstwy.

PTZ_1_CROP i PTZ_2_CROP nie mają podłączonych fizycznych kamer, dlatego nie otrzymały mylących przycisków „kamera 1/2”. Do sterowania osobnymi kamerami potrzebne są ich rzeczywiste wejścia lub połączenia z mikserem.

## Audio i grafiki

Folder AUDIO: osobne przełączniki wyciszenia mikrofonu, dźwięku komputera, replay, intro oraz FEELWORLD. Drugi klik przywraca dźwięk. Ikony mają animację dekoracyjną — aktualny stan wyciszenia sprawdzaj w mikserze OBS.

GRAFIKI: logo ON/OFF, odświeżenie nakładek OBS, pokaż/ukryj zawodnika i sponsorów. Przełącznik logo obejmuje LIVE i REPLAY (Ctrl+Alt+Shift+F6). Istniejąca automatyka przejść OBS pozostaje zachowana.

## Uruchomienie i diagnostyka

OBS i Ulanzi muszą być uruchomione. Skróty OBS działają globalnie zgodnie z ustawieniami OBS; inne programy nie powinny używać tych samych kombinacji.

Przyciski zawodników potrzebują lokalnego klienta `tools/race-timer.mjs serve`. Stan klienta sprawdza `node tools/race-timer.mjs health`; stan centralnego przejazdu — `node tools/race-timer.mjs status`. Brak klienta lub sieci daje komunikat błędu zamiast pozornego sukcesu. Nie powstaje drugi lokalny stoper.

Konfigurator: `node tools/configure-ulanzi-obs.mjs`, wyłącznie przy zamkniętych OBS i Ulanzi. Tworzy kopię profilu, scen i pomocnika w `%LOCALAPPDATA%\Carruleddhi\backups\<data>`. Ikony, plansze i mapa skrótów są w `%LOCALAPPDATA%\Carruleddhi\deck-assets`. Przywracaj kopię przy zamkniętych aplikacjach. Nie publikuj kopii pomocnika — zawiera lokalny token IPC.

Mechanizm ładowania sceny i skróty replay opierają się na [Replay Source](https://github.com/exeldro/obs-replay-source). Nie uruchamiaj transmisji, aby tylko sprawdzić przyciski; testuj przy wyłączonym nadawaniu i nagrywaniu.

## Kontrola wykonanej konfiguracji

Generator sprawdza brak powielonych funkcji i przepełnionych folderów. Każda ikona ma 24 klatki, cykl 2,16 sekundy i nieruchomy podpis. Powtarza się tylko przycisk POWRÓT, potrzebny w każdym folderze. Zachowano kopię konfiguracji sprzed zmian.

Potwierdzono w logu OBS: pobranie 25 sekund bufora, przejście do REPLAY oraz automatyczny powrót do LIVE. Test przeglądarkowy czatu przeszedł na komputerze i telefonie; test centralnego przejazdu sprawdził START/STOP, bazę i zamrożoną powtórkę. Fizyczne naciśnięcia i odtwarzanie GIF na ekranie D200H wymagają potwierdzenia użytkownika, ponieważ narzędzie nie może kliknąć podglądu Ulanzi. Starszy test `test-race-time-ui.mjs` zatrzymuje się na usuniętym przycisku dawnego modelu replay; aktualny `test-broadcast-run-e2e.mjs` przeszedł.
