/* ============================================================================
   0014 — skąd przyszła wiadomość na czacie: z okna na stronie czy z e-maila.

   PO CO
     Odpowiedź klienta na naszego maila ma trafiać do tego samego wątku, co rozmowa
     w oknie czatu — bo dla organizatora to jest jedna rozmowa z jednym człowiekiem,
     nawet jeśli technicznie przyszła dwoma kanałami.

     Ale odpowiadając, trzeba wiedzieć którędy. Zdanie „napisz do mnie na priv" ma inny
     sens, kiedy człowiek siedzi w oknie czatu, niż kiedy pisze z Gmaila i okna nie
     widzi. Bez tej informacji organizator odpisuje w panelu i nie wie, czy tamten to
     w ogóle zobaczy.

   DLACZEGO KOLUMNA, A NIE PREFIKS W TREŚCI
     Kusi, żeby dopisać „✉️ (z e-maila)" na początku body i nie ruszać schematu. To
     działa do pierwszego miejsca, które tę treść czyta jako treść: model dostaje
     historię rozmowy i zaczyna widzieć nasz znacznik jako słowa gościa, wyszukiwanie
     po treści łapie prefiks, a cytat wysłany dalej niesie ozdobnik, którego nikt nie
     napisał. Fakt o wiadomości należy do wiersza, nie do zdania.

   DOMYŚLNIE 'chat'
     Wszystko, co już jest w tabeli, przyszło z okna na stronie — innej drogi wtedy nie
     było. `not null default` zamiast nullable, żeby nie trzeba było w kodzie w kółko
     odpowiadać na pytanie „a co znaczy NULL".

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

alter table public.chat_messages
  add column if not exists source text not null default 'chat';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'chat_messages_source_check'
       and conrelid = 'public.chat_messages'::regclass
  ) then
    alter table public.chat_messages
      add constraint chat_messages_source_check check (source in ('chat', 'email'));
  end if;
end;
$$;

comment on column public.chat_messages.source is
  'chat = okno na stronie, email = odpowiedz na maila wciagnieta przez IMAP w Make.';

/* Panel pyta „co przyszło z maila i czeka", a nie „pokaż wszystko i odsiej".
   Częściowy indeks, bo wierszy z 'email' będzie garść wobec całej tabeli. */
create index if not exists chat_messages_email_idx
  on public.chat_messages (thread_id, created_at desc)
  where source = 'email';

/* ---------------------------------------------------------------------------
   Message-Id maila, żeby ta sama odpowiedź nie wpadła dwa razy.

   Scenariusz IMAP w Make oddaje wiadomości nieprzeczytane i oznacza je jako
   przeczytane — dopóki nic nie pójdzie nie tak. Zerwane połączenie po pobraniu,
   a przed oznaczeniem, oddaje tego samego maila przy następnym przebiegu, i wtedy
   w wątku stoją dwie identyczne wypowiedzi bez śladu, skąd się wzięła druga.

   Unikalny indeks zamiast sprawdzania w kodzie: sprawdzenie „czy już jest" i wstawienie
   to dwie operacje, a dwa przebiegi Make mogą się między nie wcisnąć. Baza rozstrzyga
   to jedną. Drugi insert dostaje 409, worker go połyka i odpowiada OK — dla Make'a
   duplikat ma wyglądać jak sukces, bo powtórka nie jest awarią.

   Partial index: wiersze z okna czatu nie mają Message-Id i NULL-e nie mają się
   po co w tym indeksie tłoczyć.
   --------------------------------------------------------------------------- */
alter table public.chat_messages
  add column if not exists email_message_id text;

create unique index if not exists chat_messages_email_message_id_key
  on public.chat_messages (email_message_id)
  where email_message_id is not null;
