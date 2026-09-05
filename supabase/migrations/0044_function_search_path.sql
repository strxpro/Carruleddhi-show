/* ---------------------------------------------------------------------------
   Dwie funkcje wyzwalaczy dostaja przypiety `search_path`.
   ---------------------------------------------------------------------------
   Zgloszone przez linter bazy jako `function_search_path_mutable` (ostrzezenie).

   NA CZYM POLEGA RYZYKO
     Funkcja bez ustawionego `search_path` rozwiazuje nazwy wedlug tego, co akurat ma w
     sciezce rola, ktora ja wywolala. Ktos, kto moze zalozyc wlasny schemat wczesniej w
     sciezce, moze podstawic wlasne `lower()` czy `btrim()` i wykonac swoj kod w wyzwalaczu.
     W tym projekcie do bazy wchodzi tylko Worker kluczem service_role, wiec droga jest
     waska — ale to jest jednowierszowa poprawka, a nie kompromis, wiec nie ma powodu
     zostawiac jej otwartej.

   `pg_catalog, public` — to samo, co domyslnie, tylko przypiete na stale i niezalezne od
   wywolujacego. Tresc obu funkcji bez zmian, przepisana jeden do jednego.
   --------------------------------------------------------------------------- */

create or replace function public.site_settings_touch()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

create or replace function public.registrations_normalise_email()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  new.email := lower(btrim(new.email));
  if new.guardian_email is not null then
    new.guardian_email := lower(btrim(new.guardian_email));
  end if;
  return new;
end;
$function$;
