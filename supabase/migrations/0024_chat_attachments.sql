/* ===========================================================================
   0024 — zalaczniki w czacie.

   Gosc moze dolaczyc zdjecie do wiadomosci. Powod jest praktyczny: polowa pytan o pojazd
   brzmi „czy takie kolo przejdzie kontrole" i odpowiedz na nie bez zobaczenia kola jest
   zgadywaniem. Zdjecie idzie takze do modelu, gdy skonfigurowany jest model wizyjny — patrz
   AI_VISION_MODEL w askModel().

   Powtarzalna w calosci, jak 0022 po poprawce.
   =========================================================================== */

/* ---------------------------------------------------------------------------
   Sciezka do pliku w prywatnym buckecie. Nie adres URL.
   Adres podpisany wygasa po godzinie, wiec zapisany w bazie bylby martwym linkiem przy
   kazdym drugim odczycie watku. Podpisywane przy odczycie — tak samo jak zdjecia z tablicy
   i zdjecia uczestnikow.
   --------------------------------------------------------------------------- */
alter table public.chat_messages
  add column if not exists image_path text;

comment on column public.chat_messages.image_path is
  'Sciezka w prywatnym buckecie chat-photos. Podpisywana przy odczycie, nigdy nie trzymana '
  'jako gotowy URL.';

/* ---------------------------------------------------------------------------
   Wiadomosc moze byc samym zdjeciem.

   `body` mial `check (char_length(btrim(body)) between 1 and 2000)`, czyli tresc byla
   obowiazkowa. Zdjecie bez podpisu jest normalna wiadomoscia — ktos fotografuje kolo i pyta
   „jak?" jednym obrazkiem — a wymuszanie podpisu znaczyloby, ze przeglądarka musi cos
   dopisac za uzytkownika. Wtedy w watku organizatora pojawialyby sie zdania, ktorych nikt
   nie napisal.

   Nowy warunek: tresc albo zdjecie, przynajmniej jedno. Puste oba to nadal blad, bo pusta
   wiadomosc nie jest wiadomoscia.

   Nazwa ograniczenia jest zgadywana z konwencji Postgresa (`<tabela>_<kolumna>_check`), wiec
   zdejmowane jest ostroznie i tylko jesli istnieje.
   --------------------------------------------------------------------------- */
alter table public.chat_messages
  drop constraint if exists chat_messages_body_check;

alter table public.chat_messages
  drop constraint if exists chat_messages_body_or_image;

alter table public.chat_messages
  add constraint chat_messages_body_or_image check (
    char_length(btrim(body)) <= 2000
    and (char_length(btrim(body)) >= 1 or image_path is not null)
  );

comment on constraint chat_messages_body_or_image on public.chat_messages is
  'Tresc albo zdjecie, przynajmniej jedno. Zdjecie bez podpisu jest normalna wiadomoscia.';

/* ---------------------------------------------------------------------------
   Prywatny bucket na zalaczniki z czatu.

   Osobny od `wall-photos` z dwoch powodow. Pierwszy: to sa zupelnie inne dane — zdjecie na
   tablicy jest publikowane po zatwierdzeniu, a zalacznik w czacie jest prywatna korespondencja
   miedzy jedna osoba i organizatorem i nigdy nie ma sie nigdzie pokazac. Drugi: „wyczysc
   zdjecia z tablicy" i „wyczysc zalaczniki z rozmow" to dwie rozne czynnosci, a w jednym
   buckecie bylyby jedna.

   2 MB, mniej niz 5 MB na tablicy: przeglądarka i tak zmniejsza obrazek przed wyslaniem, a
   limit ciala zadania w workerze jest nizszy niz to.
   --------------------------------------------------------------------------- */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-photos',
  'chat-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- Bez polityk, celowo: anon i authenticated nie dostaja nic. Czyta i pisze wylacznie worker
-- kluczem service role, ktorego przeglądarka nigdy nie widzi.
