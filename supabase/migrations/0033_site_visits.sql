/* ============================================================================
   Statystyki odwiedzin — skąd przychodzą ludzie i ilu ich jest
   ============================================================================
   PO CO
     Przed kampanią reklamową nie ma czym odpowiedzieć na pytanie „ile osób przyszło z
     Facebooka, a ile z Google". Ta tabela zbiera wejścia na stronę i klasyfikuje je do
     kanałów, żeby dało się to zobaczyć w panelu w czasie rzeczywistym.

   CO TU NIE TRAFIA I DLACZEGO
     Ani adresu IP, ani pełnego user-agenta, ani ciasteczka śledzącego. `visitor` to skrót
     HMAC z adresu, przeglądarki i DATY — obraca się o północy sam z siebie, więc pozwala
     policzyć OSOBY w danym dniu i nie pozwala połączyć wczoraj z dzisiaj ani rozpoznać
     nikogo poza tą dobą. To jest cała zdolność, jakiej potrzebuje wykres „ilu ludzi", i
     mniej, niż potrzeba do śledzenia kogokolwiek.

     Zgoda jest warunkiem: baner na stronie obiecuje „analityczne wyłącznie za Twoją zgodą"
     i sonda nie wysyła ani jednego żądania, dopóki jej nie ma (patrz setupVisitBeacon
     w assets/js/app.js). Liczby są więc z natury NIŻSZE niż prawdziwy ruch — panel mówi o
     tym wprost, bo statystyka, która udaje komplet, jest gorsza od zaniżonej i opisanej.

   DLACZEGO WŁASNA TABELA, A NIE GOOGLE ANALYTICS
     Bo tamto znaczy trzecią stronę, zgodę na profilowanie i skrypt, który waży więcej niż
     cała ta strona. Tu chodzi o dziewięć liczb, a nie o platformę marketingową.
   ========================================================================== */

create table if not exists public.site_visits (
  id bigserial primary key,
  at timestamptz not null default now(),

  /* Kanał, już rozstrzygnięty przy zapisie — patrz classifySource() w worker/index.js.
     Klasyfikacja przy ZAPISIE, nie przy odczycie: reguła „instagram.com i l.instagram.com
     to Instagram" ma jedno miejsce, a wykres ma tylko sumować. */
  source text not null default 'direct',
  /* Surowy host odsyłający — zostaje, żeby dało się zobaczyć, co wpadło do kosza „inne”. */
  referrer_host text,

  /* Parametry kampanii z adresu (?utm_source=…). To jest to, co pozwala odróżnić dwie
     reklamy na tym samym Facebooku. */
  utm_source text,
  utm_medium text,
  utm_campaign text,

  path text not null default '/',
  /* Kraj z nagłówka platformy (Vercel podaje `x-vercel-ip-country`). Dwie litery albo nic. */
  country text,
  device text not null default 'desktop',
  lang text,

  /* Skrót obracający się co dobę. Liczy osoby, nie odsłony. */
  visitor text not null,
  /* Skrót obracający się co pół godziny — jedna wizyta to jedna sesja, a nie każde
     przejście między podstronami. */
  session text not null
);

comment on table public.site_visits is
  'Anonimowe wejscia na strone, tylko za zgoda na analityke. Bez IP i bez ciasteczek.';

/* Wykresy pytają zawsze o „ostatnie N”, więc czas jest jedynym indeksem, którego naprawdę
   trzeba. Malejąco, bo tak biegną wszystkie zapytania panelu. */
create index if not exists site_visits_at_idx on public.site_visits (at desc);
/* „Ile z Facebooka w ostatnim tygodniu” bez czytania całej tabeli. */
create index if not exists site_visits_source_at_idx on public.site_visits (source, at desc);

/* ---------------------------------------------------------------- sprzątanie
   Rok wystarczy: to są dane do porównania kampanii, a nie archiwum. Bez tego tabela rośnie
   w nieskończoność, a nikt nigdy nie zapyta o ruch sprzed dwóch lat.

   Kasowanie jest zwykłym DELETE i NIE MA tu indeksu częściowego. Pierwsza wersja miała
   `create index ... where at < now() - interval '400 days'` i baza odrzuciła całą migrację
   błędem 42P17 („functions in index predicate must be marked IMMUTABLE"). Powód jest
   głębszy niż sama reguła: Postgres wylicza warunek indeksu RAZ, przy zakładaniu, i zapisuje
   wynik w katalogu. `now()` zostałoby więc zamrożone na dacie wdrożenia, a indeks po roku
   pokazywałby wiersze starsze od WDROŻENIA, nie starsze od roku. Byłby nie tylko
   niedozwolony, ale i kłamliwy.

   Zakresu po czasie i tak nie trzeba niczym dokładać: `site_visits_at_idx` to B-drzewo po
   `at`, a takie czyta się w obie strony, więc obsługuje zarówno wykresy, jak i kasowanie:

     delete from public.site_visits where at < now() - interval '400 days';

   Wywołanie zostaje po stronie człowieka albo pg_cron — jeden DELETE raz na kwartał, a nie
   mechanizm, który trzeba pilnować. */

/* ---------------------------------------------------------------------- RLS
   Zapis idzie wyłącznie przez funkcję z kluczem `service_role`, odczyt wyłącznie przez
   panel z tym samym kluczem. Anon nie ma tu nic do roboty w żadną stronę — a bez RLS
   tabela z kluczem publicznym byłaby otwarta na odczyt cudzych statystyk. */
alter table public.site_visits enable row level security;

/* ============================================================================
   Skąd rejestracje — pierwsze dotknięcie, zapisane przy zgłoszeniu
   ============================================================================
   Sam ruch nie odpowiada na pytanie, które naprawdę pada przy kampanii: nie „ile osób
   przyszło z Instagrama", tylko „ile z nich się ZAPISAŁO". Dlatego zgłoszenie niesie kanał,
   z którego ta osoba trafiła na stronę PIERWSZY raz — sonda zapamiętuje go w przeglądarce
   i formularz dokłada do wysyłki.

   Pierwsze dotknięcie, nie ostatnie: ktoś klika reklamę na Instagramie, wraca po trzech
   dniach z Google i zapisuje się. Zapis „google" powiedziałby, że reklama nic nie dała. */
alter table public.registrations
  add column if not exists source text;
alter table public.registrations
  add column if not exists utm_campaign text;

comment on column public.registrations.source is
  'Kanal PIERWSZEGO wejscia tej osoby na strone. Pusty, gdy nie bylo zgody na analityke.';

/* ============================================================================
   Jedno zapytanie na cały ekran statystyk
   ============================================================================
   Panel rysuje osiem wykresów. Osiem zapytań to osiem podróży do bazy przy każdym
   odświeżeniu i osiem miejsc, w których zakres dat może się rozjechać — a wykresy pod
   sobą, liczone z różnych okien, to najgorszy rodzaj błędu: wyglądają poprawnie.

   Więc jedna funkcja, jeden zakres, jeden JSON.

   `security definer` z ustawionym `search_path`: funkcja czyta tabelę objętą RLS w imieniu
   właściciela. Wołana jest wyłącznie kluczem `service_role` z panelu (patrz siteStats()
   w worker/index.js), więc nie wystawia niczego, do czego nie ma się już dostępu.
   ========================================================================== */
create or replace function public.site_stats(window_hours integer default 168)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  with span as (
    select
      greatest(1, least(coalesce(window_hours, 168), 8760)) as hours
  ),
  bounds as (
    select now() - (hours || ' hours')::interval as since, hours from span
  ),
  visits as (
    select v.* from public.site_visits v, bounds b where v.at >= b.since
  )
  select jsonb_build_object(
    'windowHours', (select hours from bounds),
    'generatedAt', now(),

    /* Teraz na stronie: osobne sesje z ostatnich pięciu minut. Pięć, bo to jest okno,
       w którym „ktoś czyta stronę" jest jeszcze prawdą, a nie wspomnieniem. */
    'live', (select count(distinct session) from public.site_visits where at >= now() - interval '5 minutes'),
    'liveMinutes', 5,

    'totals', (select jsonb_build_object(
      'views', count(*),
      'visitors', count(distinct visitor),
      'sessions', count(distinct session)
    ) from visits),

    /* Poprzednie okno tej samej długości — bez tego liczba nie ma z czym się porównać,
       a „1200 wejść" samo w sobie nie mówi, czy kampania działa. */
    'previous', (select jsonb_build_object(
      'views', count(*),
      'visitors', count(distinct visitor)
    ) from public.site_visits, bounds
      where at >= bounds.since - (bounds.hours || ' hours')::interval and at < bounds.since),

    'sources', (select coalesce(jsonb_agg(row order by views desc), '[]'::jsonb) from (
      select jsonb_build_object('source', source, 'views', count(*), 'visitors', count(distinct visitor)) as row,
             count(*) as views
      from visits group by source
    ) s),

    'campaigns', (select coalesce(jsonb_agg(row order by views desc), '[]'::jsonb) from (
      select jsonb_build_object(
        'campaign', utm_campaign, 'source', coalesce(utm_source, source),
        'medium', utm_medium, 'views', count(*), 'visitors', count(distinct visitor)
      ) as row, count(*) as views
      from visits where utm_campaign is not null and utm_campaign <> ''
      group by utm_campaign, coalesce(utm_source, source), utm_medium
      /* `order by` MUSI stać przed `limit`: bez niego baza obcina dowolne dwadzieścia grup,
         a nie dwadzieścia największych — i wykres pokazuje przypadkowe kampanie zamiast
         tych, które przyniosły ruch. Reszta bloków ma to samo, więc i ten ma. */
      order by count(*) desc
      limit 20
    ) c),

    'pages', (select coalesce(jsonb_agg(row order by views desc), '[]'::jsonb) from (
      select jsonb_build_object('path', path, 'views', count(*)) as row, count(*) as views
      from visits group by path order by count(*) desc limit 12
    ) p),

    'countries', (select coalesce(jsonb_agg(row order by views desc), '[]'::jsonb) from (
      select jsonb_build_object('country', coalesce(nullif(country, ''), '??'), 'views', count(*)) as row,
             count(*) as views
      from visits group by coalesce(nullif(country, ''), '??') order by count(*) desc limit 12
    ) k),

    'devices', (select coalesce(jsonb_agg(row order by views desc), '[]'::jsonb) from (
      select jsonb_build_object('device', device, 'views', count(*)) as row, count(*) as views
      from visits group by device
    ) d),

    /* Szereg czasowy. Do doby włącznie po godzinach, dłuższe okna po dniach — inaczej
       trzydzieści dni dałoby 720 słupków, z których żaden nic nie mówi. Kubełki generuje
       `generate_series`, więc godziny bez ruchu są zerami, a nie dziurami w wykresie. */
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
        'at', bucket, 'views', views, 'visitors', visitors
      ) order by bucket), '[]'::jsonb) from (
      select
        g.bucket,
        count(v.id) as views,
        count(distinct v.visitor) as visitors
      from bounds b
      cross join lateral generate_series(
        date_trunc(case when b.hours <= 48 then 'hour' else 'day' end, b.since),
        date_trunc(case when b.hours <= 48 then 'hour' else 'day' end, now()),
        case when b.hours <= 48 then interval '1 hour' else interval '1 day' end
      ) as g(bucket)
      left join public.site_visits v
        on v.at >= g.bucket
       and v.at < g.bucket + (case when b.hours <= 48 then interval '1 hour' else interval '1 day' end)
       and v.at >= b.since
      group by g.bucket
    ) t),
    'seriesStep', (select case when hours <= 48 then 'hour' else 'day' end from bounds),

    /* Zapisy w tym samym oknie, z podziałem na kanał pierwszego wejścia. To jest liczba,
       dla której cała ta zakładka powstała: nie ile osób weszło, tylko ile zostało. */
    'signups', (select coalesce(jsonb_agg(row order by count desc), '[]'::jsonb) from (
      select jsonb_build_object('source', coalesce(nullif(source, ''), 'nieznane'), 'count', count(*)) as row,
             count(*) as count
      from public.registrations, bounds
      where created_at >= bounds.since and status <> 'withdrawn'
      group by coalesce(nullif(source, ''), 'nieznane')
    ) r),
    'signupTotal', (select count(*) from public.registrations, bounds
      where created_at >= bounds.since and status <> 'withdrawn')
  );
$$;

comment on function public.site_stats(integer) is
  'Caly ekran statystyk w jednym JSON-ie. Wolane wylacznie kluczem service_role z panelu.';

/* Anon nie ma po co tego widzieć: to są dane organizatora, nie strony. */
revoke all on function public.site_stats(integer) from public, anon;
