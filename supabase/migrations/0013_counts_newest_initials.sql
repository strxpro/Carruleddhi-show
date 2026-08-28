/* ============================================================================
   0013 — rządek awatarów pokazuje CZTERY NAJNOWSZE osoby, nie cztery pierwsze.

   CO BYŁO NIE TAK
     Widok public_counts zbierał inicjały tak:

         order by created_at
         limit 5

     czyli pięć osób, które zapisały się NAJDAWNIEJ. Przy trzech zgłoszeniach nikt tego
     nie zauważy. Przy pięćdziesięciu rządek pokazuje wyłącznie pierwszą piątkę i nie
     zmienia się już nigdy — element, który ma mówić „ludzie się zapisują", zamarza po
     piątym zapisie i od tego momentu wygląda jak zaszyta na sztywno dekoracja.

   CO ROBI TA MIGRACJA
     `order by created_at desc limit 4` — cztery ostatnie zgłoszenia. Rządek zmienia się
     po każdym nowym zapisie, czyli robi to, po co tam jest.

   DLACZEGO CZTERY, A NIE PIĘĆ
     Tyle jest kółek w markupie po zmianie w index.html: cztery inicjały i piąte kółko
     z resztą („+46"). Widok oddający pięć, gdy strona rysuje cztery, to jeden inicjał
     wysyłany przez sieć i wyrzucany w przeglądarce — a przy inicjałach uczestników
     „wysłane i nieużywane" jest gorsze niż tylko marnotrawstwo.

   KOLEJNOŚĆ W TABLICY
     `desc` w podzapytaniu wybiera najnowsze, a `array_agg(... order by created_at desc)`
     układa je od najnowszego. Pierwsze kółko w rządku to więc osoba, która zapisała się
     ostatnia. Świadomie: to jedyna kolejność, przy której nowy zapis widać na pierwszej
     pozycji, a nie na czwartej.

     Bez `order by` w samym array_agg kolejność wewnątrz tablicy byłaby formalnie
     nieokreślona — Postgres nie obiecuje, że zachowa porządek z podzapytania.

   PRYWATNOŚĆ — bez zmian
     Nadal wychodzą dwie litery i dwie sumy. Widok dalej działa z prawami właściciela
     (`security_invoker = false`) i dalej jest jedyną rzeczą, którą przeglądarka może
     przeczytać. Zmieniła się kolejność i liczba, nie zakres.

   MOŻNA PUŚCIĆ PONOWNIE — `create or replace view`.
   ========================================================================== */

create or replace view public.public_counts
with (security_invoker = false) as
select
  (select count(*) from public.attendance) as attendees,
  (select count(*) from public.registrations where status <> 'withdrawn') as pilots,
  (
    select coalesce(
      array_agg(initials order by created_at desc),
      array[]::text[]
    )
    from (
      select
        upper(left(btrim(first_name), 1) || left(btrim(last_name), 1)) as initials,
        created_at
      from public.registrations
      where status <> 'withdrawn'
      order by created_at desc
      limit 4
    ) as newest_four
  ) as initials;

comment on view public.public_counts is
  'Jedyna rzecz, którą czyta publiczna strona: dwie sumy i inicjały czterech ostatnich '
  'zgłoszeń, od najnowszego. Od 0013 — wcześniej były cztery najdawniejsze, więc rządek '
  'awatarów zamarzał po piątym zapisie.';

-- Uprawnienia po `create or replace view` zostają, ale nadane ponownie nic nie kosztują
-- i sprawiają, że ta migracja jest kompletna sama w sobie.
grant select on public.public_counts to anon, authenticated;
