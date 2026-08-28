/* ============================================================================
   0012 — zdejmuje DEFAULT z race_number, żeby 0011 w ogóle zaczęła działać.

   CO BYŁO NIE TAK
     0011 obiecuje „najniższy wolny numer, zwalniany przy rezygnacji" i pisze do tego
     komplet: funkcję claim_race_number(), trigger assign_race_number() wołający ją,
     trigger release_race_number() zwalniający numer przy statusie 'withdrawn'.

     Nic z tego nigdy nie zadziałało, bo 0004 (linia 99) ustawiła na kolumnie

         alter column race_number set default nextval('public.race_number_seq')

     a DEFAULT jest wyliczany ZANIM odpali się trigger BEFORE INSERT. Kiedy klient nie
     podaje numeru — czyli zawsze, bo insertRow() go nie wysyła — Postgres najpierw
     wstawia nextval, a dopiero potem woła trigger. Trigger pyta `if new.race_number is
     null`, widzi liczbę i grzecznie nic nie robi.

     Efekt: claim_race_number() to martwy kod, numery rosną w nieskończoność, a luki po
     rezygnacjach nigdy się nie zapełniają. Zmierzone na produkcji 28.08.2026:

         insert bez kolumny      -> race_number = 65   (DEFAULT, nextval)
         insert z jawnym NULL    -> race_number = 1    (trigger, najniższy wolny)

     Ta sama transakcja, ta sama tabela, dwie różne odpowiedzi — cała różnica to
     to, czy DEFAULT miał okazję się odezwać.

   DLACZEGO NIKT TEGO NIE ZAUWAŻYŁ
     0011 zostawiła komentarz „Sekwencja jest nieużywana, ale zerowana dla porządku".
     To było przekonanie autora, nie sprawdzony fakt, i wyglądało jak domknięcie tematu.
     Z zewnątrz obie ścieżki dają poprawnie wyglądający trzycyfrowy numer — różnią się
     dopiero wtedy, gdy w tabeli są dziury, a dziury robią się po miesiącach.

   CO ROBI TA MIGRACJA
     Zdejmuje DEFAULT. Nic więcej nie trzeba: trigger z 0011 już stoi i od tej chwili
     dostaje NULL-a, na który czekał.

   CZEGO NIE ROBI
     Nie kasuje sekwencji. reset_race_numbers() nadal ją restartuje, a `drop sequence`
     wywróciłby tę funkcję. Kosztuje osiem bajtów i zostaje jako wyjście awaryjne.

     Nie przenumerowuje istniejących wierszy. Numer startowy jest wydrukowany na
     formularzu, który ludzie mają już w skrzynce — zmiana go po fakcie jest gorsza niż
     dziura w numeracji. Luki zapełnią się same, przy kolejnych zapisach.

   MOŻNA PUŚCIĆ PONOWNIE — `drop default` na kolumnie bez defaultu nie jest błędem.
   ========================================================================== */

alter table public.registrations
  alter column race_number drop default;

/* Asercja, a nie komentarz „powinno działać".

   Gdyby ktoś w przyszłości dopisał migrację przywracającą DEFAULT — a 0004 jest
   dokładnie takim przykładem — to zapytanie zatrzyma wdrożenie zamiast pozwolić
   numeracji po cichu wrócić do sekwencji. */
do $$
declare
  still_there text;
begin
  select column_default into still_there
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'registrations'
     and column_name  = 'race_number';

  if still_there is not null then
    raise exception
      'race_number nadal ma DEFAULT (%) — trigger assign_race_number() z 0011 nigdy nie odpali',
      still_there;
  end if;
end;
$$;
