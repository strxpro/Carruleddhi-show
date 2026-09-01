/* ---------------------------------------------------------------------------
   Zgloszenia sponsorow z czatu maja gdzie wyladowac.
   ---------------------------------------------------------------------------
   Do tej pory kreator sponsora konczyl sie trzema wysylkami: WhatsApp do
   organizatorow, mail do organizatorow i potwierdzenie dla zglaszajacego. Nigdzie
   ZAPISU. Zgloszenie zylo wiec dokladnie tak dlugo, jak czyjas skrzynka i czyjs
   telefon - a "kto sie do nas zglosil w zeszlym miesiacu" nie mialo odpowiedzi
   inaczej niz przez przeszukiwanie poczty.

   Ta tabela jest ta odpowiedzia, i jednoczesnie kolejka do decyzji: kazde zgloszenie
   czeka ze statusem `pending`, dopoki organizator go nie przyjmie albo nie odrzuci.
   Przyjecie dopisuje sponsora do `site_settings.data.sponsors`, czyli na strone -
   dlatego `logo_path` trzyma sciezke w tym samym miejscu, ktorego uzywa reczne
   wgranie logo w ustawieniach (`wall-photos`, folder `sponsors/`). Zatwierdzenie
   jest wtedy przepisaniem sciezki, a nie kopiowaniem pliku miedzy bucketami.

   CZEGO TU NIE MA
   Kodu weryfikacyjnego ani sladu po nim. Kod jest dowodem, ze ktos czyta te
   skrzynke, i zuzywa sie w `verification_codes`; przechowywanie go tutaj drugi raz
   znaczyloby dwa miejsca do wyczyszczenia i jedno wiecej do wycieku. Wiersz powstaje
   DOPIERO po zuzyciu kodu, wiec sam jego istnienie jest tym dowodem.

   RLS wlaczone bez zadnej polityki - tak jak wszystkie pozostale tabele w tym
   projekcie. Jedyna droga do tych wierszy prowadzi przez klucz serwisowy w Workerze.
   --------------------------------------------------------------------------- */

create table if not exists public.sponsor_leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  -- Nazwa, ktora ma stanac na carruleddhi i na stronie.
  cart_name   text not null check (length(cart_name) between 1 and 120),

  -- Osoba, do ktorej sie dzwoni. Rozdzielone, bo "dzien dobry" to za malo.
  first_name  text not null check (length(first_name) between 1 and 120),
  last_name   text not null check (length(last_name) between 1 and 120),

  email       text not null check (position('@' in email) > 1),
  phone       text check (phone is null or length(phone) <= 40),

  /* Oba opcjonalne (5.7). Strona albo social - jedno pole, bo dla organizatora to ta
     sama rzecz: "gdzie ich znalezc". Logo jako sciezka w buckecie, nie jako URL:
     podpisane adresy wygasaja po godzinie i zapisany URL byl by martwy nastepnego dnia. */
  link        text check (link is null or length(link) <= 500),
  logo_path   text check (logo_path is null or length(logo_path) <= 300),

  -- Jezyk rozmowy: odpowiedz na zgloszenie ma isc w tym, w ktorym je zlozono.
  locale      text not null default 'it' check (locale in ('it','pl','en','de','es','fr')),

  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at  timestamptz,

  -- Notatka organizatora. Widoczna tylko w panelu; zglaszajacy jej nie dostaje.
  note        text check (note is null or length(note) <= 2000)
);

comment on table public.sponsor_leads is
  'Zgloszenia sponsorow z czatu, czekajace na decyzje organizatora. Przyjecie dopisuje wpis do site_settings.data.sponsors.';

/* Jedyne zapytanie, ktore ta tabela obsluguje: "co czeka na decyzje, od najnowszego".
   Czesciowy indeks, bo odrzucone i przyjete czyta sie rzadko i mozna je przejrzec sekwencyjnie. */
create index if not exists sponsor_leads_pending_idx
  on public.sponsor_leads (created_at desc)
  where status = 'pending';

create index if not exists sponsor_leads_recent_idx
  on public.sponsor_leads (created_at desc);

alter table public.sponsor_leads enable row level security;
