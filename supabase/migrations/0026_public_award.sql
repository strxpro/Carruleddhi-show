/* ===========================================================================
   0026 — jedna nagroda: Nagroda publicznosci.

   CO SIE ZMIENIA WZGLEDEM 0025
   ---------------------------------------------------------------------------
   0025 rozbilo glosowanie na dwanascie nagrod i pozwolilo oddac po jednym glosie w kazdej.
   Ta migracja wraca do jednej: publicznosc przyznaje JEDNA nagrode — swoja wlasna. Jeden glos
   na osobe i na urzadzenie, na caly konkurs.

   Dwanascie nagrod z sekcji „Dodici modi per vincere" zostaje na stronie glownej i zostaje
   nagrodami: rozstrzyga je jury i stoper. Publicznosc nie wybiera najszybszego, bo najszybszego
   pokazuje pomiar czasu.

   `votes.category` trzyma teraz jedna, stala wartosc `public-choice`, wpisywana przez Workera,
   a NIE przychodzaca z zadania. To przywraca wlasnosc, ktora 0025 musialo poswiecic: wartosc z
   przegladarki nie ma juz zadnego wplywu na to, w ktorej kategorii lezy glos. Dwa istniejace
   indeksy unikalne (votes_email_category_key, votes_device_category_key) daja wtedy dokladnie
   regule „jeden glos na adres i jeden na urzadzenie".

   WIDOKI
   ---------------------------------------------------------------------------
   `voting_ranking` wraca do grupowania po uczestniku, bo nie ma juz po czym dzielic. Ma jednak
   WARUNEK na kategorie glosu — i to nie jest ozdoba: bez niego do rankingu weszlyby stare
   wiersze z `classic`, `art` i `prize-N`, czyli glosy z prob sprzed tych migracji.

   `voting_totals` z 0025 zostaje usuniety. Przy jednej nagrodzie to byl ten sam widok pod dwiema
   nazwami, a dwa zrodla tej samej sredniej to jedno za duzo.

   POWTARZALNA W CALOSCI. `drop view if exists` przed kazdym widokiem, `create index if not
   exists`, uprawnienia idempotentne. Supabase wykonuje skrypt z edytora w jednej transakcji,
   wiec blad w polowie wycofuje takze to, co bylo wyzej.

   MOZNA WYKONAC BEZ 0025. Nic tu nie zaklada, ze poprzednia migracja poszla — `drop view if
   exists voting_totals` przechodzi takze wtedy, gdy tego widoku nigdy nie bylo.

   STARE GLOSY
   ---------------------------------------------------------------------------
   Nie sa usuwane; ta migracja nie kasuje danych. Warunek w widoku sprawia, ze nie licza sie do
   wyniku. Jesli chcesz je skasowac, zrob to swiadomie i recznie:

     delete from public.votes where category <> 'public-choice';
   =========================================================================== */

comment on column public.votes.category is
  'Zawsze ''public-choice''. Wpisywane przez Workera, nigdy z zadania. Para (adres, kategoria) i (urzadzenie, kategoria) sa unikalne, wiec to jest regula "jeden glos na osobe".';

/* Indeks pod warunek z widoku. Bez niego kazdy odczyt rankingu to przejscie po calej tabeli
   glosow — przy jednej kategorii nie boli, ale planista i tak wybierze indeks, a przy paru
   tysiacach glosow z jednego dnia to roznica miedzy odczytem a skanem. */
create index if not exists votes_public_choice_idx
  on public.votes (participant_id, score desc)
  where category = 'public-choice';

drop view if exists public.voting_totals;

drop view if exists public.voting_ranking;
create view public.voting_ranking
with (security_invoker = true) as
select
  p.id            as participant_id,
  p.category,
  p.start_number,
  p.first_name,
  p.last_name,
  p.project_name,
  p.image_path,
  count(v.id)::bigint                 as vote_count,
  round(avg(v.score)::numeric, 2)     as average_score,
  coalesce(sum(v.score), 0)::bigint   as total_score
from public.participants p
join public.votes v
  on v.participant_id = p.id
 and v.category = 'public-choice'
where p.active
group by p.id, p.category, p.start_number, p.first_name, p.last_name,
         p.project_name, p.image_path;

comment on view public.voting_ranking is
  'Nagroda publicznosci: agregaty na uczestnika, bez tozsamosci glosujacych.';

revoke all on public.voting_ranking from anon, authenticated;
grant select on public.voting_ranking to service_role;
