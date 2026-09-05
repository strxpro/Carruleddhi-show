/* ---------------------------------------------------------------------------
   Widok zgloszen gubil `wants_print` — i wywracal cala zakladke.
   ---------------------------------------------------------------------------
   OBJAW
     „Zgloszenia" w panelu pokazywaly blad i „sprobuj ponownie". Nie dalo sie otworzyc
     listy zapisanych — ani jednego wiersza.

   PRZYCZYNA, ZNALEZIONA W LOGACH BAZY
     GET /rest/v1/registrations_with_group?select=...,wants_print,... -> 400, osiem razy
     pod rzad. Kolumna `wants_print` istnieje w TABELI `registrations`, ale widok
     `registrations_with_group` jej nie wybieral. PostgREST na prosbe o nieistniejaca
     kolumne odpowiada 400 i nie oddaje NICZEGO — nie brakowalo jednego pola, brakowalo
     calej listy.

     Widok powstal w 0020, zanim `wants_print` w ogole istnialo. Kolumne dodano pozniej do
     tabeli i do zapytania Workera, ale nikt nie przebudowal widoku. Taki rozjazd nie odzywa
     sie przy zapisie ani przy testach — odzywa sie dopiero wtedy, gdy ktos otworzy zakladke.

   POPRAWKA
     Widok odtworzony z `wants_print`. Reszta kolumn i okno `email_group_size` bez zmian —
     przepisane jeden do jednego z definicji, ktora byla w bazie, zeby ta migracja niczego
     poza brakujaca kolumna nie ruszyla.
   --------------------------------------------------------------------------- */

create or replace view public.registrations_with_group as
  select
    id, created_at, race_number, first_name, last_name, birth_date, postal_code,
    email, phone, address, cart_name, category, team_name, cart_notes, locale,
    rules_consent, privacy_consent, news_consent, status, email_status, printed_at,
    is_minor, rider_age, child_kind, guardian_relation, guardian_name, guardian_email,
    guardian_phone, mother_name, father_name, guardian_consent, self_updated_at,
    count(*) over (partition by lower(btrim(email))) as email_group_size,
    /* NA KONCU, NIE W SRODKU — i to nie jest kwestia gustu.
       `create or replace view` pozwala DOPISAC kolumny na koncu, ale nie pozwala wstawic
       ich w srodku: probowalby wtedy przemianowac istniejaca kolumne i odmawia bledem
       42P16. Wstawienie w srodku wymagaloby `drop view`, a widok moze miec zaleznosci.
       Dla zapytania kolejnosc kolumn nie znaczy nic, wiec taniej jest dopisac. */
    wants_print
  from public.registrations r;

comment on view public.registrations_with_group is
  'Zgloszenia z licznikiem osob na tym samym adresie e-mail. Kolumny musza nadazac za tym, o co prosi Worker — brak jednej daje 400 i pusta zakladke.';
