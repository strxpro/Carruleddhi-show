/* ============================================================================
   0032 — kod potwierdzający adres w zgłoszeniu sponsora.

   PO CO
     Zgłoszenie sponsora do tej pory nie sprawdzało adresu wcale: gość podawał nazwę
     carruleddhi i kontakt, a organizatorzy dostawali powiadomienie z danymi, których nikt
     nie potwierdził. Literówka w adresie znaczyła zgłoszenie, na które nie da się
     odpowiedzieć, a cudzy adres — zgłoszenie w imieniu kogoś, kto o niczym nie wie.

     Od teraz zgłoszenie przechodzi przez tę samą bramkę co wypisanie z powiadomień,
     zmiana danych i rezygnacja: kod na skrzynkę, kod z powrotem w rozmowie. Bramka
     zapisuje wiersz w `verification_codes`, a `purpose` musi wtedy nieść wartość opisującą
     tę sprawę — kod wystawiony na jedno nie działa na drugie i to jest cała jego wartość.

   DLACZEGO `entry_id` ZOSTAJE `null` DLA CELU `sponsor`
     `entry_id` (0021) wskazuje zawodnika, którego dotyczy kod, i istnieje dlatego, że przy
     wspólnym adresie w rodzinie samo `email` + `purpose` nie mówi, o czyje zgłoszenie
     chodzi. Sponsor nie ma zgłoszenia: nie startuje, nie ma wiersza w `registrations`,
     a `entry_id` to klucz obcy do tej tabeli z `on delete cascade`. Wstawienie tam
     czegokolwiek wymagałoby wymyślenia zawodnika-atrapy, który potem trafiłby na listę
     startową albo zniknął razem z kodem przy pierwszym porządkowaniu.

     `null` jest tu więc informacją, a nie brakiem danych: ten kod nie należy do żadnego
     zgłoszenia, dowodzi tylko dostępu do skrzynki. Tak samo działa `unsubscribe` od 0021.
     Para (`email`, `purpose`) wystarcza do wyszukania kodu sponsora, bo jedna osoba zgłasza
     jedną firmę naraz, a niezużyte kody wygasają w kwadrans.

   CO SIĘ NIE ZMIENIA
     Żadnej tabeli na dane sponsorów nie ma i nie będzie. Jedynym śladem zgłoszenia w bazie
     jest ten wygasający wiersz z kodem; sama treść zgłoszenia żyje w skrzynce
     i na WhatsAppie ludzi, którzy na nie odpowiadają.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

do $$
begin
  /* `check` nie da się zmienić w miejscu — trzeba go zdjąć i założyć nowy. Nazwa jest
     wyszukiwana w katalogu, a nie wpisana z pamięci: migracja, która zgaduje nazwę
     ograniczenia, wywala się na cudzej instalacji, gdzie Postgres nadał inną. */
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.verification_codes'::regclass
       and conname = 'verification_codes_purpose_check'
  ) then
    alter table public.verification_codes
      drop constraint verification_codes_purpose_check;
  end if;

  /* `manage-entry` zostaje jako wartość historyczna z 0016 — patrz 0018. Nowe kody
     jej nie używają, ale wiersz z nią może jeszcze leżeć niezużyty. */
  alter table public.verification_codes
    add constraint verification_codes_purpose_check
    check (purpose in ('unsubscribe', 'manage-entry', 'edit-entry', 'cancel-entry', 'sponsor'));
end;
$$;

comment on column public.verification_codes.purpose is
  'unsubscribe = wylaczenie powiadomien, edit-entry = poprawienie danych zgloszenia, '
  'cancel-entry = wycofanie ze wyscigu, sponsor = potwierdzenie adresu w zgloszeniu sponsora '
  '(entry_id zostaje NULL, bo sponsor nie ma zgloszenia w registrations). '
  'Kod wystawiony na jedno nie dziala na drugie. '
  'manage-entry to wartosc historyczna z 0016, nowe kody jej nie uzywaja.';

comment on column public.verification_codes.entry_id is
  'Zawodnik, ktorego dotyczy kod edit-entry/cancel-entry. NULL dla kodow niezwiazanych '
  'ze zgloszeniem: unsubscribe oraz sponsor.';
