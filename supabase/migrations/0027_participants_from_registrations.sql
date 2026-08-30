/* ============================================================================
   0027 — nowy uczestnik trafia do głosowania sam

   CO SIĘ ZMIENIA
     Zapisanie się na wyścig tworzy od razu wiersz w `participants`, czyli na liście, z
     której czyta strona głosowania. Wycofanie zgłoszenia zdejmuje go z niej. Poprawienie
     nazwy pojazdu albo kategorii aktualizuje kafelek.

   DLACZEGO TO BYŁO POTRZEBNE
     `registrations` i `participants` to dwie osobne tabele i nic ich nie łączyło poza
     nullowalnym `registration_id`, wpisywanym ręcznie w panelu. `votingState()` w workerze
     czyta WYŁĄCZNIE `participants` (patrz readParticipants), a formularz zapisu pisze
     WYŁĄCZNIE do `registrations`. Efekt: pięćdziesiąt zgłoszeń w bazie i puste głosowanie,
     dopóki organizator nie kliknie „dodaj z listy startowej" pięćdziesiąt razy.

   DLACZEGO TRIGGER, A NIE DRUGI INSERT W WORKERZE
     Trzy powody, w kolejności wagi.

     1. Wiersze wchodzą do `registrations` więcej niż jedną drogą: przez funkcję, przez
        SQL Editor, przez import. Trigger obsługuje wszystkie; drugi `insertRow()` w
        workerze obsługuje jedną.
     2. `race_number` nadaje trigger `registrations_race_number` (0002) BEFORE INSERT.
        Worker po `insertRow` ma go już nadanego, ale znaczyłoby to drugie żądanie do
        REST-a po wartość, którą baza zna w tej samej transakcji.
     3. Zmiana statusu na `withdrawn` dzieje się w `entryManage` PATCH-em i w panelu, czyli
        w dwóch miejscach. Trigger na UPDATE to jedno miejsce.

   CZEGO TRIGGER NIE RUSZA — I TO JEST CELOWE
     `image_path` i `active` należą do organizatora. Zdjęcie pojazdu nie przychodzi z
     formularza (nie ma tam pola pliku) i wgrywa się je w panelu; wiersz utworzony tutaj ma
     `image_path` puste, a strona pokazuje wtedy zastępnik z numerem startowym.

     `start_number` też nie jest aktualizowany po utworzeniu. Numery zwolnione przez
     rezygnację wracają do puli (0011) i mogą trafić do kogoś innego — przepisywanie ich
     tutaj mogłoby zderzyć się z indeksem unikalnym w środku cudzej edycji. Przenumerowanie
     jest czynnością organizatora i zostaje w panelu.

     Przy UPDATE nadpisywane są TYLKO imię, nazwisko, nazwa pojazdu i kategoria, i tylko
     gdy naprawdę zmieniły się w zgłoszeniu. Literówka poprawiona ręcznie w panelu przetrwa
     każdą kolejną edycję zgłoszenia, w której ta wartość się nie ruszyła.

   POWTARZALNA W CAŁOŚCI
     Same `create or replace`, `if not exists` i `drop … if exists`. Wolno wkleić drugi raz.
   ============================================================================ */

/* ---------------------------------------------------------------------------
   Jedno zgłoszenie to jeden uczestnik.

   Zakładany PRZED uzupełnieniem danych, żeby ewentualny duplikat w tym, co już jest w
   bazie, przerwał migrację przed zapisem czegokolwiek — a nie po. Częściowy, bo
   `registration_id` jest nullowalne z rozmysłu: w dniu zawodów pojawia się ktoś, kogo nie
   ma w liście startowej, i takich wierszy może być wiele.

   Poza porządkiem daje to gwarancję, na której opiera się trigger niżej: podwójne
   wywołanie nie może utworzyć dwóch kafelków tej samej osoby.
   --------------------------------------------------------------------------- */
create unique index if not exists participants_registration_key
  on public.participants (registration_id)
  where registration_id is not null;

/* ---------------------------------------------------------------------------
   Uzupełnienie tego, co już jest w bazie.

   Raz, przed założeniem triggera, żeby lista do głosowania od pierwszej chwili zgadzała
   się z listą startową — inaczej trigger obsłużyłby dopiero następnego zapisanego, a
   wszystkich wcześniejszych nadal nie byłoby widać.

   `on conflict (start_number) do nothing`, bo to kolumna z indeksem unikalnym: jeśli
   organizator już kogoś dodał ręcznie z tym numerem, jego wiersz jest właściwy — ma
   zdjęcie i ewentualne poprawki.
   --------------------------------------------------------------------------- */
insert into public.participants
  (registration_id, first_name, last_name, project_name, category, start_number)
select
  r.id,
  r.first_name,
  r.last_name,
  nullif(btrim(coalesce(r.cart_name, '')), ''),
  coalesce(nullif(btrim(coalesce(r.category, '')), ''), 'classic'),
  r.race_number
from public.registrations r
where r.status <> 'withdrawn'
  and r.race_number is not null
  and not exists (select 1 from public.participants p where p.registration_id = r.id)
on conflict (start_number) do nothing;

/* ---------------------------------------------------------------------------
   Trigger: zgłoszenie -> uczestnik.
   --------------------------------------------------------------------------- */
create or replace function public.sync_participant_from_registration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  wanted_category text;
  wanted_project  text;
begin
  /* Bez numeru startowego nie ma czego wstawić: `participants.start_number` jest NOT NULL
     i UNIQUE. W praktyce numer nadaje trigger z 0002 przed tym miejscem, więc ta gałąź
     dotyczy wiersza wstawionego ręcznie z jawnym `race_number = null`. Taki wiersz trafi
     tu ponownie, gdy numer zostanie mu nadany — `race_number` jest na liście kolumn
     wyzwalających UPDATE. */
  if new.race_number is null then
    return new;
  end if;

  wanted_category := coalesce(nullif(btrim(coalesce(new.category, '')), ''), 'classic');
  wanted_project  := nullif(btrim(coalesce(new.cart_name, '')), '');

  /* Rezygnacja: uczestnik schodzi z listy, ale wiersz zostaje.
     Usunięcie skasowałoby oddane na niego głosy (`votes.participant_id` ma FK), czyli
     zmieniłoby wynik konkursu przez rezygnację jednej osoby. `active = false` odsiewa
     readParticipants() i strona go nie widzi. */
  if new.status = 'withdrawn' then
    update public.participants
       set active = false,
           updated_at = now()
     where registration_id = new.id
       and active;
    return new;
  end if;

  /* `where` na końcu UPDATE jest istotne: bez niego każda edycja zgłoszenia — także zmiana
     samego telefonu — przepisywałaby imię i nazwisko ze zgłoszenia i cofała poprawkę
     wpisaną w panelu. */
  update public.participants
     set first_name   = new.first_name,
         last_name    = new.last_name,
         project_name = wanted_project,
         category     = wanted_category,
         active       = true,
         updated_at   = now()
   where registration_id = new.id
     and (
       first_name is distinct from new.first_name
       or last_name is distinct from new.last_name
       or project_name is distinct from wanted_project
       or category is distinct from wanted_category
       or not active
     );

  /* `not found` znaczy „UPDATE nic nie ruszył", a to są dwa różne przypadki: wiersza nie
     ma, albo jest i nic się w nim nie zmieniło. Drugie sprawdzenie je rozdziela. */
  if not found and not exists (
    select 1 from public.participants p where p.registration_id = new.id
  ) then
    /* `on conflict do nothing` na numerze startowym: wiersz dodany wcześniej ręcznie, bez
       wskazania zgłoszenia, ma ten numer i ma zdjęcie. Wygrywa. */
    insert into public.participants
      (registration_id, first_name, last_name, project_name, category, start_number)
    values
      (new.id, new.first_name, new.last_name, wanted_project, wanted_category, new.race_number)
    on conflict (start_number) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.sync_participant_from_registration() is
  'Trzyma public.participants w zgodzie z public.registrations: zapis tworzy uczestnika, rezygnacja go dezaktywuje. Nie rusza image_path ani start_number.';

/* AFTER, nie BEFORE: `race_number` nadaje trigger BEFORE INSERT z 0002, więc przed nim
   kolumna jest jeszcze pusta i nie byłoby czego wpisać w `start_number`.

   Lista kolumn przy UPDATE zamiast samego `after update`: edycja telefonu albo adresu nie
   ma powodu budzić tej funkcji, a zgłoszenia bywają poprawiane częściej niż zakładane. */
drop trigger if exists registrations_sync_participant on public.registrations;
create trigger registrations_sync_participant
  after insert or update of first_name, last_name, cart_name, category, status, race_number
  on public.registrations
  for each row execute function public.sync_participant_from_registration();

/* Wywołanie tej funkcji z zewnątrz nic nie znaczy — bez `NEW` nie jest triggerem — ale
   `security definer` bez odebrania prawa to zaproszenie, którego nie ma powodu wystawiać.
   Ta sama zasada co w 0021. */
revoke all on function public.sync_participant_from_registration() from public, anon, authenticated;
