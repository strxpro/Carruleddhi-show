/* ---------------------------------------------------------------------------
   Kod weryfikacyjny zyje dziesiec minut, nie pietnascie.
   ---------------------------------------------------------------------------
   0009 ustawilo domyslne `now() + interval '15 minutes'` i oba miejsca w Workerze,
   ktore wstawiaja kod, polegaly na tym domysle. Odpowiedz na pytanie "ile ten kod
   jest wazny" lezala wiec w pliku migracji, a zdanie pokazywane gosciowi - w
   slowniku strony. Dwa miejsca, ktore moga sie rozjechac i nikt tego nie zauwazy.

   Teraz decyduje `CODE_TTL_MINUTES` w Workerze: obie wstawki licza `expires_at`
   jawnie. Ta migracja przestawia domysl kolumny na te sama liczbe, zeby wiersz
   wstawiony kiedykolwiek z pominieciem tamtego kodu mowil to samo.

   Czemu krocej: dziesiec minut wystarcza, zeby przelaczyc sie do poczty, znalezc
   list i wrocic - a kod, ktory zostal w cudzej skrzynce, przestaje byc kluczem
   piec minut wczesniej.

   Wierszy juz istniejacych ta zmiana NIE rusza. Kody wystawione przed nia doczekaja
   swoich pietnastu minut i wygasna same; przepisywanie im `expires_at` w dol
   uniewaznialoby kody, ktore ktos wlasnie ma otwarte w skrzynce.
   --------------------------------------------------------------------------- */

alter table public.verification_codes
  alter column expires_at set default now() + interval '10 minutes';

comment on column public.verification_codes.expires_at is
  'Dziesiec minut. Worker ustawia te wartosc jawnie (CODE_TTL_MINUTES); ten domysl jest
   siatka na wstawki, ktore poszlyby z pominieciem Workera.';
