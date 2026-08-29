/* ===========================================================================
   0023 — data urodzenia wchodzi do tozsamosci zawodnika.

   Do tej pory duplikatem bylo `(adres, imie, nazwisko)` — indeks z 0020. To za waski
   klucz w miejscu, w ktorym ta strona dziala: we Wloszech dzieci dostaja imiona dziadkow,
   wiec dwoje kuzynow o identycznym imieniu i nazwisku w jednej rodzinie to normalna sytuacja,
   a nie przypadek brzegowy. Rodzina zapisujaca ich z jednej skrzynki dostawala 409 na drugim
   zgloszeniu i nie miala zadnego wyjscia — bo imienia ani nazwiska nie da sie "poprawic",
   gdy oba sa prawdziwe.

   Data urodzenia rozstrzyga to bez furtki dla realnego duplikatu: ten sam adres, to samo
   imie, to samo nazwisko I ta sama data urodzenia to jedna osoba, kropka. Rozne daty to dwie
   osoby, ktore wolno zapisac.

   coalesce, nie sama kolumna: `birth_date` jest nullable, a NULL w indeksie unikalnym nie
   jest rowny zadnemu NULL-owi. Bez tego dwa zgloszenia bez daty przestalyby byc duplikatem
   i indeks przepuscilby dokladnie to, co ma zatrzymywac.

   Miekkie ostrzezenie o duplikacie zyje we froncie (entry-lookup + panel „ta osoba jest juz
   zapisana"), i jest z rozmyslu bardziej czule niz ten indeks: ostrzega takze przy roznej
   dacie, bo tam kosztem pomylki jest jedno pytanie, a nie odrzucone zgloszenie.
   =========================================================================== */

create unique index if not exists registrations_person_key
  on public.registrations (
    lower(btrim(email)),
    lower(btrim(first_name)),
    lower(btrim(last_name)),
    coalesce(birth_date, date '1900-01-01')
  );

/* Zdejmowane po zalozeniu nowego — ta sama kolejnosc i ten sam powod co w 0020: odwrotna
   otwiera okno, w ktorym rownolegle zgloszenia nie maja zadnej ochrony przed duplikatem. */
drop index if exists public.registrations_email_person_key;

comment on index public.registrations_person_key is
  'Tozsamosc zawodnika: adres + imie + nazwisko + data urodzenia. Zastapil '
  'registrations_email_person_key (0020), ktory nie pozwalal zapisac dwoch kuzynow o tym '
  'samym imieniu i nazwisku z jednej skrzynki rodzinnej.';
