/* ---------------------------------------------------------------------------
   „Ile osob oglada" — licznik obecnosci przy transmisji.
   ---------------------------------------------------------------------------
   CZEGO BRAKOWALO
     Pod odtwarzaczem stala liczba z ikona osoby, ale pokazywala OKLASKI, nie widzow.
     Zgloszone doslownie: „jak to klikam, to sie polubia" — czyli liczba przy ludziku rosla
     od wlasnego stukania. Ikona obiecywala co innego, niz liczyla.

   SKAD SIE BIERZE LICZBA
     YouTube nie oddaje liczby ogladajacych bez wlasnego klucza API i zgody kanalu, wiec
     nie da sie pokazac ICH licznika. Da sie pokazac wlasny: ile kart przegladarki ma teraz
     otwarta strone z transmisja. To jest inna liczba niz u YouTube i nie udaje tamtej.

   DLACZEGO TO NIC NIE KOSZTUJE
     Strona i tak odpytuje o stan transmisji co szesc sekund, gdy ta trwa. Wiersz jest
     nadpisywany przy okazji tego samego zapytania — zadnego dodatkowego ruchu.

   CO TU NIE LEZY
     Zaden adres IP, zadna nazwa, nic, co wskazuje na osobe. `viewer_id` to losowy ciag
     tworzony w karcie przegladarki i ginacy razem z nia. Wiersze starsze niz kilka minut
     nie licza sie do wyniku i sa kasowane przy okazji kolejnych odczytow.
   --------------------------------------------------------------------------- */

create table if not exists public.stream_presence (
  viewer_id text primary key,
  seen_at timestamptz not null default now()
);

comment on table public.stream_presence is
  'Kto jest teraz przy transmisji. Jeden wiersz na karte przegladarki, nadpisywany przy kazdym odpytaniu stanu. Bez adresow IP i bez niczego, co wskazuje na osobe.';

create index if not exists stream_presence_seen_idx on public.stream_presence (seen_at desc);

alter table public.stream_presence enable row level security;
