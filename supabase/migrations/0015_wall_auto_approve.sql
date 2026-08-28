/* ============================================================================
   0015 — komentarze pojawiają się od razu, moderacja jest po fakcie.

   CO SIĘ ZMIENIA
     Do tej pory wpis czekał na zatwierdzenie: `approved` miało default `false`, publiczny
     widok pokazywał tylko zatwierdzone, a gość widział „wiadomość pojawi się po
     sprawdzeniu". Teraz jest odwrotnie — wpis jest widoczny natychmiast, a organizator
     kasuje albo ukrywa to, czego nie chce.

   DLACZEGO — i jaka jest cena
     Tablica na ~50 osób z jednym organizatorem oznacza, że kolejka do zatwierdzenia jest
     pusta przez tydzień, a potem ktoś zostawia miły komentarz i nie widzi go wcale. Dla
     piszącego to wygląda na zepsuty formularz, nie na moderację.

     Cena jest realna i trzeba ją nazwać: **spam i obelgi są widoczne, dopóki ktoś ich nie
     usunie.** To jest świadomy wybór na rzecz tego, żeby tablica żyła. Trzy rzeczy ją
     ograniczają i wszystkie już są: limit trzech wpisów na 15 minut z jednego adresu IP
     (WALL_POST_MAX w worker/index.js), Turnstile na wejściu, i kasowanie jednym
     kliknięciem w panelu razem ze zdjęciem z bucketa.

     Jeśli kiedyś przyjdzie fala spamu, powrót to jedna linia: `alter column approved set
     default false` i zdjęcie `approved: true` z wallPost.

   ISTNIEJĄCE WIERSZE
     Wszystko, co czeka w kolejce, zostaje zatwierdzone. Te wpisy zostały napisane w dobrej
     wierze i leżą niewidoczne tylko dlatego, że nikt nie kliknął — a nie dlatego, że ktoś
     zdecydował, że nie mają się pokazać. Rozróżnienia „odrzucone" nie ma w schemacie
     (`hidden_reason` jest opisem, nie stanem), więc nie ma czego zachowywać.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

alter table public.wall_comments
  alter column approved set default true;

/* Kolejka do zatwierdzenia przestaje istnieć — wszystko, co w niej stało, wchodzi na
   tablicę. `approved_at` dostaje czas tej migracji, bo prawdziwego momentu decyzji nie ma:
   nikt jej nie podjął. */
update public.wall_comments
   set approved = true,
       approved_at = coalesce(approved_at, now())
 where approved = false
   and hidden_reason is null;

comment on column public.wall_comments.approved is
  'Widoczny publicznie. Od 0015 default to true: wpis pojawia sie od razu, a organizator '
  'kasuje albo ukrywa po fakcie. Ograniczaja to limit 3 wpisow na 15 minut z jednego IP '
  'i Turnstile.';

/* Indeks częściowy `where approved` był policzony pod założeniem, że zatwierdzone są
   mniejszością. Teraz są prawie wszystkim, więc warunek nic nie odsiewa i tylko zaciemnia,
   co ten indeks robi. Zwykły indeks po czasie jest tym, czego widok publiczny naprawdę
   potrzebuje: „ostatnie N, od najnowszego".

   Drugi, częściowy indeks na ukrytych — bo od teraz TO one są mniejszością, i to ich szuka
   panel, gdy filtruje listę. */
drop index if exists public.wall_comments_public_idx;

create index if not exists wall_comments_recent_idx
  on public.wall_comments (created_at desc);

create index if not exists wall_comments_hidden_idx
  on public.wall_comments (created_at desc)
  where not approved;
