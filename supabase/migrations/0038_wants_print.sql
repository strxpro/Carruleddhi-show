/* ---------------------------------------------------------------------------
   „Wydrukujcie formularz za mnie" — jedna kolumna, jedno pytanie.
   ---------------------------------------------------------------------------
   Zawodnik dostaje formularz mailem jako PDF i ma go przyniesc wydrukowany
   i podpisany. Czesc ludzi nie ma drukarki i przychodzi z telefonem — a wtedy
   organizator i tak drukuje im formularz na miejscu, tyle ze dowiaduje sie
   o tym przy stole rejestracyjnym, w kolejce, w dniu zawodow.

   Ta kolumna przenosi to pytanie z dnia zawodow na moment zapisu: suwak nad
   przyciskiem wyslania, a w panelu widac z gory, ile kartek przygotowac.

   DLACZEGO `boolean not null default false`, A NIE `null` DLA „NIE WIEM"
     Trzeci stan nie ma tu znaczenia. Kto nie zaznaczyl, ten drukuje sam — bo
     tak dziala ta impreza od poczatku i tak mowi formularz. `null` znaczylby
     „nie zapytalismy", a zapytamy kazdego, wiec ten stan nie powstanie.

     Zgloszenia sprzed tej migracji dostaja `false` i to jest prawda o nich:
     nikt ich nie pytal, wiec nikt im nie obiecal wydruku.

   DLACZEGO NIE W `site_settings` ANI W OSOBNEJ TABELI
     To jest cecha jednego zgloszenia, tak samo jak kategoria czy numer startowy,
     i czyta sie ja zawsze razem z nim — w panelu, w liscie do druku i w mailu.
     Osobna tabela znaczylaby zlaczenie przy kazdym z tych trzech odczytow po to,
     zeby przeniesc jeden bit.
   --------------------------------------------------------------------------- */

alter table public.registrations
  add column if not exists wants_print boolean not null default false;

comment on column public.registrations.wants_print is
  'Czy zawodnik prosi, zeby organizator wydrukowal jego formularz. Ustawiane suwakiem przy zapisie, zmienialne przez czat po weryfikacji adresu.';

/* Indeks czesciowy, bo pytanie brzmi zawsze „komu wydrukowac", nigdy „komu nie".
   Przy trzydziestu zgloszeniach nie ma to znaczenia dla szybkosci i nie o to chodzi:
   chodzi o to, ze lista do druku jest osobnym, powtarzalnym odczytem, a nie
   przegladaniem calej tabeli w poszukiwaniu kilku wierszy. */
create index if not exists registrations_wants_print_idx
  on public.registrations (created_at)
  where wants_print;
