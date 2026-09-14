-- Formularz pyta o miejscowosc zamiast o CAP (kod pocztowy).
--
-- `postal_code` zostaje jako kolumna archiwalna: stare zgloszenia maja tam wartosc, a worker
-- sprzed wdrozenia pisze do niej az do chwili, gdy Vercel podmieni kod. Dlatego kolumna
-- `town` jest dodawana PRZED wdrozeniem kodu, ktory z niej korzysta.

alter table public.registrations
  add column if not exists town text
    check (town is null or char_length(town) <= 80);

-- Stare zgloszenia nie maja miejscowosci; nie zgadujemy jej z kodu pocztowego.

-- `create or replace view` pozwala tylko dopisac kolumne na koncu (inaczej 42P16).
create or replace view public.registrations_with_group as
  select
    id, created_at, race_number, first_name, last_name, birth_date, postal_code,
    email, phone, address, cart_name, category, team_name, cart_notes, locale,
    rules_consent, privacy_consent, news_consent, status, email_status, printed_at,
    is_minor, rider_age, child_kind, guardian_relation, guardian_name, guardian_email,
    guardian_phone, mother_name, father_name, guardian_consent, self_updated_at,
    count(*) over (partition by lower(btrim(email))) as email_group_size,
    wants_print,
    town
  from public.registrations r;
