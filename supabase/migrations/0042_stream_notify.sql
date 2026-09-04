/* ---------------------------------------------------------------------------
   Powiadomienie "transmisja wystartowala": wlasna lista odbiorcow.
   ---------------------------------------------------------------------------
   DLACZEGO OSOBNA TABELA, A NIE WYSYLKA WPROST DO `reminder_subscribers`
     Organizator ma miec mozliwosc DOPISANIA jednego adresu i USUNIECIA innego przed
     wyslaniem — i ani jedno, ani drugie nie moze dotykac listy przypomnien. Dopisanie
     kogos do `reminder_subscribers` znaczyloby zapisanie go na wszystkie przyszle
     przypomnienia bez jego zgody; usuniecie znaczyloby, ze przestaje dostawac to, na co
     sie zapisal. Jedna czynnosc w panelu nie ma prawa miec takich skutkow ubocznych.

     Ta lista jest wiec kopia robocza na JEDNA wysylke: zasiewana z `reminder_subscribers`,
     potem swobodnie edytowalna, i nie wraca do zrodla.

   `sent_at` ZAMIAST KASOWANIA WIERSZA
     Po wyslaniu wiersz zostaje ze znacznikiem czasu. Dzieki temu drugie nacisniecie
     przycisku nie wysle listu drugi raz do tych samych ludzi, a organizator widzi, kto juz
     dostal. Kasowanie wiersza po wysylce dawaloby liste, ktora po kliknieciu jest pusta —
     czyli zadnej odpowiedzi na pytanie "czy poszlo i do kogo".

   `source` mowi, skad wzial sie adres: 'reminders' (zasiew) albo 'manual' (dopisany recznie).
   Bez tego nie da sie odroznic "usunalem, bo nie chcial" od "nigdy go tu nie bylo".

   RLS wlaczone, zadnej polityki — wejscie wylacznie kluczem service_role z Workera,
   tak samo jak przy kazdej innej tabeli z danymi osobowymi w tym projekcie.
   --------------------------------------------------------------------------- */

create table if not exists public.stream_notify_recipients (
  email text primary key,
  name text not null default '',
  locale text not null default 'it',
  source text not null default 'manual',
  added_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint stream_notify_source check (source in ('reminders', 'manual'))
);

comment on table public.stream_notify_recipients is
  'Lista na jedna wysylke powiadomienia o starcie transmisji. Kopia robocza zasiewana z reminder_subscribers, edytowalna w panelu, nigdy niewracajaca do zrodla.';
comment on column public.stream_notify_recipients.sent_at is
  'Kiedy poszedl list. Niepuste znaczy: nie wysylaj do tego adresu ponownie.';

create index if not exists stream_notify_pending_idx
  on public.stream_notify_recipients (added_at)
  where sent_at is null;

alter table public.stream_notify_recipients enable row level security;
