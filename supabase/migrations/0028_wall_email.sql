/* ============================================================================
   0028 — opcjonalny e-mail przy komentarzu na tablicy

   CO SIĘ ZMIENIA
     `wall_comments` dostaje kolumnę `email`. Formularz na stronie ma nowe, nieobowiązkowe
     pole; kto je wypełni, tego organizator może zapytać o szczegóły albo odpisać.

   DLACZEGO KOLUMNA NIE WCHODZI DO WIDOKU PUBLICZNEGO
     `wall_comments_public` (0001) wymienia kolumny po nazwie: `id, created_at,
     display_name, place, message, locale`. Nie ruszam go i nie muszę — nowa kolumna po
     prostu się w nim nie znajdzie. To jest właściwość, nie przypadek: gdyby widok był
     `select *`, dodanie tej kolumny opublikowałoby adresy wszystkich, którzy je zostawili,
     bez ani jednej zmiany w kodzie.

     Ta sama zasada w Workerze: `wallList` i `wall-admin` wymieniają kolumny jawnie, więc
     adres nie wychodzi też przez API. Zapisuje go i czyta wyłącznie kluczem service role.

   DLACZEGO BEZ INDEKSU UNIKALNEGO
     Jedna osoba może napisać na tablicy kilka razy — i to jest normalne, w przeciwieństwie
     do zapisów na wyścig, gdzie unikalność adresu jest regułą (0002). Indeks unikalny
     odrzucałby tu drugi komentarz tej samej osoby.

   DLACZEGO WALIDACJA JEST W CHECK, A NIE TYLKO W KODZIE
     Wiersze wchodzą do tej tabeli także z SQL Editora i z importu. Warunek w bazie znaczy,
     że kolumna opisana jako „adres e-mail" naprawdę zawiera adresy — a nie puste napisy,
     które w kodzie wyglądają jak podany adres.

   POWTARZALNA W CAŁOŚCI
     `add column if not exists` i `drop constraint if exists`. Wolno wkleić drugi raz.
   ============================================================================ */

alter table public.wall_comments
  add column if not exists email text;

/* Pusty napis jest błędem, nie „brakiem adresu" — do tego drugiego jest NULL.
   Bez tego warunku w kolumnie siedziałyby obok siebie `null` i `''`, znaczące to samo i
   wymagające dwóch sprawdzeń w każdym zapytaniu, które kiedyś ich użyje. */
alter table public.wall_comments
  drop constraint if exists wall_comments_email_check;

alter table public.wall_comments
  add constraint wall_comments_email_check check (
    email is null
    or (char_length(email) between 3 and 120 and position('@' in email) > 1)
  );

comment on column public.wall_comments.email is
  'Opcjonalny adres podany przy komentarzu. NIGDY nie publikowany: nie ma go w widoku '
  'wall_comments_public ani w zapytaniach wallList/wall-admin w Workerze. Sluzy tylko do '
  'odpowiedzi organizatora na komentarz, ktory jest pytaniem.';

/* Kontrola: widok publiczny nadal nie może zwracać tej kolumny.
   Zapytanie nic nie zmienia — jest po to, żeby uruchomienie tej migracji od razu pokazało
   listę kolumn widoku. Jeśli kiedyś ktoś przepisze widok na `select *`, `email` pojawi się
   w wyniku i będzie to widać w tym samym oknie, w którym wklejono migrację. */
select string_agg(column_name, ', ' order by ordinal_position) as kolumny_widoku_publicznego
from information_schema.columns
where table_schema = 'public' and table_name = 'wall_comments_public';
