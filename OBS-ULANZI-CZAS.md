# Carruleddhi: jeden centralny czas przejazdu

## Zasada działania

Jedynym źródłem pomiaru jest backend i baza danych. Panel organizatora i Ulanzi sterują **tym samym przejazdem**. Pomocnik `tools/race-timer.mjs` jest wyłącznie klientem sterującym: nie uruchamia lokalnego stopera, nie mierzy czasu, nie wysyła znaczników czasu ani wyniku i nigdy nie zapisuje przez `voting-admin`.

**ON AIR w panelu oznacza teraz rzeczywisty START**, a nie samo przygotowanie nazwiska. Nie klikaj ON AIR z wyprzedzeniem jako próby grafiki. START CZAS podczas istniejącego `RUNNING` odczytuje ten sam przejazd i nie zeruje go. Pokazywanie/ukrywanie zawodnika lub sponsorów jest oddzielną operacją i nie startuje ani nie zatrzymuje czasu.

## Obsługa podczas zawodów

1. Sprawdź tożsamość właściwego zawodnika w panelu. W chwili rozpoczęcia przejazdu kliknij jego **ON AIR / START**. Backend nadaje `runId` i ustala czas początku w bazie.
2. Nie uruchamiaj drugiego stopera na Ulanzi. **START CZAS** steruje tym samym centralnym przejazdem: przy `RUNNING` niczego nie restartuje; gdy nie trwa przejazd, wysyła START dla zawodnika wybranego we wspólnym stanie backendu. Samo SHOW nie wybiera innej osoby.
3. Na mecie użyj **STOP w panelu** albo **STOP ZAPIS** na Ulanzi. Klient odczytuje aktualny przejazd i przesyła jego `runId`. Backend atomowo ustala czas końca, zapisuje wynik i zamraża dane ostatnio zakończonego przejazdu. Skrót czeka na odpowiedź HTTP; nie potwierdza zatrzymania przed odpowiedzią.
4. Potwierdź `FINISHED` i wynik w panelu albo przez `node tools/race-timer.mjs status`. `IDLE` oznacza brak uruchomionego przejazdu, `RUNNING` trwający pomiar. Pomocnik nie wyświetla własnego odliczania. Nie ma już lokalnych stanów `starting`, `pending` ani `saved`.
5. **POWTORKA** przełącza OBS na REPLAY. Źródło `/obs/replay` pokazuje zamrożonego ostatnio zakończonego zawodnika i jego centralny wynik; rozpoczęcie kolejnego przejazdu nie podmienia tej powtórki. Nie klikaj ponownie ON AIR w celu przygotowania powtórki, bo to jest START.
6. **LIVE** wraca do sceny LIVE. ON AIR / START następnej osoby rozpoczyna następny centralny przejazd dopiero po zakończeniu poprzedniego. Ręczną korektę zweryfikowanego wyniku wykonuje uprawniony organizator w panelu, nie pomocnik; korekta nie zmienia zamrożonej powtórki.

## Sieć, opóźnienie i ponawianie

**STOP jest skuteczny w chwili obsługi przez backend/bazę, nie w chwili fizycznego naciśnięcia przycisku.** Czas obejmuje opóźnienie Ulanzi/VBS/Node.js, odczyt aktualnego stanu, transmisję sieciową i oczekiwanie backendu. START również otrzymuje czas z bazy. Precyzja zapisu do milisekund nie jest dokładnością fotokomórki.

Bez połączenia nie da się zagwarantować centralnego STOP. Błąd lub timeout oznacza **brak potwierdzenia / stan nieznany**, a nie lokalnie zatrzymany czas. Żądanie mogło dotrzeć mimo utraconej odpowiedzi. Nie powstaje lokalny wynik do późniejszego nadpisania serwera; nic nie jest automatycznie ponawiane.

Po błędzie odśwież stan w panelu lub komendą `status`. Jeśli trzeba powtórzyć STOP, użyj **oryginalnego `runId`** z komunikatu/diagnostyki:

```powershell
node tools/race-timer.mjs status
node tools/race-timer.mjs stop --run-id UUID-ORYGINALNEGO-PRZEJAZDU
```

W drugim poleceniu identyfikator musi być rzeczywistym UUID przejazdu. Powtórzony STOP tego samego zakończonego przejazdu zwraca ten sam wynik. Gdy zaczęto nowy przejazd, stary `runId` powoduje odmowę zamiast zatrzymania nowej osoby. Klient sprawdza identyfikator przed wysłaniem, a backend ponownie pod blokadą bazy. Nowe naciśnięcie zwykłego STOP bez identyfikatora jest **nową komendą dla aktualnego przejazdu**, nie automatycznym ponowieniem starej. Nie ponawiaj go w ciemno po zmianie zawodnika. Nie da się odtworzyć momentu fizycznego kliknięcia, które nie dotarło do klienta/serwera.

Istniejące VBS mają ogólny komunikat „ponów STOP”. Po migracji obowiązuje powyższa procedura sprawdzenia stanu i oryginalnego `runId`, nie bezwarunkowe naciskanie przycisku.

## OBS i Ulanzi

Źródła przeglądarkowe: **1920 × 1080**, przezroczyste tło, bez sekretów w URL:

| Źródło | Adres | Zawartość |
| --- | --- | --- |
| ZAWODNIK | `https://www.carruleddhishow.com/obs/participant` | Aktualny zawodnik, bez drugiego stopera |
| ZAWODNIK POWTORKA | `https://www.carruleddhishow.com/obs/replay` | Ostatni zakończony zawodnik i zamrożony wynik |
| SPONSORZY | `https://www.carruleddhishow.com/obs/sponsors` | Niezależny pasek sponsorów |

REPLAY używa osobnej sceny MASTER_REPLAY i źródła ZAWODNIK POWTORKA. POWTORKA (`Ctrl+Alt+F7`) i LIVE (`Ctrl+Alt+F8`) zmieniają tylko scenę OBS. Odtwarzanie obrazu pozostaje zadaniem istniejącego Replay Source; kontroler czasu nie nagrywa wideo ani nie uruchamia transmisji.

| Przycisk | Działanie po migracji |
| --- | --- |
| START CZAS | Centralny START wybranego zawodnika; trwający przejazd bez zmian |
| STOP ZAPIS | Centralny STOP z `runId`; oczekiwanie na odpowiedź backendu |
| POWTORKA | Scena REPLAY, bez mutacji przejazdu |
| LIVE | Scena LIVE, bez mutacji przejazdu |
| CZAS INFO | Otwiera diagnostyczny `status.txt`, **nie stan na żywo** |

Inspekcja tylko do odczytu 02.10.2026 potwierdziła: profil Ulanzi `ProfilesV2` wskazuje `start.vbs`, `stop.vbs` i `status.txt` w `%LOCALAPPDATA%\Carruleddhi\race-timer`. VBS wywołują Node.js i `F:\!!CAR\tools\race-timer.mjs start|stop`, oczekując na zakończenie komendy. Istnieje również `status.vbs`, lecz przycisk CZAS INFO otwiera plik tekstowy, nie ten skrypt. **Ścieżek, profilu, VBS ani konfiguracji OBS nie trzeba zmieniać.** Nie modyfikowano ich w tej aktualizacji.

`status.txt` jest tylko migawką diagnostyczną ostatniego wywołania, wyraźnie oznaczoną jako potencjalnie nieaktualna. Samo ponowne otwarcie pliku nie odpyta serwera. Po zmianie w panelu uruchom `node tools/race-timer.mjs status` lub istniejący `status.vbs`, a następnie otwórz plik ponownie. W razie błędu połączenia diagnostyka zastępuje poprzedni sukces komunikatem o nieznanym stanie. Błąd zapisu diagnostyki nie cofa zaakceptowanej operacji backendu.

## Bezpieczeństwo i protokół

Kontroler korzysta wyłącznie z `GET /api/broadcast/state` oraz `POST /api/broadcast/start`, `stop`, `show-participant`, `hide-participant`, `show-sponsors`, `hide-sponsors`. START przesyła tylko `{participantId}`, STOP tylko `{runId}`, widoczność `{}`. Nie wysyła lokalnego czasu ani nagłówka `X-Race-Timer-At`. Odpowiedź wymaga centralnego schematu i `runReady: true`; stary backend nie uruchomi lokalnego trybu zastępczego.

Preferowane uwierzytelnienie to `Authorization: Bearer` z dedykowanym `BROADCAST_CONTROL_TOKEN` skonfigurowanym po stronie backendu i prywatnego środowiska procesu. Alternatywą jest istniejący `ROSTER_KEY` w nagłówku `X-Carruleddhi-Roster-Key`, wyłącznie jeśli backend go dopuszcza. Zmienne procesu mają pierwszeństwo nad odpowiednią wartością w istniejącym `.env.local`. Jeśli wybrano token dedykowany, odrzucenie go **nie** powoduje automatycznego przejścia na hasło admina. Nie korzystamy z klucza serwisowego bazy. Żaden sekret nie trafia do profilu, OBS URL ani frontendu.

Token powinien być losowy (zalecane 32 losowe bajty zapisane jako 64 znaki hex; API wymaga co najmniej 32 znaków). W Vercel ustaw `BROADCAST_CONTROL_TOKEN` i wykonaj wdrożenie. Unieważnienie polega na usunięciu/zmianie tej wartości i ponownym wdrożeniu. Usuń lub zabezpiecz również starsze wdrożenia, które zachowały stary token i dostęp do tej samej bazy. Dedykowany token pozwala tylko na operacje broadcastu, nie zarządzanie zgłoszeniami czy sponsorami.

### API dla zewnętrznego kontrolera

Bazowy adres: `https://www.carruleddhishow.com/api/broadcast`. Używaj `www`: domena bez `www` przekierowuje, a klient może zgubić nagłówek Authorization.

| Metoda | Ścieżka | JSON |
| --- | --- | --- |
| GET | `/state` | brak; publiczny, bez prywatnych danych zgłoszenia |
| POST | `/start` | `{"participantId":"UUID-ZAWODNIKA"}` |
| POST | `/stop` | `{}` dla bieżącego przejazdu albo bezpieczniej `{"runId":"UUID-PRZEJAZDU"}` |
| POST | `/show-participant` | `{}` |
| POST | `/hide-participant` | `{}` |
| POST | `/show-sponsors` | `{}` |
| POST | `/hide-sponsors` | `{}` |

Wszystkie POST wymagają `Content-Type: application/json` i `Authorization: Bearer <BROADCAST_CONTROL_TOKEN>`. Nie przekazuj czasu, `startedAt` ani `elapsedMs`: wyznacza je baza. Identyfikator przejazdu jest w `state.run_id`, a próbka zegara bazy w `serverNow`. `participantId` to UUID z tabeli uczestników, nie numer startowy ani identyfikator zgłoszenia. START z opcjonalnym `runId` pozwala rozpoznać ponowione żądanie bieżącego przejazdu. Błędny lub nieaktualny identyfikator zwraca konflikt, nie zatrzymuje nowego zawodnika.

Lokalny IPC zachowuje port/token z `config.json`, nasłuchuje wyłącznie na `127.0.0.1` i odrzuca żądania przeglądarkowe z Origin. Protokół **3** wymaga nagłówka wersji i odrzuca stare nagłówki czasu. Nowy launcher sprawdza wersję przed mutacją i nie wysyła START/STOP do starego procesu. `node tools/race-timer.mjs health` sprawdza tylko lokalny proces/protokół, **nie** gotowość backendu ani stan przejazdu. Każde `status` odczytuje serwer.

Helper nie odczytuje, nie tworzy i nie nadpisuje `state.json`. Stary plik wyniku pozostaje nietknięty do ewentualnego ręcznego odzyskania. Nie importuj go jako bieżącego stanu i nie uruchamiaj starej wersji, aby „dokończyła zapis”. `config.json`, diagnostyka i logi są lokalne; zabezpiecz dostęp do profilu Windows i `.env.local`.

## Migracja i restart

1. Poza trwającym przejazdem trzeba zatrzymać **stary pomocnik przed aktywacją migracji centralnego czasu**, aby nie działały dwa systemy. W tej aktualizacji sprawdzono zapisany stan `saved` i zatrzymano wyłącznie zarządzanego starego pomocnika. Zachowano `state.json` i poprzedni wynik; OBS i Ulanzi nie były zamykane. Nowy klient wymaga uruchomienia dopiero po migracji i wdrożeniu API.
2. Zachowaj stary `state.json` do odzyskania. Backend wymaga migracji `0050_broadcast_run_control.sql` oraz wdrożenia nowych tras API. Wdrożenie i aktywacja są zadaniem koordynatora; niniejszy helper nie wykonuje migracji ani produkcyjnych START/STOP.
3. Uruchom testy `node --test tools/test-race-timer.mjs`. Uzgodnij dostępne uwierzytelnienie backendu. Przy dopuszczonym istniejącym `ROSTER_KEY` nie trzeba zmieniać konfiguracji lokalnej; token dedykowany można skonfigurować oddzielnie. Nie zapisuj sekretu w dokumentacji ani argumentach skrótów.
4. Po pełnych testach i wymaganej zgodzie właściciel uruchamia `node tools/race-timer.mjs serve` jako zarządzany proces długotrwały. Asystent używa narzędzia procesów tła, nie shellowego odłączania procesu. **Skróty nie uruchamiają pomocnika automatycznie**. Brak procesu powoduje błąd, nie utworzenie lokalnego stopera.
5. Sprawdź `node tools/race-timer.mjs health` (protokół 3), następnie `node tools/race-timer.mjs status` (rzeczywisty backend). Test START/STOP wykonuj dopiero na danych testowych i po osobnym uzgodnieniu, nie na prawdziwym zawodniku.

Automatyczne testy używają lokalnego serwera mock: aktualny stan backendu, Admin START i duplikaty, oczekiwanie na STOP, ten sam `runId`, utracone potwierdzenie, bezpieczne ponowienie i zmiana przejazdu, odmowa starego protokołu, brak lokalnych zapisów wyniku, autoryzacja, brak niejawnego fallbacku i brak fałszywego sukcesu offline. Testy nie naciskają przycisków Ulanzi i nie wykonują produkcyjnych START/STOP.
