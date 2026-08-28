# Kiro ↔ MCP ↔ Make.com — konfiguracja

> ## ⚠️ TEN PLIK JEST NIEAKTUALNY. NIE IDŹ ZA NIM.
>
> Opisuje architekturę, której już nie ma: Cloudflare Workers (jest Vercel), Arkusze Google
> (jest Supabase), Brevo (jest SMTP OVH), pole `taxCode` (jest `postalCode`), pięć endpointów
> (jest kilkanaście), dwa scenariusze w Make (jest jeden).
>
> **Aktualne instrukcje:**
> - `START-TUTAJ.md` — cała konfiguracja od zera, osiem kroków
> - `make/JAK-WGRAC.md` — scenariusz w Make, krok po kroku
> - `make/PROMPT-DLA-AI.md` — to samo jako prompt dla asystenta
>
> Zostaje tylko dla jednej rzeczy: sekcja 1 poniżej nadal poprawnie opisuje, jak podłączyć
> serwer MCP Make. Reszty nie czytaj.
>
> **I jedna rzecz, którą warto z tego wiedzieć:** serwer MCP Make daje zakresy
> `scenarios:read` i `scenarios:run` — czyta i uruchamia. **Nie tworzy scenariuszy i nie
> ustawia połączeń.** Pokazuje też tylko scenariusze w trybie *On demand*, a nasz jest na
> webhooku, więc na liście narzędzi się nie pojawi. Żadne AI nie zbuduje tego scenariusza
> przez MCP — import blueprintu jest jedyną drogą i jest szybszy.

Ten dokument opisuje, co jest już w repo i co musisz jeszcze uzupełnić, żeby łańcuch
**strona → proxy → Make → Sheets/Brevo** działał, a ja mógł uruchamiać Twoje scenariusze
przez MCP.

---

## 0. Najpierw bezpieczeństwo

Token MCP i klucz API zostały wklejone w czacie, więc traktuj je jako ujawnione.

1. Make → **Profile → API access** → usuń stary klucz, wygeneruj nowy z zakresami
   `scenarios:read` i `scenarios:run`.
2. Make → **MCP tokens** → unieważnij stary token, wygeneruj nowy.
3. Nowe wartości wklej do `.kiro/settings/mcp.json` (ten plik jest w `.gitignore`).

`.kiro/settings/mcp.example.json` to wersja bez sekretów — ta może iść do repo.

---

## 1. MCP: dwa warianty

### Wariant A — lokalny serwer stdio (już skonfigurowany)

`.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "make": {
      "command": "npx",
      "args": ["-y", "@makehq/mcp-server"],
      "env": {
        "MAKE_API_KEY": "<nowy klucz API>",
        "MAKE_ZONE": "eu1.make.com",
        "MAKE_TEAM": "<id zespołu>"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

Co musisz podmienić:

| Zmienna | Gdzie ją znaleźć |
|---|---|
| `MAKE_API_KEY` | Make → Profile → API access → Add token |
| `MAKE_ZONE` | domena w pasku adresu, np. `eu1.make.com`, `eu2.make.com`, `us1.make.com` |
| `MAKE_TEAM` | liczba w URL strony **Team**, np. `/team/123456/dashboard` → `123456` |

Wymaga zainstalowanego Node.js (`npx` musi działać w terminalu).

**Ważne:** ten serwer udostępnia jako narzędzia tylko te scenariusze, które mają
harmonogram ustawiony na **On demand**. Scenariusz z webhookiem albo z harmonogramem
czasowym się nie pojawi. Dlatego scenariusze, którymi mam sterować, ustaw na *On demand*
i dodaj im moduł **Webhook response**, aby zwracały wynik.

### Wariant B — hostowany serwer MCP Make

Make ma też wersję chmurową sterowaną tokenem MCP (tym drugim ciągiem, który wysłałeś).
Tam nie podaje się `command`/`args`, tylko URL serwera w formacie
`https://<MAKE_ZONE>/mcp/api/v1/u/<token>/stateless` — konfigurujesz go jako zdalny
serwer MCP, jeśli Twój klient go obsługuje. Dokumentacja:
[developers.make.com/mcp-server](https://developers.make.com/mcp-server).
Wariant A jest pewniejszy w Kiro, bo używa dokumentowanego schematu `command`/`env`.

### Sprawdzenie

Po zapisaniu pliku odśwież serwer z panelu MCP w Kiro (albo paleta komend → `MCP`).
Potem po prostu napisz mi „wylistuj scenariusze Make” — spróbuję wywołać narzędzie.
Jeśli lista jest pusta, sprawdź kolejno: `MAKE_TEAM`, zakresy klucza, tryb *On demand*.

---

## 2. Dlaczego strona nie gada z Make bezpośrednio

`assets/js/site-config.js` przyjmuje w `endpoints` **wyłącznie** puste stringi albo ścieżki
`/api/carruleddhi/...`. Wklejenie tam `https://hook.eu1.make.com/...` zostanie po cichu
odrzucone. To celowe: publiczny webhook każdy odczyta z kodu strony i zaspamuje Ci kredyty.

Ruch idzie tak:

```
przeglądarka  →  POST /api/carruleddhi/<typ>  →  Cloudflare Worker  →  webhook Make
                                                  ↑
                                    MAKE_WEBHOOK_URL jako secret
```

---

## 3. Uruchomienie proxy

Katalog `worker/` zawiera gotowy Worker. Robi walidację pól, białą listę kluczy,
limit długości, opcjonalny Turnstile i opcjonalny limit żądań na IP.

```powershell
# 1. build strony (Worker serwuje ./dist)
npm run build

# 2. sekret z adresem webhooka Make
cd worker
npx wrangler secret put MAKE_WEBHOOK_URL

# 3. opcjonalnie: klucz serwer-serwer i Turnstile
npx wrangler secret put INTAKE_SHARED_KEY
npx wrangler secret put TURNSTILE_SECRET

# 4. opcjonalnie: limit żądań w KV
npx wrangler kv namespace create RATE_LIMIT
#    id z odpowiedzi wklej do wrangler.toml i odkomentuj sekcję [[kv_namespaces]]

# 5. deploy
npx wrangler deploy
```

Lokalny test bez deployu: skopiuj `worker/.dev.vars.example` na `worker/.dev.vars`,
wpisz webhook i uruchom `npx wrangler dev`.

Po wdrożeniu wpisz w panelu admina (`admin.html`, sekcja 06) ścieżki:

```
/api/carruleddhi/registration
/api/carruleddhi/reminder
/api/carruleddhi/attendance
/api/carruleddhi/counts
/api/carruleddhi/contact
```

Status obok każdego pola zmieni się na **Proxy aktywne**. Puste pole = tryb demo,
formularz działa lokalnie i nic nie wysyła.

Do produkcji te same ścieżki wpisz też w `window.CARRULEDDHI_CONFIG.endpoints`
na końcu `index.html` — draft z panelu działa tylko z `?configPreview=1`.

---

## 4. Co Worker wysyła do Make

Zawsze JSON, tylko pola z białej listy, `type` brany ze ścieżki URL (nie z ciała żądania):

```json
{
  "type": "registration",
  "event": "Carruleddhi Show 2026",
  "eventDate": "2026-10-17T14:30:00+02:00",
  "locale": "it",
  "source": "website",
  "submittedAt": "2026-08-21T10:00:00.000Z",
  "firstName": "…", "lastName": "…", "birthDate": "…", "taxCode": "…",
  "email": "…", "phone": "…", "address": "…",
  "cartName": "…", "category": "classic", "teamName": "…", "cartNotes": "…",
  "rulesConsent": true, "privacyConsent": true, "newsConsent": false
}
```

Odrzucane z góry, bez trafienia do Make:

| Kod | Znaczenie |
|---|---|
| `UNKNOWN_TYPE` | typ poza `registration/reminder/attendance/contact/counts` |
| `VALIDATION_FAILED` | brak wymaganych pól, zły e-mail, brak zgody |
| `PAYLOAD_TOO_LARGE` | ciało > 16 kB |
| `RATE_LIMITED` | > 6 żądań danego typu z jednego IP w 10 minut |
| `CAPTCHA_FAILED` | Turnstile włączony, token nieprawidłowy |

Strona oczekuje odpowiedzi JSON. Dla rejestracji Make powinien zwrócić
`{"ok": true, "raceNumber": "039"}` — wtedy numer startowy na stronie jest prawdziwy,
a nie policzony lokalnie.

Reszta scenariuszy (router, arkusze, PDF, Brevo, przypomnienia) jest opisana
w `MAKE-PLAN.md` i się nie zmieniła.

---

## 5. Kolejność, w której to składasz

1. Zrotuj token i klucz, wpisz nowe do `.kiro/settings/mcp.json`, dodaj `MAKE_TEAM`.
2. Odśwież serwer MCP, poproś mnie o listę scenariuszy.
3. W Make zbuduj scenariusz `Carruleddhi 2026 — Intake API` z Custom webhook + routerem.
4. `npm run build`, `wrangler secret put MAKE_WEBHOOK_URL`, `wrangler deploy`.
5. Wpisz ścieżki `/api/carruleddhi/...` w `index.html` i w panelu admina.
6. Przejdź checklistę z sekcji 14 w `MAKE-PLAN.md`.

Treści z dokumentacji dostawców zostały sparafrazowane. Limity, ceny i nazwy pól
mogą się zmienić — sprawdź je u źródła przed startem produkcyjnym.
