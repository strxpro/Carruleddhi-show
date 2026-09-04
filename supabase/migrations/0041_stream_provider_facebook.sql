/* ---------------------------------------------------------------------------
   Transmisja: trzeci dostawca — Facebook.
   ---------------------------------------------------------------------------
   Migracja 0040 dopuszczala w kolumnie `provider` wylacznie 'youtube' i 'twitch'. Proba
   zapisania transmisji z Facebooka konczyla sie odmowa bazy, a w panelu wygladalo to tak,
   ze "link nie chce sie zapisac" — bo nic na ekranie nie mowilo, ze to ograniczenie
   kolumny, a nie zly adres.

   DLACZEGO FACEBOOK TRZYMA CALY ADRES, A NIE IDENTYFIKATOR
     Wtyczka wideo Facebooka nie przyjmuje identyfikatora — potrzebuje calego adresu strony
     z nagraniem, ktory wklada sie do parametru `href`. To jest wyjatek od zasady z 0040
     ("do iframe nie trafia nic, czego sami nie zbudowalismy") i dlatego adres przechodzi
     przez `facebookVideoUrl` w Workerze: lista dozwolonych domen, zdjeta reszta zapytania,
     zlozony z powrotem od zera. Do `<iframe src>` i tak trafia adres wtyczki, ktory
     budujemy sami; wklejenie organizatora jest tylko WARTOSCIA parametru.

   Sprawdzenie jest podmieniane, a nie dopisywane obok: dwa ograniczenia na te sama kolumne
   znaczylyby, ze o tym, co wolno, decyduje ich czesc wspolna — a to sie czyta z dwoch
   miejsc naraz.
   --------------------------------------------------------------------------- */

alter table public.stream_state
  drop constraint if exists stream_state_provider;

alter table public.stream_state
  add constraint stream_state_provider
  check (provider in ('youtube', 'twitch', 'facebook'));

comment on column public.stream_state.provider is
  'youtube | twitch | facebook. Przy pierwszych dwoch video_id to identyfikator; przy Facebooku caly adres strony z nagraniem, bo tego wymaga wtyczka wideo — sprawdzany i skladany od nowa w Workerze.';
