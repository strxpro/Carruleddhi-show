/* ============================================================================
   0011 — numery startowe: najniższy wolny, i zwalniany po rezygnacji.

   CO SIĘ ZMIENIA
     Do tej pory numer brał się z sekwencji: `nextval('race_number_seq')`. Sekwencja nie
     wie nic o wierszach — kiedy ktoś z numerem 005 rezygnował, piąte miejsce przepadało na
     zawsze, a lista startowa miała dziurę.

     Teraz numer to **najniższy nieużywany**. Zgłoszenia 001–010, rezygnuje 005, następna
     osoba dostaje 005. Kolejna dostaje 011. Dokładnie o to chodziło.

   JAK NUMER SIĘ ZWALNIA
     Rezygnacja to `status = 'withdrawn'`. Trigger zeruje wtedy `race_number` — czyli numer
     wraca do puli w tym samym momencie, w którym ktoś odpada.

     Zerowanie jest w triggerze, a nie w kodzie funkcji na Vercelu, celowo. Status da się
     zmienić na trzy sposoby: przez API, przez panel admina i ręcznie w edytorze tabel
     Supabase. Reguła w bazie działa we wszystkich trzech; reguła w aplikacji działa w
     jednym i wygląda jakby działała w trzech.

   WSPÓŁBIEŻNOŚĆ — dlaczego jest tu blokada
     Dwa zgłoszenia w tej samej sekundzie policzyłyby ten sam „najniższy wolny" numer i
     drugie odbiłoby się od unikalnego indeksu — 502 dla człowieka, który nie zrobił nic
     złego. `pg_advisory_xact_lock` serializuje samo przydzielanie; trwa mikrosekundy i
     zwalnia się z końcem transakcji.

     Sekwencja tego problemu nie miała, bo `nextval` jest atomowy. To jest realna cena tej
     zmiany i warto ją znać: przydzielanie numeru przestało być bezblokadowe.

   KOSZT
     `generate_series` po zakresie do `max(race_number) + 1` na każde wstawienie. Przy
     kilkuset zgłoszeniach to nic; przy dziesiątkach tysięcy trzeba by to przepisać na
     wyszukiwanie luki po posortowanym indeksie. Ta impreza ma trzycyfrową liczbę wózków.
   ========================================================================== */

/* ---------------------------------------------------------------------------
   Najniższy wolny numer.
   --------------------------------------------------------------------------- */
create or replace function public.claim_race_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  picked integer;
begin
  -- Serializuje wyłącznie przydzielanie numeru, nie całą tabelę.
  perform pg_advisory_xact_lock(hashtext('carruleddhi.race_number'));

  select min(candidate.n) into picked
    from generate_series(
           1,
           coalesce((select max(race_number) from public.registrations), 0) + 1
         ) as candidate(n)
   where not exists (
           select 1 from public.registrations r where r.race_number = candidate.n
         );

  -- generate_series zawsze zwraca co najmniej 1, więc `picked` nie może być NULL. Zapis
  -- na wszelki wypadek, bo NULL tutaj oznaczałby zgłoszenie bez numeru.
  return coalesce(picked, 1);
end;
$$;

comment on function public.claim_race_number() is
  'Najniższy nieużywany numer startowy. Zastępuje nextval(race_number_seq): numer po '
  'osobie, która zrezygnowała, wraca do puli zamiast przepadać.';

/* ---------------------------------------------------------------------------
   Trigger nadający numer przy wstawieniu.
   --------------------------------------------------------------------------- */
create or replace function public.assign_race_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /* Tylko gdy numer nie został podany.
     Import historycznych danych i ręczna poprawka w edytorze tabel mają móc wpisać
     konkretny numer — trigger, który nadpisuje podaną wartość, jest triggerem, który
     niszczy dane przy migracji. */
  if new.race_number is null then
    new.race_number := public.claim_race_number();
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_race_number on public.registrations;
create trigger registrations_race_number
  before insert on public.registrations
  for each row execute function public.assign_race_number();

/* ---------------------------------------------------------------------------
   Rezygnacja zwalnia numer.
   --------------------------------------------------------------------------- */
create or replace function public.release_race_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'withdrawn' and old.status <> 'withdrawn' then
    new.race_number := null;

  /* Powrót z rezygnacji dostaje numer od nowa, a nie ten sam.
     Wersja, w której stary numer jest zachowywany i przywracany, wygląda uprzejmiej i jest
     błędem: przez czas rezygnacji numer był w puli i mógł zostać komuś nadany. Wtedy
     przywrócenie oznacza dwie osoby z tym samym numerem albo odbicie od indeksu przy
     zwykłej edycji statusu. */
  elsif old.status = 'withdrawn' and new.status <> 'withdrawn' and new.race_number is null then
    new.race_number := public.claim_race_number();
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_release_number on public.registrations;
create trigger registrations_release_number
  before update of status on public.registrations
  for each row execute function public.release_race_number();

comment on function public.release_race_number() is
  'Zwalnia numer startowy, gdy status zmienia się na withdrawn, i nadaje nowy przy '
  'powrocie. W bazie, nie w aplikacji: status da się zmienić przez API, przez panel i '
  'ręcznie w edytorze tabel.';

/* ---------------------------------------------------------------------------
   Sekwencja i jej reset przestały mieć znaczenie.
   --------------------------------------------------------------------------- */
comment on sequence public.race_number_seq is
  'NIEUŻYWANA od migracji 0011. Numery przydziela claim_race_number(), która szuka '
  'najniższej wolnej wartości w tabeli. Sekwencja zostaje, żeby stare wdrożenie nie '
  'przestało działać w połowie aktualizacji; można ją usunąć, gdy 0011 jest wszędzie.';

/* Reset po wyczyszczeniu danych testowych nie musi już nic robić — pusta tabela sama z
   siebie daje numer 001 z claim_race_number(). Funkcja zostaje, bo panel admina ją woła,
   i mówi teraz prawdę o tym, co robi. */
create or replace function public.reset_race_numbers()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  remaining bigint;
begin
  select count(*) into remaining from public.registrations;

  if remaining > 0 then
    return format('refused: %s registrations still present', remaining);
  end if;

  -- Sekwencja jest nieużywana, ale zerowana dla porządku: gdyby ktoś kiedyś wrócił do
  -- nextval, nie zaczynałby od kilkuset.
  alter sequence public.race_number_seq restart with 1;
  return 'reset (numbering is lowest-free since 0011, so an empty table already starts at 1)';
end;
$$;

revoke all on function public.claim_race_number() from public, anon, authenticated;
revoke all on function public.release_race_number() from public, anon, authenticated;
revoke all on function public.reset_race_numbers() from public, anon, authenticated;
grant execute on function public.reset_race_numbers() to service_role;
