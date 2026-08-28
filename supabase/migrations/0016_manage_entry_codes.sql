/* ============================================================================
   0016 — kod pozwalający zawodnikowi zmienić albo wycofać własne zgłoszenie.

   PO CO
     Formularz odbija drugie zgłoszenie na ten sam adres (unikalny indeks na lower(email)),
     i słusznie. Ale człowiek, który już się zapisał i wpisuje ten adres, nie próbuje
     oszukać systemu — chce poprawić numer telefonu albo zrezygnować. Do tej pory dostawał
     komunikat „ten adres już jest" i koniec rozmowy.

     Teraz strona rozpoznaje adres jeszcze przed wysłaniem formularza i proponuje trzy
     wyjścia: inny adres, edycja, rezygnacja. Dwa ostatnie dotyczą cudzych danych, więc
     wymagają dowodu, że ten ktoś czyta tę skrzynkę.

   DLACZEGO JEDEN PURPOSE, A NIE DWA
     `cancel-entry` już był w tej tabeli, dopisany „na przyszłość". Kusi dodać obok
     `edit-entry` i mieć symetrię z akcjami. To byłby błąd: kod nie autoryzuje akcji, tylko
     dowodzi, że ktoś ma dostęp do skrzynki. Po wpisaniu kodu ta osoba jest właścicielem
     zgłoszenia i może z nim zrobić jedno i drugie — dwa osobne kody znaczyłyby dwa maile
     za tę samą jedną rzecz, której dowodzą.

     `manage-entry` obejmuje więc oba. `cancel-entry` zostaje w liście dozwolonych wartości,
     bo `check` na kolumnie z danymi to nie miejsce na porządki — usunięcie wartości, której
     nikt nie używa, nie daje nic, a wywróciłoby wiersz, gdyby jakiś jeszcze istniał.

   CO Z DANYMI, KTÓRE SĄ NA PODPISANYM FORMULARZU
     Nie da się ich zmienić tą drogą i to jest w kodzie funkcji, nie tutaj: imię, nazwisko
     i data urodzenia są wydrukowane na liberatorii, którą ktoś ma już w skrzynce i weźmie
     na start. Zmiana ich po cichu w bazie robi rozjazd między papierem a listą startową —
     czyli dokładnie ten rodzaj różnicy, którego nikt nie zauważy do dnia zawodów. Te trzy
     pola zmienia organizator z panelu, po rozmowie.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

do $$
begin
  /* `check` nie da się zmienić w miejscu — trzeba go zdjąć i założyć nowy. Nazwa
     ograniczenia jest tą, którą nadał Postgres przy `check (purpose in (...))` na kolumnie:
     <tabela>_<kolumna>_check. Wyszukane w katalogu, a nie założone, bo migracja, która
     zgaduje nazwę ograniczenia, wywala się na cudzej instalacji. */
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
    check (purpose in ('unsubscribe', 'cancel-entry', 'manage-entry'));
end;
$$;

comment on column public.verification_codes.purpose is
  'unsubscribe = wylaczenie powiadomien, manage-entry = zmiana albo wycofanie zgloszenia. '
  'cancel-entry zostaje jako wartosc historyczna, nic jej nie zapisuje.';

/* ---------------------------------------------------------------------------
   Slad po tym, kto sam zmienil swoje zgloszenie.

   Bez tego organizator patrzy na liste startowa i nie wie, czy telefon jest inny, bo
   zawodnik go poprawil, czy bo ktos sie pomylil przy wpisywaniu. Jedna kolumna z czasem
   ostatniej samodzielnej zmiany odpowiada na to pytanie i nie wymaga tabeli historii,
   ktorej przy pieciu zmianach na cala impreze nikt nie przeczyta.
   --------------------------------------------------------------------------- */
alter table public.registrations
  add column if not exists self_updated_at timestamptz;

comment on column public.registrations.self_updated_at is
  'Kiedy zawodnik ostatni raz sam zmienil swoje dane przez strone (kod na e-mail). '
  'NULL = nigdy, wszystko jest tak, jak przyszlo z formularza.';
