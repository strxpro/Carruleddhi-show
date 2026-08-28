/* ============================================================================
   0017 — adresy w registrations zapisane małymi literami.

   OBJAW
     „Wpisuję adres, który już jest w bazie, klikam Dalej i nic się nie dzieje" — formularz
     przechodzi do kroku 2, a duplikat wychodzi dopiero na końcu, starym komunikatem.

   PRZYCZYNA
     Unikalny indeks jest na `lower(email)`:

         create unique index registrations_email_key on registrations (lower(email))

     więc `Marco@X.com` i `marco@x.com` to dla bazy jeden zawodnik i drugi zapis się odbija.
     Ale odbija się dopiero przy INSERT. Odczyt to zwykłe porównanie:

         GET /registrations?email=eq.marco@x.com

     i ono jest wrażliwe na wielkość liter. Wiersz zapisany jako `Marco@X.com` nie zostaje
     znaleziony, entry-lookup odpowiada „nie ma takiego", formularz idzie dalej — i człowiek
     dostaje 409 trzy kroki później, dokładnie tak jak przed dodaniem całego rozpoznawania.

     Dwie różne reguły dla tego samego pytania „czy ten adres już jest": funkcja przy zapisie
     i porównanie przy odczycie. Dopóki obie odpowiadały tak samo, nic nie było widać.

   DLACZEGO NORMALIZACJA, A NIE `ilike` W ZAPYTANIU
     `ilike` bez wildcardów działa jak porównanie bez uwzględniania wielkości liter i
     wyglądało na jednolinijkową naprawę. Jest gorsze z dwóch powodów. `_` jest w `ilike`
     znakiem „dowolny jeden znak", a w adresach e-mail jest legalny i pospolity — więc
     `jan_kowalski@x.pl` dopasowałby też `janXkowalski@x.pl`, czyli zapytanie o cudze
     zgłoszenie. Escapowanie tego przez PostgREST jest możliwe i jest dokładnie tym rodzajem
     kodu, który nikt nie sprawdzi ponownie. Drugie: `ilike` nie użyłby indeksu.

     Kolumna zapisana raz w jednej postaci znosi problem u źródła i nic nie kosztuje przy
     każdym odczycie. Worker już od dawna zapisuje `String(email).toLowerCase()`, więc to
     porządek po wierszach starszych niż ta zasada — i zabezpieczenie na wypadek wiersza
     wklejonego ręcznie w Table Editorze.

   ZAKRES
     `registrations.email` i `registrations.guardian_email`. Migracja 0010 zrobiła to samo dla
     `reminder_subscribers` i `newsletter_subscribers`, ale registrations wtedy pominęła — tam
     nie było upsertu, więc nie było objawu.

   BEZPIECZEŃSTWO
     `where email <> lower(email)` — nie dotyka wierszy, które już są poprawne, więc
     powtórne uruchomienie nie zmienia niczego i nie odświeża updated_at, którego ta tabela
     nawet nie ma.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

update public.registrations
   set email = lower(btrim(email))
 where email <> lower(btrim(email));

update public.registrations
   set guardian_email = lower(btrim(guardian_email))
 where guardian_email is not null
   and guardian_email <> lower(btrim(guardian_email));

/* Asercja, nie nadzieja. Gdyby powyższe zostawiło choć jeden wiersz w mieszanej postaci —
   bo dopisał się w trakcie, albo bo btrim odsłonił coś dziwnego — lepiej zatrzymać wdrożenie
   niż wypuścić bazę, w której odczyt i zapis odpowiadają na to samo pytanie inaczej. */
do $$
declare
  odd integer;
begin
  select count(*) into odd
    from public.registrations
   where email <> lower(btrim(email));

  if odd > 0 then
    raise exception
      '% wierszy w registrations nadal ma adres w mieszanej postaci — entry-lookup ich nie znajdzie',
      odd;
  end if;
end;
$$;

comment on column public.registrations.email is
  'Zawsze małymi literami, bez spacji na brzegach (0017). Unikalny indeks jest na '
  'lower(email), a odczyty porownuja doslownie — jedna postac w kolumnie sprawia, ze zapis '
  'i odczyt odpowiadaja tak samo na pytanie „czy ten adres juz jest".';

/* ---------------------------------------------------------------------------
   I żeby nie wróciło.

   Jednorazowe posprzątanie naprawia dzisiejsze wiersze i nic nie mówi o jutrzejszych.
   Adres wchodzi do tej tabeli trzema drogami: przez funkcję na Vercelu (ta już robi
   toLowerCase), przez panel admina, i przez wklejenie ręką w Table Editorze Supabase.
   Ostatnia jest tą, przy której nikt nie pamięta o wielkości liter — i tą, przy której
   objaw wróci w postaci „ale ten adres NA PEWNO jest w bazie".

   Ta sama zasada co przy zwalnianiu numeru startowego w 0011: reguła w bazie obowiązuje na
   wszystkich trzech drogach, reguła w aplikacji obowiązuje na jednej i wygląda jakby na
   trzech.
   --------------------------------------------------------------------------- */
create or replace function public.registrations_normalise_email()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(btrim(new.email));
  if new.guardian_email is not null then
    new.guardian_email := lower(btrim(new.guardian_email));
  end if;
  return new;
end;
$$;

drop trigger if exists registrations_email_lower on public.registrations;
create trigger registrations_email_lower
  before insert or update of email, guardian_email on public.registrations
  for each row execute function public.registrations_normalise_email();

comment on function public.registrations_normalise_email() is
  'Sprowadza adresy do malych liter przy kazdym zapisie, niezaleznie od drogi: API, panel, '
  'reczna edycja w Table Editorze.';
