/* ============================================================================
   0018 — osobny kod do zmiany danych i osobny do rezygnacji.

   PO CO
     Do tej pory jeden kod (`manage-entry`) pozwalał na oba. Wyglądało to na uproszczenie i
     jest błędem, który widać dopiero, gdy się go opisze zdaniem:

       „Poproś o kod, żeby poprawić numer telefonu" i „poproś o kod, żeby wypaść z wyścigu"
       to dla człowieka dwie różne prośby, a dostawał jeden kod, który robił jedno i drugie.

     Kod wysłany po to, żeby poprawić adres, nie ma prawa wycofać nikogo z zawodów. Gdyby ktoś
     stanął nad ramieniem przy wpisywaniu kodu — albo gdyby ten sam kod poszedł do kogoś przez
     przekazanego maila — różnica między „zmienił mi się telefon" a „nie startuję" jest
     różnicą, której nie da się cofnąć z tej strony.

     Uzasadnienie z 0016 („kod nie autoryzuje akcji, tylko dowodzi dostępu do skrzynki") jest
     prawdziwe o dostępie i nieprawdziwe o skutkach. Dowód dostępu do skrzynki wystarcza, by
     poprawić literówkę. Wypadnięcie z listy startowej to rzecz, przy której warto zapłacić
     drugim mailem za pewność, że człowiek prosił dokładnie o to.

   CO SIĘ ZMIENIA
     `edit-entry`   kod do poprawiania danych kontaktowych i opisu wózka
     `cancel-entry` kod do wycofania zgłoszenia — wartość, która była w tabeli od 0009
                    „na przyszłość" i to jest ta przyszłość

     `manage-entry` zostaje na liście dozwolonych wartości, bo kody z tą wartością mogą jeszcze
     leżeć niezużyte w tabeli i wywalenie ich z `check` wywróciłoby wiersz przy pierwszym
     dotknięciu. Nowe już nie powstają; wygasną same w kwadrans, a purge_expired_codes()
     posprząta dzień później.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.verification_codes'::regclass
       and conname = 'verification_codes_purpose_check'
  ) then
    alter table public.verification_codes
      drop constraint verification_codes_purpose_check;
  end if;

  alter table public.verification_codes
    add constraint verification_codes_purpose_check
    check (purpose in ('unsubscribe', 'manage-entry', 'edit-entry', 'cancel-entry'));
end;
$$;

comment on column public.verification_codes.purpose is
  'unsubscribe = wylaczenie powiadomien, edit-entry = poprawienie danych zgloszenia, '
  'cancel-entry = wycofanie ze wyscigu. Kod wystawiony na jedno nie dziala na drugie. '
  'manage-entry to wartosc historyczna z 0016, nowe kody jej nie uzywaja.';
