# Carruleddhi: zawodnik, pomiar i powtórka

## Obsługa podczas zawodów

1. Otwórz panel organizatora → **Zgłoszenia**. Przy właściwym zawodniku kliknij **ON AIR**. Numer i nazwisko muszą odpowiadać osobie na starcie.
2. Na Ulanzi, w profilu **CARRULEDDHI 2026**, naciśnij **START CZAS**, gdy zawodnik ruszy.
3. Na mecie naciśnij **STOP ZAPIS**. Zegar zatrzyma się, a wynik zostanie zapisany przy osobie wybranej na początku pomiaru.
4. **CZAS INFO** otwiera lokalny stan pomiaru: `running` — trwa; `saved` — zapisano; `pending` — zatrzymano, ale zapis wymaga ponowienia STOP.
5. Aby poprawić wynik, użyj pola **Czas przejazdu** w Zgłoszeniach lub Głosowaniu. Wpisz np. `1:23.456` i kliknij **Zapisz**. Puste pole usuwa czas; `0:00.000` oznacza rzeczywisty zapis zera.
6. Przed powtórką upewnij się, że w panelu nadal wybrany jest zawodnik z odtwarzanego przejazdu. **POWTORKA** na Ulanzi przełącza OBS na scenę **REPLAY**. Nakładka pokazuje wybraną osobę i jej ostatnio zapisany czas pod kartą.
7. **LIVE** wraca do sceny **LIVE**. Dla kolejnej osoby wybierz jej ON AIR, potem START CZAS.

Nie naciskaj START ponownie, żeby zerować trwający pomiar: kolejne naciśnięcie jest celowo ignorowane. Po STOP następny START rozpoczyna nowy pomiar. Ponowne STOP po udanym zapisie niczego nie nadpisuje, także po ręcznej korekcie czasu.

Jeśli po STOP wystąpi błąd sieci, wynik jest już zatrzymany lokalnie. Naciśnij STOP ponownie po odzyskaniu połączenia. Zapisze ten sam czas, bez doliczania oczekiwania. Do czasu udanego zapisu nowy START jest zablokowany.

## Źródła OBS

Wszystkie źródła przeglądarkowe mają rozdzielczość **1920 × 1080** i przezroczyste tło:

| Źródło | Adres | Zawartość |
| --- | --- | --- |
| ZAWODNIK | `https://www.carruleddhishow.com/obs/participant` | Karta zawodnika bez czasu |
| ZAWODNIK POWTORKA | `https://www.carruleddhishow.com/obs/replay` | Ta sama karta z zapisanym czasem pod spodem |
| SPONSORZY | `https://www.carruleddhishow.com/obs/sponsors` | Pasek sponsorów |

Scena **REPLAY** używa osobnej sceny **MASTER_REPLAY**, z kopią układu MASTER_OVERLAY i źródłem ZAWODNIK POWTORKA. Dzięki temu czas nie pojawia się na zwykłym źródle ZAWODNIK. Brak zapisanego czasu oznacza brak paska czasu, a nie wynik zero.

Przycisk POWTORKA przełącza scenę; odtwarzanie obrazu nadal obsługuje istniejące źródło **Replay Source** i jego konfiguracja. Pomiar czasu nie nagrywa wideo, nie zapisuje bufora OBS i nie uruchamia transmisji.

## Przyciski Ulanzi

Na drugiej linii głównej strony profilu dodano pięć przycisków, zachowując istniejące foldery:

| Przycisk | Funkcja |
| --- | --- |
| START CZAS | Uruchamia lokalny pomiar dla wybranego zawodnika |
| STOP ZAPIS | Zatrzymuje i zapisuje wynik przez chronione API |
| POWTORKA | Skrót OBS `Ctrl+Alt+F7` — scena REPLAY |
| LIVE | Skrót OBS `Ctrl+Alt+F8` — scena LIVE |
| CZAS INFO | Otwiera plik stanu pomiaru |

Przyciski pomiaru uruchamiają skrypty w `%LOCALAPPDATA%\Carruleddhi\race-timer`. Pomocnik startuje automatycznie po pierwszym użyciu. Nie wymaga uruchomionego terminala ani włączania OBS WebSocket. Wymaga Node.js oraz tego projektu pod aktualną ścieżką i istniejącego `.env.local` z hasłem `ROSTER_KEY`.

Pliki `state.json`, `status.txt` i `errors.log` w tym katalogu pozostają na tym komputerze. Hasło panelu nie trafia do adresów nakładek ani profilu Ulanzi. Pomocnik nasłuchuje tylko na `127.0.0.1:17864` i wymaga lokalnego losowego tokena.

Kopie konfiguracji sprzed zmian są w `%LOCALAPPDATA%\Carruleddhi\backups`. Przy odtwarzaniu kopii najpierw zamknij odpowiednio OBS lub Ulanzi, żeby program nie nadpisał przywróconego pliku.

## Sprawdzenie przed wydarzeniem

Wybierz zawodnika testowego, uruchom START, po kilku sekundach STOP i sprawdź `saved` w CZAS INFO oraz wynik w panelu. Przełącz POWTORKA, sprawdź właściwą osobę i czas, popraw czas ręcznie i sprawdź aktualizację nakładki. Wróć do LIVE. Próbę wykonuj na danych testowych; nie nadpisuj wyników prawdziwego przejazdu.

To ręcznie wyzwalany stoper. Precyzja zapisu do milisekundy nie oznacza dokładności pomiaru fotokomórką: wpływają na nią moment naciśnięcia, uruchomienie skryptu i zegar komputera. Nie zmieniaj zegara systemowego podczas pomiaru. W razie rozbieżności wpisz zweryfikowany czas ręcznie.
