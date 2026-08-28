/* ============================================================================
   0020 — jeden adres e-mail, wielu zawodników.

   PO CO
     Rodzina zapisuje trzy dzieci z jednej skrzynki. Dwóch braci buduje dwa wózki. Ktoś zapisuje
     siebie i kolegę, który nie ma maila. To nie są przypadki brzegowe — na imprezie na kilkadziesiąt
     osób to jest normalny sposób, w jaki ludzie się zapisują.

     Do tej pory unikalny indeks na `lower(email)` odbijał drugie zgłoszenie, a strona proponowała
     „użyj innego adresu". To jest prośba, żeby człowiek obszedł nasz schemat bazy danych wymyślając
     sobie drugi e-mail — i połowa z nich wpisze adres, do którego nie ma dostępu, żeby przejść dalej.
     Wtedy potwierdzenie z numerem startowym i formularzem do podpisu idzie w nikąd.

   CO SIĘ ZMIENIA
     Unikalność przenosi się z samego adresu na parę **adres + imię i nazwisko**. Jeden adres może
     mieć wielu zawodników; ta sama osoba pod tym samym adresem nadal nie może się zapisać dwa razy,
     bo to jest prawdziwy duplikat — dwa razy wysłany ten sam formularz.

   DLACZEGO NIE PO PROSTU ZDJĄĆ UNIKALNOŚĆ
     Bo wtedy dwa kliknięcia „wyślij" na wolnym łączu robią dwa zgłoszenia z dwoma numerami
     startowymi dla jednej osoby. Ochrona przed tym jest jedynym powodem, dla którego ten indeks
     istniał, i ten powód nadal jest prawdziwy. Zmienia się tylko definicja tego, co jest tą samą
     osobą.

   PORÓWNANIE BEZ WIELKOŚCI LITER I BEZ SPACJI
     `lower(btrim(...))` na obu częściach. „Marco Rossi" i „marco  rossi" to jedna osoba, i tak samo
     dla adresu (0017 sprowadza go do małych liter triggerem, więc tutaj to pas bezpieczeństwa).

   CO Z DANYMI, KTÓRE JUŻ SĄ
     Nic. Nowy indeks jest luźniejszy od starego — wszystko, co przechodziło przez unikalność na
     adresie, przechodzi tym bardziej przez unikalność na adresie z nazwiskiem. Zakładany jest przed
     usunięciem starego, więc w żadnym momencie tabela nie zostaje bez ochrony.

   CZEGO TO NIE ZMIENIA — a zmienić trzeba było w kodzie
     `reminder_subscribers` i `newsletter_subscribers` dalej mają unikalność na adresie i tak ma
     zostać: trzy zgłoszenia z jednej skrzynki to jeden człowiek czytający tę skrzynkę i jedna seria
     przypomnień. Upsert w storeIntake() już to obsługuje przez `resolution=ignore-duplicates`.

   MOŻNA PUŚCIĆ PONOWNIE.
   ========================================================================== */

create unique index if not exists registrations_email_person_key
  on public.registrations (
    lower(btrim(email)),
    lower(btrim(first_name)),
    lower(btrim(last_name))
  );

/* Zdejmowane po założeniu nowego. Kolejność jest istotna: odwrotna otwiera okno, w którym
   równoległe zgłoszenia nie mają żadnej ochrony przed duplikatem. */
drop index if exists public.registrations_email_key;

comment on index public.registrations_email_person_key is
  'Jeden adres, wielu zawodnikow — ale ta sama osoba pod tym samym adresem tylko raz. '
  'Zastapil registrations_email_key (0020), ktory nie pozwalal rodzinie zapisac dwojga dzieci '
  'z jednej skrzynki.';

/* ---------------------------------------------------------------------------
   Ile osob jest zapisanych z jednego adresu — dla panelu.

   Widok, a nie zapytanie w kodzie, bo panel pyta o to przy kazdym wierszu listy startowej i
   `count(*) over (partition by ...)` liczy to raz na cala tabele zamiast raz na wiersz.
   --------------------------------------------------------------------------- */
create or replace view public.registrations_with_group
with (security_invoker = false) as
select
  r.*,
  count(*) over (partition by lower(btrim(r.email))) as email_group_size
from public.registrations r;

comment on view public.registrations_with_group is
  'registrations plus email_group_size: ilu zawodnikow lacznie zapisano z tego samego adresu. '
  'Panel pokazuje to przy wierszu, zeby organizator widzial, ze te trzy zgloszenia to jedna '
  'rodzina, a nie trzy niezalezne osoby.';

alter view public.registrations_with_group owner to postgres;
revoke all on public.registrations_with_group from anon, authenticated;
