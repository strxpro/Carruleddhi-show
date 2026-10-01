# Carruleddhi: zawodnik, pomiar i powtórka

## Obsługa podczas zawodów

1. Otwórz panel organizatora → **Zgłoszenia**. Przy właściwym zawodniku kliknij **ON AIR**. Numer i nazwisko muszą odpowiadać osobie na starcie.
2. Na Ulanzi, w profilu **CARRULEDDHI 2026**, naciśnij **START CZAS**, gdy zawodnik ruszy. `starting` oznacza ustalanie zawodnika przez API; po potwierdzeniu pojawi się `running` i nazwisko. Nie zmieniaj ON AIR, dopóki nazwisko nie zostanie potwierdzone. Pomiar liczy się od wywołania START, nie od końca odpowiedzi API.
3. Na mecie naciśnij **STOP ZAPIS**. Pomocnik utrwala lokalnie zatrzymany czas jako `pending` i zwalnia przycisk, bez czekania na Internet. Dopiero potem zapisuje wynik zdalnie przy zawodniku ustalonym podczas START; zmiana ON AIR po potwierdzonym START nie zmienia adresata wyniku.
4. **CZAS INFO** otwiera `status.txt`: `starting` — ustalanie zawodnika; `running` — trwa; `pending` — zatrzymano, zapis trwa lub wymaga ponowienia; `saved` — API potwierdziło zapis; `failed` — START nie został potwierdzony. To plik tekstowy, nie interaktywny panel: otwórz go ponownie, aby zobaczyć późniejszy wynik zapisu. Ostatni błąd znajduje się pod czasem.
5. Aby poprawić wynik, użyj pola **Czas przejazdu** w Zgłoszeniach lub Głosowaniu. Wpisz np. `1:23.456` i kliknij **Zapisz**. Puste pole usuwa czas; `0:00.000` oznacza rzeczywisty zapis zera.
6. Przed powtórką upewnij się, że w panelu nadal wybrany jest zawodnik z odtwarzanego przejazdu. **POWTORKA** na Ulanzi przełącza OBS na scenę **REPLAY**. Nakładka pokazuje wybraną osobę i jej ostatnio zapisany czas w plakietce **TEMPO** przy dolnej krawędzi zdjęcia.
7. **LIVE** wraca do sceny **LIVE**. Dla kolejnej osoby wybierz jej ON AIR, potem START CZAS.

Nie naciskaj START ponownie, żeby zerować trwający pomiar: kolejne naciśnięcie podczas `starting` lub `running` jest celowo ignorowane. Dopiero po `saved` następny START rozpoczyna nowy pomiar. Ponowne STOP po udanym zapisie niczego nie nadpisuje zdalnie, także po ręcznej korekcie czasu. Komendy, które dotarły w odwrotnej kolejności i mają starszy znacznik czasu, są odrzucane, zamiast zatrzymywać następnego zawodnika.

Jeśli po STOP wystąpi błąd sieci, wynik jest już zatrzymany lokalnie. Naciśnij STOP ponownie po odzyskaniu połączenia. Zapisze ten sam czas, bez doliczania oczekiwania. Do czasu udanego zapisu nowy START jest zablokowany.

STOP działa również podczas `starting`: czas mety jest zapisywany natychmiast, a dokończenie ustalania zawodnika nie uruchamia zegara ponownie. Jeżeli początkowe ustalenie zawodnika zakończy się błędem albo pomocnik zostanie wtedy zamknięty, STOP nie pobiera nowo wybranej osoby. Zachowuje pomiar do ręcznego przypisania. Taki `pending` bez zawodnika wymaga ręcznej korekty w panelu i uzgodnienia lokalnego stanu przy wyłączonym pomocniku; nie usuwaj pliku pomiaru bez kopii. Przy `failed` bez STOP można ponownie uruchomić START po usunięciu przyczyny błędu.

Błąd dysku jest innym przypadkiem niż brak Internetu: STOP zachowuje pierwszy czas w pamięci i nie wysyła go do API przed poprawnym zapisem `state.json`. Nie zamykaj wtedy pomocnika; sprawdź miejsce i uprawnienia, ponów STOP. Zakończenie procesu przed skutecznym zapisem na dysku może utracić tę informację.

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
| STOP ZAPIS | Zatrzymuje lokalnie; osobno zapisuje wynik przez chronione API |
| POWTORKA | Skrót OBS `Ctrl+Alt+F7` — scena REPLAY |
| LIVE | Skrót OBS `Ctrl+Alt+F8` — scena LIVE |
| CZAS INFO | Otwiera plik stanu pomiaru |

Przyciski pomiaru uruchamiają skrypty w `%LOCALAPPDATA%\Carruleddhi\race-timer`. Pomocnik startuje automatycznie po pierwszym użyciu. Nie wymaga uruchomionego terminala ani włączania OBS WebSocket. Wymaga Node.js oraz tego projektu pod aktualną ścieżką i istniejącego `.env.local` z hasłem `ROSTER_KEY`.

Weryfikacja lokalnej konfiguracji 02.10.2026: zapisany profil Ulanzi `ProfilesV2` rzeczywiście wskazuje `start.vbs`, `stop.vbs` oraz `status.txt`; oba skrypty wywołują `F:\!!CAR\tools\race-timer.mjs` przez Node.js. Skrypty czekają tylko na lokalne przyjęcie komendy, nie na zapis w Internecie. Nie zmieniono profilu, skryptów ani tokenów. Sprawdzono konfigurację plików, bez naciskania przycisków i bez pomiaru na prawdziwym zawodniku.

Pliki `state.json`, `status.txt` i `errors.log` w tym katalogu pozostają na tym komputerze. Hasło panelu nie trafia do adresów nakładek ani profilu Ulanzi. Pomocnik nasłuchuje tylko na `127.0.0.1:17864` i wymaga lokalnego losowego tokena.

Po aktualizacji kodu już uruchomiony pomocnik nadal korzysta ze starej wersji. Nowe skróty najpierw sprawdzają wersję protokołu i odmawiają wysłania START/STOP do starego procesu; informacja trafia do `errors.log`. Przed zawodami właściciel procesu musi zamknąć stary pomocnik poza trwającym pomiarem i ponownie uruchomić `node tools/race-timer.mjs serve` albo skrót. Nie kończ dowolnych procesów Node.js. W tej aktualizacji, po zgodzie właściciela i ponownym sprawdzeniu stanu `saved`, zrestartowano wyłącznie pomocnika. Potwierdzono protokół 2 i zachowanie poprzedniego wyniku. OBS i Ulanzi nie były zamykane.

Panel internetowy może edytować zapisany wynik, ale sam zapis pola **Czas przejazdu** nie jest lokalnym STOP. Nie wklejaj lokalnego tokena ani hasła organizatora do strony publicznej, adresu URL lub kodu nakładki.

Kopie konfiguracji sprzed zmian są w `%LOCALAPPDATA%\Carruleddhi\backups`. Przy odtwarzaniu kopii najpierw zamknij odpowiednio OBS lub Ulanzi, żeby program nie nadpisał przywróconego pliku.

## Sprawdzenie przed wydarzeniem

Wybierz zawodnika testowego, uruchom START, po kilku sekundach STOP i sprawdź `saved` w CZAS INFO oraz wynik w panelu. Przełącz POWTORKA, sprawdź właściwą osobę i czas, popraw czas ręcznie i sprawdź aktualizację nakładki. Wróć do LIVE. Próbę wykonuj na danych testowych; nie nadpisuj wyników prawdziwego przejazdu.

Automatyczne testy bez produkcji: `node --test tools/test-race-timer.mjs`. Obejmują zablokowane API START/zapisu, STOP podczas START, powtórzenia, zmianę zawodnika, odwróconą kolejność komend, błędy dysku, wznowienie `pending`, autoryzację lokalnego HTTP i odmowę obsługi starego pomocnika.

To ręcznie wyzwalany stoper. Precyzja zapisu do milisekundy nie oznacza dokładności pomiaru fotokomórką: wpływają na nią moment naciśnięcia, uruchomienie Ulanzi/VBS/Node.js i zegar komputera. Znacznik czasu jest pobierany na początku programu wywołującego, przed odczytem konfiguracji, sprawdzeniem wersji i rozruchem pomocnika; bez tego nagłówka lokalne HTTP używa czasu przyjęcia żądania. Internet ani kolejka zapisów zdalnych nie doliczają czasu po STOP, ale opóźnienia przed uruchomieniem programu nie da się odtworzyć z tych skrótów. Nie zmieniaj zegara systemowego podczas pomiaru. W razie rozbieżności wpisz zweryfikowany czas ręcznie.
