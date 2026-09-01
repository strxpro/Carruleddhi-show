/* ============================================================================
   0035 — kod weryfikacyjny żyje dziesięć minut, a zgłoszenie sponsora ma gdzie leżeć
   ============================================================================
   DWIE ZMIANY W JEDNYM PLIKU, BO OBIE SĄ Z JEDNEJ TURY
     Numeracja migracji jest jedna i rosnąca, a dwa pliki o numerze 0035 to pytanie „który
     pierwszy", na które nikt nie umie odpowiedzieć po fakcie. Zmiany nie mają ze sobą nic
     wspólnego poza tym, że przyszły razem — dlatego są tu w dwóch osobnych, opisanych
     blokach i żaden nie zależy od drugiego.

   ---------------------------------------------------------------------------
   1. WAŻNOŚĆ KODU: DZIESIĘĆ MINUT, NIE PIĘTNAŚCIE
   ---------------------------------------------------------------------------
   PO CO
     0009 ustawiło domyślne `now() + interval '15 minutes'` i oba miejsca w Workerze, które
     wstawiają kod, polegały na tym domyśle. Odpowiedź na pytanie „ile ten kod jest ważny"
     leżała więc w pliku migracji, a zdanie pokazywane gościowi — w słowniku strony i w
     tekstach listów. Trzy miejsca, które mogą się rozjechać, i żadnego, które by o tym
     powiedziało: kod wygasły trzy minuty przed tym, co obiecuje list, wygląda dla człowieka
     jak zepsuta strona, a nie jak upływ czasu.

     Od teraz decyduje `CODE_TTL_MINUTES` w `worker/index.js` — obie wstawki liczą
     `expires_at` jawnie. Ta migracja przestawia domyślną wartość kolumny na tę samą liczbę,
     żeby wiersz wstawiony KIEDYKOLWIEK z pominięciem tamtego kodu (ręcznie w tabeli, przez
     inne narzędzie, przez starszą wersję Workera) mówił to samo, co zdanie w liście.

   CZEMU KRÓCEJ
     Dziesięć minut wystarcza, żeby przełączyć się do poczty, znaleźć list i wrócić. Kod,
     który został w cudzej skrzynce albo w przekazanej dalej wiadomości, przestaje być
     kluczem pięć minut wcześniej — a to jest cała cena tej zmiany.

   WIERSZE JUŻ ISTNIEJĄCE ZOSTAJĄ NIETKNIĘTE
     Ta migracja NIE robi `update` na `verification_codes`. Kody wystawione przed nią
     zachowują swój `expires_at` — doczekają swoich piętnastu minut i wygasną same.
     Przepisanie im terminu w dół unieważniłoby kody, które ktoś właśnie ma otwarte w
     skrzynce i wpisuje na stronie: człowiek zobaczyłby odmowę w połowie czynności, której
     nikt mu nie przerwał. Domyślna wartość kolumny dotyczy wyłącznie wierszy przyszłych.

   ---------------------------------------------------------------------------
   2. ZGŁOSZENIE SPONSORA: TABELA, KTÓREJ DOTĄD NIE BYŁO
   ---------------------------------------------------------------------------
   PO CO
     Do tej pory `sponsorLead` w Workerze nie zapisywał niczego: zgłoszenie szło WhatsAppem
     i mailem, i żyło w cudzej skrzynce. Wystarczało, dopóki zgłoszenie było czterema
     polami tekstu. Teraz kreator w czacie zbiera także LOGO i ODSYŁACZ do strony — czyli
     plik w prywatnym buckecie i adres, który ma trafić na stronę główną pod kafelkiem
     sponsora. Plik bez wiersza w bazie to obiekt w buckecie, o którym nikt nie wie, a
     odsyłacz przepisywany ręcznie z maila do panelu to literówka w linku, który klika całe
     miasteczko.

     Stąd `sponsor_submissions`: lista zgłoszeń ze stanem (`pending` → `approved` /
     `rejected`), z której panel zatwierdza jednym kliknięciem, a zatwierdzenie dopisuje
     sponsora do `site_settings.sponsors`.

   DLACZEGO STATUS, A NIE USUWANIE ODRZUCONYCH
     Odrzucone zgłoszenie jest odpowiedzią na pytanie „czy oni się już zgłaszali" — a to
     pytanie pada przy każdym telefonie od firmy, która pisała pół roku temu. Usunięcie
     wiersza zamienia tę odpowiedź w „nie wiem".

   PRYWATNOŚĆ
     To są dane osobowe firmy i osoby kontaktowej, więc tabela jest zamknięta dokładnie tak
     samo jak `site_visits` z 0033: RLS włączone, `revoke all` dla `anon` i `authenticated`,
     wejście wyłącznie kluczem `service_role` z Workera. Bez RLS tabela w projekcie z
     publicznym kluczem `anon` byłaby listą telefonów do odczytania z przeglądarki.

   ŚCIEŻKA LOGO, NIE PLIK I NIE ADRES
     `logo_path` trzyma ścieżkę w PRYWATNYM buckecie (`sponsors/<uuid>.jpg`, ten sam folder,
     do którego wgrywa logo `settings-admin`). Nie bajty — baza nie jest magazynem plików —
     i nie podpisany adres, bo ten wygasa po godzinie i wiersz z nim byłby wierszem z
     martwym linkiem. Podpis robi Worker przy odczycie.

   POWTARZALNOŚĆ
     Cały plik da się puścić dwa razy: tabela i indeksy przez `if not exists`, kolumny przez
     `add column if not exists`, a więz `check` przez „znajdź nazwę w `pg_constraint`,
     zdejmij, założ" — bo `alter table ... add constraint` nie ma `IF NOT EXISTS` i drugi
     przebieg kończyłby się `duplicate_object`. Nazwa więzu jest SZUKANA W KATALOGU, a nie
     wpisana z pamięci: na cudzej instalacji Postgres mógł nadać inną i `drop constraint`
     wywaliłby całą migrację. Ten sam wzorzec co w 0016, 0018, 0032 i 0034.
   ========================================================================== */

/* --------------------------------------------------------------------- 1. TTL kodu */

alter table public.verification_codes
  alter column expires_at set default now() + interval '10 minutes';

comment on column public.verification_codes.expires_at is
  'Dziesiec minut. Worker liczy te wartosc jawnie (CODE_TTL_MINUTES w worker/index.js); '
  'ten domysl jest siatka dla wstawek, ktore poszlyby z pominieciem Workera. Wiersze '
  'wystawione przed migracja 0035 zachowuja swoje pietnascie minut i wygasaja same.';

comment on table public.verification_codes is
  'Krotkotrwale kody wysylane mailem, zeby dowiesc, ze ktos czyta skrzynke, o ktora pyta. '
  'Hashowane, piec prob, dziesiec minut. Klucz service_role jest jedynym wejsciem.';

/* ----------------------------------------------------- 2. zgłoszenia sponsorów */

create table if not exists public.sponsor_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  /* Nazwa, która ma stanąć pod logo na stronie. To jest nazwa firmy albo nazwa carruleddhu
     z nazwą sponsora — jedno pole, bo zgłaszający podaje jedną nazwę i nie ma jak się
     domyślić, którą z dwóch ma na myśli. */
  cart_name text not null,

  /* Imię i nazwisko OSOBNO. „Na kogo mam pytać" jest pierwszą rzeczą, której brakowało w
     zgłoszeniach z samą nazwą firmy; dzielenie tego z powrotem z jednego pola po pierwszym
     odstępie myli nazwiska dwuczłonowe. */
  first_name text not null,
  last_name text not null,

  /* Adres jest OBOWIĄZKOWY i potwierdzony kodem przed zapisem (patrz sponsorLead). Bez
     niego zgłoszenie jest zgłoszeniem, na które nie da się odpowiedzieć. */
  email text not null check (position('@' in email) > 1),
  phone text,

  /* Język rozmowy, w którym poszło potwierdzenie — żeby odpowiedź organizatora nie
     przychodziła w innym języku niż cała dotychczasowa korespondencja. */
  locale text,

  /* Ścieżka w prywatnym buckecie `wall-photos`, folder `sponsors/` — ten sam, którego
     używa `settings-admin` przy wgrywaniu logo z panelu. Puste, gdy zgłaszający logo nie
     dał: obraz jest opcjonalny, bo firma bez gotowego pliku ma się móc zgłosić mimo to. */
  logo_path text,

  /* Strona albo profil w mediach społecznościowych. Tylko `https://`, sprawdzane w
     Workerze przed zapisem — ten napis trafia po zatwierdzeniu do atrybutu `href` na
     stronie głównej, więc `javascript:` w nim nie jest literówką do posprzątania potem. */
  site_url text,

  /* `pending` → `approved` albo `rejected`. Lista wartości stoi w więzie niżej. */
  status text not null default 'pending',
  /* Kiedy organizator rozstrzygnął. Puste, dopóki zgłoszenie czeka — czyli to samo pole
     odpowiada na „czy już ktoś to widział" i na „kiedy". */
  decided_at timestamptz
);

/* --------------------------------------------------------------------- więz */
do $$
begin
  /* Trzy wartości i ani jednej więcej. Więz zdejmowany i zakładany od nowa, bo `check` nie
     da się zmienić w miejscu, a lista mogła w poprzednim przebiegu wyglądać inaczej.
     Nazwa szukana w katalogu — uzasadnienie w nagłówku. */
  if exists (
    select 1 from pg_constraint
     where conname = 'sponsor_submissions_status_check'
       and conrelid = 'public.sponsor_submissions'::regclass
  ) then
    alter table public.sponsor_submissions drop constraint sponsor_submissions_status_check;
  end if;

  alter table public.sponsor_submissions
    add constraint sponsor_submissions_status_check
    check (status in ('pending', 'approved', 'rejected'));
end;
$$;

/* Jedyne dwa zapytania, jakie ta tabela obsługuje: „co czeka" i „wszystko od najnowszych".
   Oba po czasie malejąco, bo panel pokazuje listę w tej kolejności. */
create index if not exists sponsor_submissions_created_idx
  on public.sponsor_submissions (created_at desc);
/* Indeks częściowy z predykatem STAŁYM. `now()` w `where` odrzuciłoby migrację błędem 42P17
   i byłoby kłamliwe — patrz nagłówek 0033. `status = 'pending'` jest niezmienne. */
create index if not exists sponsor_submissions_pending_idx
  on public.sponsor_submissions (created_at desc)
  where status = 'pending';

comment on table public.sponsor_submissions is
  'Zgloszenia sponsorow z czatu, ze stanem pending/approved/rejected. Dane osobowe firmy '
  'i osoby kontaktowej: wejscie tylko kluczem service_role z Workera.';
comment on column public.sponsor_submissions.logo_path is
  'Sciezka w prywatnym buckecie wall-photos, folder sponsors/. Nie bajty i nie podpisany '
  'adres: podpis wygasa po godzinie, wiec robi go Worker przy odczycie.';
comment on column public.sponsor_submissions.site_url is
  'Strona albo profil sponsora. Tylko https:// — sprawdzane w Workerze, bo po zatwierdzeniu '
  'ten napis staje w atrybucie href na stronie glownej.';
comment on column public.sponsor_submissions.status is
  'pending / approved / rejected. Odrzucone zgloszenia ZOSTAJA: odpowiadaja na pytanie '
  '"czy oni sie juz zglaszali", ktore pada przy kazdym telefonie od firmy.';

/* ---------------------------------------------------------------------- RLS
   Tak samo jak `site_visits` w 0033: zapis i odczyt wyłącznie przez Workera z kluczem
   `service_role`, anon i authenticated nie mają tu nic do roboty w żadną stronę. Bez tego
   tabela w projekcie z publicznym kluczem `anon` byłaby listą telefonów do wyciągnięcia
   z przeglądarki. */
alter table public.sponsor_submissions enable row level security;
revoke all on public.sponsor_submissions from anon, authenticated;
