/* ---------------------------------------------------------------------------
   Transmisja na zywo: jeden wiersz stanu i licznik serc.
   ---------------------------------------------------------------------------
   Wideo nie jedzie przez ten serwis i nie ma jechac. Wlasny serwer strumienia HD to
   transfer, ktorego ta impreza nie potrzebuje i nie uniesie — sygnal hostuje YouTube
   albo Twitch, a strona pokazuje go w ramce i trzyma przy nim to, czego tam nie ma:
   wlasny licznik serc i wlasna decyzje, kiedy zakladka w ogole istnieje.

   DLACZEGO `video_id`, A NIE CALY ADRES
     Do ramki trafia adres SKLADANY w Workerze z identyfikatora i nazwy dostawcy. Gdyby
     organizator wklejal caly adres, do `<iframe src>` szedlby napis spoza tego kodu — a to
     jest dokladnie ten ksztalt, w ktorym jedna pomylka w panelu staje sie obca strona
     osadzona w naszej. Identyfikator przechodzi przez wzorzec i nic poza nim.

   DLACZEGO LICZNIK W KOLUMNIE, A NIE TABELA ZDARZEN
     Pytanie brzmi „ile serc", nigdy „kto i kiedy". Tabela z wierszem na klikniecie
     odpowiadalaby na drugie pytanie, ktorego nikt nie zadaje, i rosla o tysiace wierszy
     w ciagu jednego zjazdu. Jedna liczba wystarcza, a `bump_stream_hearts` podnosi ja
     jednym zapisem, wiec dwa klikniecia w tej samej milisekundzie nie kasuja sie nawzajem.

   OGRANICZENIE 20 NA WYWOLANIE nie jest ostroznoscia na wyrost: przegladarka zbiera
   klikniecia paczkami i wysyla je co sekunde, wiec wieksza liczba znaczy nie widza, tylko
   kogos, kto probuje podniesc licznik zadaniem z palca.

   RLS wlaczone, zadnej polityki — czyli wejscie wylacznie kluczem service_role z Workera,
   tak samo jak przy kazdej innej tabeli w tym projekcie.
   --------------------------------------------------------------------------- */

create table if not exists public.stream_state (
  id boolean primary key default true,
  is_live boolean not null default false,
  provider text not null default 'youtube',
  video_id text not null default '',
  title text not null default '',
  hearts bigint not null default 0,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint stream_state_singleton check (id),
  constraint stream_state_provider check (provider in ('youtube', 'twitch'))
);

comment on table public.stream_state is
  'Jeden wiersz: czy transmisja trwa, czym leci i ile serc dostala. Publicznie czytany, zapisywany wylacznie kluczem service_role z Workera.';
comment on column public.stream_state.video_id is
  'Identyfikator materialu u dostawcy, nie caly adres — adres skladamy w Workerze, zeby do iframe nie trafilo nic, czego sami nie zbudowalismy.';

insert into public.stream_state (id) values (true) on conflict (id) do nothing;

alter table public.stream_state enable row level security;

create or replace function public.bump_stream_hearts(delta integer)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.stream_state
     set hearts = hearts + greatest(1, least(coalesce(delta, 1), 20)),
         updated_at = now()
   where id
  returning hearts;
$$;

comment on function public.bump_stream_hearts(integer) is
  'Dolicza serca jednym zapisem. Ograniczone do 20 na wywolanie: przycisk wysyla zebrane klikniecia paczkami, a nie po jednym, i nikt nie ma podnosic licznika o tysiac jednym zadaniem.';
