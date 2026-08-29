/* ===========================================================================
   0025 — dwanascie nagrod jako kategorie glosowania.

   CO SIE ZMIENIA W ZNACZENIU DANYCH
   ---------------------------------------------------------------------------
   `votes.category` do tej pory przechowywalo kategorie UCZESTNIKA (`classic` / `art`) i
   bralo sie z wiersza uczestnika, nie z zadania. Od tej migracji przechowuje klucz NAGRODY
   (`prize-1` … `prize-12`) i jest wyborem glosujacego.

   To nie jest kosmetyka, wiec warto zapisac, dlaczego kolumna zostaje ta sama:

     — dwa indeksy unikalne (`votes_email_category_key`, `votes_device_category_key`) daja
       wtedy dokladnie regule „jeden glos na nagrode na adres i na urzadzenie", bez ani jednej
       nowej linii. Przy dodaniu osobnej kolumny `award` trzeba by je przelozyc i pilnowac,
       zeby stara para nie blokowala dwunastu glosow tej samej osoby;
     — nazwa kolumny jest wewnetrzna, czyta ja tylko Worker.

   Zmiana bezpieczenstwa, ktora z tego wynika: skoro nagrode wybiera glosujacy, to przychodzi
   ona z zadania — i Worker MUSI sprawdzic ja wzgledem zamknietej listy dwunastu (VOTE_AWARDS
   w worker/index.js). Bez tego dowolny napis stalby sie trzynasta nagroda.

   WIDOK RANKINGU BYL ZLY OD TEJ CHWILI I DLATEGO JEST PRZEPISANY
   ---------------------------------------------------------------------------
   Stary `voting_ranking` laczyl glosy z uczestnikami warunkiem `v.category = p.category`.
   Przy nagrodach ten warunek nie jest juz nigdy prawdziwy (`prize-3` nie rowna sie
   `classic`), wiec widok zwracalby ZERO WIERSZY — czyli ranking pusty, bez zadnego bledu.
   Rozdzielony na dwa, bo sa to dwa rozne pytania:

     voting_ranking — kto wygral KTORA nagrode (grupowane po uczestniku i nagrodzie);
     voting_totals  — jak wypadl uczestnik w calym glosowaniu (grupowane po uczestniku).

   POWTARZALNA W CALOSCI, tak jak 0022: `drop view if exists` przed kazdym widokiem, `create
   index if not exists`, uprawnienia i tak sa idempotentne. Supabase wykonuje skrypt z
   edytora w jednej transakcji, wiec blad w polowie wycofuje takze to, co bylo wyzej.

   STARE GLOSY
   ---------------------------------------------------------------------------   
   Wiersze zapisane przed ta migracja maja w `category` wartosc `classic` albo `art`. NIE sa
   usuwane — ta migracja nie kasuje danych. Front rysuje wylacznie dwanascie znanych nagrod,
   wiec takie wiersze po prostu nie maja gdzie sie pokazac. Jesli chcesz je skasowac, zrob to
   swiadomie i recznie:

     delete from public.votes where category not like 'prize-%';
   =========================================================================== */

/* Zakres dlugosci zostaje (1–40 znakow, `prize-12` ma osiem), ale dopisany jest komentarz,
   zeby nastepna osoba czytajaca tabele nie szukala kategorii uczestnika. */
comment on column public.votes.category is
  'Klucz nagrody (prize-1 … prize-12) wybrany przez glosujacego. Sprawdzany w Workerze wzgledem VOTE_AWARDS.';

drop view if exists public.voting_ranking;
create view public.voting_ranking
with (security_invoker = true) as
select
  p.id            as participant_id,
  v.category      as award,
  p.category      as participant_category,
  p.start_number,
  p.first_name,
  p.last_name,
  p.project_name,
  p.image_path,
  count(v.id)::bigint                 as vote_count,
  round(avg(v.score)::numeric, 2)     as average_score,
  coalesce(sum(v.score), 0)::bigint   as total_score
from public.participants p
join public.votes v on v.participant_id = p.id
where p.active
group by p.id, v.category, p.category, p.start_number, p.first_name, p.last_name,
         p.project_name, p.image_path;

/* Suma po calym glosowaniu, bez podzialu na nagrody.
   Osobny widok, a nie `sum()` po stronie Workera z rankingu: podium i listy do zwyciezcow
   licza sie ze SREDNIEJ, a sredniej z dwunastu srednich nie wolno liczyc jako sredniej
   arytmetycznej — nagroda z trzema glosami wazylaby tyle samo co nagroda z czterdziestoma.
   Tu avg() idzie po pojedynczych glosach, wiec waga jest prawdziwa. */
drop view if exists public.voting_totals;
create view public.voting_totals
with (security_invoker = true) as
select
  p.id            as participant_id,
  p.category      as participant_category,
  p.start_number,
  count(v.id)::bigint                 as vote_count,
  round(avg(v.score)::numeric, 2)     as average_score,
  coalesce(sum(v.score), 0)::bigint   as total_score,
  count(distinct v.category)::bigint   as award_count
from public.participants p
join public.votes v on v.participant_id = p.id
where p.active
group by p.id, p.category, p.start_number;

comment on view public.voting_ranking is 'Agregaty w podziale na nagrody, bez tozsamosci glosujacych.';
comment on view public.voting_totals is 'Agregaty na uczestnika w calym glosowaniu.';

revoke all on public.voting_ranking from anon, authenticated;
revoke all on public.voting_totals from anon, authenticated;
grant select on public.voting_ranking to service_role;
grant select on public.voting_totals to service_role;
