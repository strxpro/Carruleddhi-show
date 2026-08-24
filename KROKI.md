# CO MASZ ZROBIĆ — PO KOLEI

Kolejność nie jest przypadkowa. Każdy krok potrzebuje tego, co zrobiłeś wcześniej.
Nie przeskakuj.

---

## KROK 1 — BAZA DANYCH (SUPABASE)

Wejdź na swój projekt → **SQL Editor** → **New query**.

Wklej i uruchom **trzy pliki, w tej kolejności**:

1. `supabase/migrations/0001_wall_comments.sql`
2. `supabase/migrations/0002_event_data.sql`
3. `supabase/migrations/0003_wall_media.sql`

Za każdym razem: wklej → **Run** → poczekaj na zielone.

**Kolejność ma znaczenie.** Plik 3 dodaje kolumny do tabeli, którą tworzy plik 1.
Odwrotnie się nie uda.

---

## KROK 2 — DWA KLUCZE Z SUPABASE

W Supabase: **Settings → API**. Skopiuj do notatnika:

- **Project URL** — wygląda jak `https://abcdefgh.supabase.co`
- **service_role key** — długi klucz, ten **pod** `anon`

**NIE WKLEJAJ TEGO NIGDZIE NA STRONĘ ANI DO CZATU.** Ten klucz omija wszystkie
zabezpieczenia bazy. Idzie wyłącznie do Cloudflare w kroku 3.

---

## KROK 3 — WORKER (CLOUDFLARE)

W katalogu projektu:

```powershell
powershell -ExecutionPolicy Bypass -File tools\deploy-worker.ps1
```

Skrypt zbuduje stronę, wdroży Workera i **sam zapyta o sekrety**. Podaj:

| Sekret | Co wpisać |
|---|---|
| `SUPABASE_URL` | Project URL z kroku 2 |
| `SUPABASE_SERVICE_KEY` | service_role key z kroku 2 |
| `WALL_SALT` | cokolwiek długiego i losowego, np. 30 znaków z klawiatury |
| `ROSTER_KEY` | hasło, które **Ty** wymyślasz — będziesz je wpisywał w panelu admina |
| `MAKE_WEBHOOK_URL` | `https://hook.eu1.make.com/2stphbryuh84wzer92leg7fgub1aikqg` |

Po wdrożeniu skrypt pokaże adres Workera. Zapisz go.

**Sprawdzenie bez wdrażania:** ten sam skrypt z `-CheckOnly`.

---

## KROK 4 — PANEL ADMINA: ENDPOINTY

Otwórz `admin.html` → sekcja **06 Integracje**. Wpisz w **sześć** pól:

```
/api/carruleddhi/registration
/api/carruleddhi/reminder
/api/carruleddhi/attendance
/api/carruleddhi/counts
/api/carruleddhi/contact
/api/carruleddhi/wall
```

Kliknij **Zapisz draft**. Licznik w diagnostyce powinien pokazać **6/6**.

Ostatnie pole (**Tablica**) jest nowe — bez niego sekcja z komentarzami zostaje
w trybie demo i nic nie zapisuje.

---

## KROK 5 — ARKUSZ GOOGLE: PIĘĆ ZMIAN

Karta **`Registrations`**:

1. Komórka **F1**: zamień `tax_code` na `postal_code`
2. Komórka **B2**, wklej dokładnie to:

```
=ARRAYFORMULA(IF(C2:C<>""; ROW(C2:C)-1; ""))
```

3. **NOWE — dziesięć kolumn dla niepełnoletnich.** Kliknij komórkę **W1** i wklej
   ten jeden wiersz (to są tabulatory, Google sam rozbije na dziesięć kolumn
   W–AF):

```
is_minor	rider_age	child_kind	guardian_relation	guardian_name	guardian_email	guardian_phone	mother_name	father_name	guardian_consent
```

   Dopisane **na końcu**, za `printed_at`, więc żadna dotychczasowa kolumna się nie
   przesuwa. Make mapuje po pozycji, nie po nazwie — wstawienie tego w środku
   przesunęłoby wszystko za nim o jedną kolumnę.

Karta **`Reminders`**:

4. Komórka **Q1**: wpisz `last_reminder`

Nowa karta:

5. Utwórz kartę **`Newsletter`** i wklej w **A1**:

```
created_at	name	email	locale	source	status
```

Nagłówków **nie ruszaj poza tym**.

---

## KROK 6 — MAKE: DWA SCENARIUSZE

Pełna instrukcja z obrazkami pól: **`make/JAK-WGRAC.md`**. W skrócie:

1. Make → **Create a new scenario** → trzy kropki → **Import Blueprint**
2. Wybierz `make/blueprint-1-instant.json`
3. Kliknij moduł **1 Webhook** → wskaż swój hook → panel pokaże
   „Listening for data" → **zostaw otwarty**
4. W drugim okienku PowerShell uruchom:

```powershell
powershell -ExecutionPolicy Bypass -File tools\make-webhook-feed.ps1
```

5. Panel przeskoczy na „Successfully determined" → **OK** → **Save**
6. W modułach **Google Sheets** wskaż swój plik i właściwą kartę
7. W modułach **Email** (`8`, `12`, `14`, `16`) dodaj połączenie SMTP — dane niżej.
   `8` to mail do dorosłego, `16` do opiekuna osoby niepełnoletniej; oba wiszą na
   routerze `17` i używają tego samego połączenia.
8. **WAŻNE, DOPÓKI STRONA NIE JEST W SIECI:** moduł **7 (HTTP – Get a file)** →
   prawy przycisk → **Disable**, i w modułach **8** oraz **16** wyczyść pole
   *Attachments*. Inaczej moduł dostanie 404 i **mail nie wyjdzie wcale**.

   Moduł 7 pobiera teraz PDF pod adresem z **`{{6.pdfUrl}}`** — dla dorosłych
   `Carruleddhi-modulo.pdf`, dla niepełnoletnich `Carruleddhi-modulo-minori.pdf`.
   Oba pliki są już w `public/emails/`, więc po wdrożeniu strony działają same.

   Moduł **10 (Webhook response)** zostaw włączony — wyłączenie go nie zepsuje
   maila, ale numer na ekranie przestanie się zgadzać z arkuszem.
9. Przełącznik **ON**
10. To samo z `make/blueprint-2-reminders.json`, plus **Scheduling → Every hour**

### SMTP (OVH / Zimbra)

| Pole | Wartość |
|---|---|
| Email address | `info@carruleddhishow.com` |
| Your full name | `Carruleddhi Show 2026` |
| SMTP server | `ssl0.ovh.net` |
| Port | `465` |
| Use a secure connection (TLS) | **Yes** |
| Use explicit TLS | **No** |
| User name | `info@carruleddhishow.com` |
| Password | hasło do **skrzynki**, nie do panelu OVH |

Na porcie 465 **explicit TLS musi być No**. Ustawienie Yes zawiesza połączenie
i Make zgłasza timeout.

---

## KROK 7 — SPRAWDŹ, ŻE DZIAŁA

Po kolei, na wdrożonej stronie:

1. **Zapis na wyścig** → dostajesz numer startowy i ekran „do zobaczenia",
   a na maila potwierdzenie
2. **„Będę tam"** → licznik rośnie, w kółkach pojawiają się prawdziwe inicjały
3. **Tablica** → napisz wiadomość, dodaj zdjęcie i gwiazdki → strona odpowiada
   „czeka na sprawdzenie" i **nic się nie pokazuje** — tak ma być
4. **Panel admina → sekcja 09 Moderacja** → wpisz hasło `ROSTER_KEY` w sekcji 08
   → **Wczytaj wiadomości** → **Zatwierdź**
5. Odśwież stronę → wiadomość jest na tablicy, ze zdjęciem i gwiazdkami

---

---

## KROK 8 — SPRAWDŹ ŚCIEŻKĘ NIEPEŁNOLETNICH

W formularzu wpisz datę urodzenia, po której **w dniu zjazdu** ktoś nie będzie
mieć 18 lat, np. `04.03.2012`. Powinno się stać to:

1. Pod adresem wyskakuje niebieska ramka **„Zgłoszenie osoby niepełnoletniej"**
   z siedmioma polami i zdaniem „W dniu zjazdu zawodnik będzie mieć 14 lat…"
2. W kroku 3, przy przycisku zgody, pojawia się notka **„Zawodnik niepełnoletni"**
3. Bez zaznaczenia zgody opiekuna formularz **nie wysyła się** i wraca do kroku 1
4. Po wysłaniu mail idzie **na adres opiekuna** (Ty dostajesz kopię Bcc),
   zaczyna się od „Dzień dobry, *imię opiekuna*", mówi „zgłoszenie **Państwa
   córki** Sara" i ma w załączniku `Carruleddhi-minori-041.pdf`
5. Wpisz `17.10.2008` — dokładnie 18 lat w dniu zjazdu — ramka **znika**.
   To granica: liczy się wiek w dniu zjazdu, nie dzisiejszy.

---

## CZEGO JESZCZE NIE MA

- **Kino trasy.** Zdjęcie zjazdu wjeżdżające na środek, rozszerzające się,
  z wózkiem jadącym do mety.
- **Preloader, header, flaga, menu, teleport w loaderze** — zgłoszone przez Ciebie,
  następna tura.
