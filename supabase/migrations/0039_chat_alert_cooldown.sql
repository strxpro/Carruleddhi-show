/* ---------------------------------------------------------------------------
   Zapora przed lawina powiadomien o czacie.
   ---------------------------------------------------------------------------
   `alertOrganisers` mialo zapore: sygnal szedl tylko wtedy, gdy `unread_for_admin`
   wynosilo zero, czyli gdy organizator mial juz wszystko przeczytane. Wygladalo to
   rozsadnie i nie dzialalo, bo licznik nie jest tym, za co go brano.

   Panel, majac otwarty watek, odpytuje `chat-admin` czynnoscia `messages` co kilka
   sekund — a ta czynnosc ZERUJE `unread_for_admin`, bo otwarcie watku jest jego
   przeczytaniem. Przy otwartym panelu licznik wracal wiec do zera zanim padla
   kolejna wiadomosc, warunek byl spelniony za kazdym razem i KAZDA wiadomosc goscia
   wysylala WhatsAppa. Zglaszane jako „ciagle przychodza mi wiadomosci, jest loop".

   Drugie zrodlo tej samej lawiny bylo w watkach przestawionych na `human`: tam sygnal
   leci z kazdej wiadomosci z zalozenia, a watki trafialy tam bledem — kazda techniczna
   awaria modelu przestawiala watek na czlowieka (naprawione osobno).

   DLACZEGO ZNACZNIK CZASU, A NIE LICZNIK
     Pytanie brzmi „czy juz o tym dzwonilismy", a nie „czy ktos to przeczytal". Znacznik
     czasu odpowiada na nie wprost i nie da sie go przypadkiem wyzerowac odczytem — bo
     zapisuje go WYSYLKA, a nie czytanie.

   Kolumna moze byc pusta: watek, o ktorym nigdy nie dzwonilismy, nie ma czego przechowywac.
   --------------------------------------------------------------------------- */

alter table public.chat_threads
  add column if not exists last_alert_at timestamptz;

comment on column public.chat_threads.last_alert_at is
  'Kiedy ostatnio poszedl sygnal do organizatorow o tym watku. Zapora przed lawina powiadomien: licznik unread_for_admin nie nadaje sie na nia, bo panel zeruje go przy kazdym odpytaniu otwartego watku.';
