/* ============================================================================
   0019 — „organizator pisze…" widoczne u gościa.

   PO CO
     Gość widzi trzy kropki, kiedy odpowiada automat — bo tam czekanie trwa sekundę i strona
     wie, że sama je wywołała. Kiedy odpowiada człowiek, nie widzi nic: pytanie zostało
     przekazane, ktoś siedzi w panelu i pisze trzy zdania, a po drugiej stronie jest cisza.
     Właśnie wtedy sygnał jest najbardziej potrzebny, bo właśnie wtedy pauza jest najdłuższa.

   DLACZEGO ZNACZNIK CZASU, A NIE FLAGA BOOLEAN
     Flaga wymaga, żeby ktoś ją zgasił. Organizator, który zacznie pisać i zamknie kartę,
     zostawiłby „pisze…" na zawsze — a to gorsze niż brak sygnału, bo obiecuje odpowiedź,
     która nie przyjdzie. Znacznik czasu gaśnie sam: strona pokazuje kropki tylko wtedy, gdy
     jest młodszy niż kilka sekund, więc przy zamkniętej karcie sygnał wygasa bez niczyjego
     udziału.

     Ta sama zasada, co przy numerach startowych i przy małych literach w adresach: stan,
     który wymaga sprzątania, to stan, który kiedyś nie zostanie posprzątany.

   CZEGO TU NIE MA
     Nie ma sygnału w drugą stronę — czyli „gość pisze…" w panelu. Byłoby symetryczne i
     kosztowałoby drugą kolumnę plus zapytanie przy każdym naciśnięciu klawisza od strony,
     która nie jest zalogowana. Organizator widzi wiadomość, kiedy przyjdzie; gość czeka i
     to on potrzebuje wiedzieć, że coś się dzieje.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

alter table public.chat_threads
  add column if not exists admin_typing_at timestamptz;

comment on column public.chat_threads.admin_typing_at is
  'Kiedy organizator ostatni raz pisal w tym watku. Strona pokazuje „pisze…" tylko gdy to '
  'mlodsze niz kilka sekund, wiec sygnal gasnie sam po zamknieciu panelu — bez flagi, ktora '
  'trzeba pamietac zgasic.';
