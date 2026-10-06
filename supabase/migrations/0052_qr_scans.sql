/* ============================================================================
   0052 — Skany kodu QR ze spotu telewizyjnego / Scansioni del QR dello spot TV
   ============================================================================
   PO CO
     Spot Festy Patronalej (TV, 15 s) ma w rogu kod QR. Prowadzi on na
     /api/carruleddhi/qr, który zapisuje jeden wiersz tutaj i NATYCHMIAST przekierowuje
     widza na post na Facebooku. Panel pokazuje potem w zakładce „Skany QR", ile osób
     zeskanowało kod, kiedy, skąd (kraj, region, miasto) i z jakiego urządzenia.

   CO TU NIE TRAFIA I DLACZEGO
     Ani adresu IP, ani user-agenta, ani ciasteczka, ani żadnego skrótu, który pozwalałby
     rozpoznać tę samą osobę dwa razy. Przekierowanie dzieje się w ułamku sekundy, bez
     strony pośredniej, więc nie ma miejsca na pytanie o zgodę — dlatego zapis jest
     z założenia anonimowy: kategorie (telefon/komputer, iOS/Android, kraj, miasto) i czas.
     Kraj i miasto podaje platforma (nagłówki x-vercel-ip-*), z własnego rozpoznania
     adresu; my tego adresu nie zapisujemy ani nikogo o niego nie pytamy.

     Konsekwencja, powiedziana wprost: liczymy SKANY, nie OSOBY. Ktoś, kto zeskanuje kod
     dwa razy, to dwa wiersze. Panel mówi to pod wykresem.

   CZEGO TA MIGRACJA NIE RUSZA
     Żadnej istniejącej tabeli ani funkcji. Tylko nowa tabela i nowa funkcja odczytu.
   ========================================================================== */

create table if not exists public.qr_scans (
  id bigserial primary key,
  at timestamptz not null default now(),
  /* Krótka etykieta z adresu (?c=tv, ?c=plakat …), żeby dało się odróżnić kod ze spotu
     od kodu z plakatu. Bez parametru: 'tv'. Serwer przepuszcza tylko [a-z0-9-], do 24 znaków. */
  campaign text not null default 'tv',
  /* Dwie litery (IT, PL, DE …) albo nic. */
  country text,
  /* Region/prowincja z nagłówka platformy (np. „SS" dla Sassari) — albo nic. */
  region text,
  /* Miasto z nagłówka platformy, już odkodowane. */
  city text,
  /* mobile | tablet | desktop — wyliczone z user-agenta, sam user-agent nie jest zapisywany. */
  device text not null default 'mobile',
  /* iOS | Android | Windows | macOS | Linux | inne */
  os text,
  /* Safari | Chrome | Samsung | Firefox | Facebook | Instagram | inne */
  browser text,
  /* Pierwszy język z Accept-Language, np. „it", „pl". */
  lang text
);

comment on table public.qr_scans is
  'Anonimowe skany kodu QR ze spotu TV. Bez IP, bez user-agenta, bez identyfikatorow.';

/* Panel pyta zawsze o „ostatnie N godzin", więc czas jest jedynym indeksem, którego trzeba. */
create index if not exists qr_scans_at_idx on public.qr_scans (at desc);

/* RLS: zapis i odczyt wyłącznie kluczem service_role (funkcja na Vercelu). Anon i
   authenticated nie mają tu nic do roboty — bez RLS tabela byłaby czytelna kluczem
   publicznym strony. */
alter table public.qr_scans enable row level security;
revoke all on public.qr_scans from anon, authenticated;
revoke all on sequence public.qr_scans_id_seq from anon, authenticated;

/* ============================================================================
   Cały ekran „Skany QR" jednym zapytaniem
   ============================================================================
   Ten sam wzór co `site_stats` (0033): jeden zakres czasu, jeden JSON, więc wykresy pod
   sobą nie mogą pochodzić z różnych okien. Godziny i dni liczone w czasie włoskim
   (Europe/Rome), bo o tej strefie myśli organizator, patrząc na „o której ludzie
   skanowali po emisji spotu".
   ========================================================================== */
create or replace function public.qr_stats(window_hours integer default 168)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with span as (
    select greatest(1, least(coalesce(window_hours, 168), 8760)) as hours
  ),
  bounds as (
    select now() - (hours || ' hours')::interval as since, hours from span
  ),
  scans as (
    select s.* from public.qr_scans s, bounds b where s.at >= b.since
  )
  select jsonb_build_object(
    'windowHours', (select hours from bounds),
    'generatedAt', now(),

    'total', (select count(*) from scans),
    /* Poprzednie okno tej samej długości — żeby liczba miała z czym się porównać. */
    'previous', (select count(*) from public.qr_scans, bounds
      where at >= bounds.since - (bounds.hours || ' hours')::interval and at < bounds.since),
    'allTime', (select count(*) from public.qr_scans),
    'today', (select count(*) from public.qr_scans
      where (at at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date),
    'lastHour', (select count(*) from public.qr_scans where at >= now() - interval '1 hour'),
    'firstAt', (select min(at) from public.qr_scans),
    'lastAt', (select max(at) from public.qr_scans),

    'countries', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', coalesce(nullif(country, ''), '??'), 'scans', count(*)) as row,
             count(*) as n
      from scans group by coalesce(nullif(country, ''), '??')
      order by count(*) desc limit 15
    ) k),

    'regions', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', region, 'country', country, 'scans', count(*)) as row,
             count(*) as n
      from scans where region is not null and region <> ''
      group by region, country
      order by count(*) desc limit 15
    ) g),

    'cities', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', city, 'country', country, 'scans', count(*)) as row,
             count(*) as n
      from scans where city is not null and city <> ''
      group by city, country
      order by count(*) desc limit 20
    ) c),

    'devices', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', device, 'scans', count(*)) as row, count(*) as n
      from scans group by device
    ) d),

    'os', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', coalesce(nullif(os, ''), 'other'), 'scans', count(*)) as row,
             count(*) as n
      from scans group by coalesce(nullif(os, ''), 'other')
    ) o),

    'browsers', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', coalesce(nullif(browser, ''), 'other'), 'scans', count(*)) as row,
             count(*) as n
      from scans group by coalesce(nullif(browser, ''), 'other')
    ) w),

    'langs', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', coalesce(nullif(lang, ''), '??'), 'scans', count(*)) as row,
             count(*) as n
      from scans group by coalesce(nullif(lang, ''), '??')
      order by count(*) desc limit 10
    ) l),

    'campaigns', (select coalesce(jsonb_agg(row order by n desc), '[]'::jsonb) from (
      select jsonb_build_object('name', campaign, 'scans', count(*)) as row, count(*) as n
      from scans group by campaign
      order by count(*) desc limit 12
    ) p),

    /* O której godzinie (czas włoski) ludzie skanują — 24 słupki, zawsze wszystkie,
       także puste, żeby wykres miał stałą oś. */
    'hours', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'scans', n) order by h), '[]'::jsonb) from (
      select g.h, count(s.id) as n
      from generate_series(0, 23) as g(h)
      left join scans s on extract(hour from (s.at at time zone 'Europe/Rome'))::int = g.h
      group by g.h
    ) hh),

    /* Przebieg w czasie: do doby po godzinach, dłużej po dniach. Kubełki z generate_series,
       więc okresy bez skanów są zerami, a nie dziurami. */
    'series', (select coalesce(jsonb_agg(jsonb_build_object('at', bucket, 'scans', n) order by bucket), '[]'::jsonb) from (
      select g.bucket, count(s.id) as n
      from bounds b
      cross join lateral generate_series(
        date_trunc(case when b.hours <= 48 then 'hour' else 'day' end, b.since),
        date_trunc(case when b.hours <= 48 then 'hour' else 'day' end, now()),
        case when b.hours <= 48 then interval '1 hour' else interval '1 day' end
      ) as g(bucket)
      left join public.qr_scans s
        on s.at >= g.bucket
       and s.at < g.bucket + (case when b.hours <= 48 then interval '1 hour' else interval '1 day' end)
       and s.at >= b.since
      group by g.bucket
    ) t),
    'seriesStep', (select case when hours <= 48 then 'hour' else 'day' end from bounds),

    /* Ostatnie skany jako lista — „czy to w ogóle działa" widać od razu po pierwszym
       teście telefonem. */
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', at, 'country', country, 'region', region, 'city', city,
        'device', device, 'os', os, 'browser', browser, 'campaign', campaign
      ) order by at desc), '[]'::jsonb) from (
      select * from public.qr_scans order by at desc limit 30
    ) r)
  );
$$;

comment on function public.qr_stats(integer) is
  'Ekran "Skany QR" w jednym JSON-ie. Wolane wylacznie kluczem service_role z panelu.';

/* To są liczby organizatora, nie strony. */
revoke all on function public.qr_stats(integer) from public, anon, authenticated;
grant execute on function public.qr_stats(integer) to service_role;
