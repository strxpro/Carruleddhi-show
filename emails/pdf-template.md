# Szablon PDF zgłoszenia — Google Docs

Jeden dokument, jeden zestaw placeholderów, dwie kopie na wyjściu:
**IT** (do wydruku i podpisu) oraz **kopia w języku uczestnika** (tylko do zrozumienia treści).

## Jak to złożyć w Google Docs

1. Utwórz dokument `Carruleddhi 2026 — modulo iscrizione [TEMPLATE]`.
2. Wklej treść z sekcji „Treść IT" poniżej.
3. Nagłówki i etykiety, które mają się tłumaczyć, zapisz jako placeholdery `{{L_...}}`.
   Wartości uczestnika to `{{...}}` bez prefiksu — one nigdy się nie tłumaczą.
4. Zrób kopię dokumentu jako `... [TEMPLATE-TRANSLATED]` — identyczny układ,
   ale ma dodatkowy pasek ostrzeżenia u góry (patrz niżej).
5. W Make oba dokumenty obsługuje **ten sam** moduł Google Docs, wywołany dwa razy
   przez Iterator — szczegóły w `MAKE-SINGLE-SCENARIO.md`.

## Placeholdery wartości (nie tłumaczą się)

```
{{RACE_NUMBER}}   {{FULL_NAME}}    {{BIRTH_DATE}}   {{POSTAL_CODE}}
{{ADDRESS}}       {{EMAIL}}        {{PHONE}}
{{CART_NAME}}     {{CATEGORY}}     {{TEAM}}         {{CART_NOTES}}
{{SUBMITTED_AT}}  {{GENERATED_AT}} {{LOCALE_UPPER}}
```

## Placeholdery etykiet (podmieniane per język)

```
{{L_DOC_TITLE}}  {{L_SECTION_RIDER}}  {{L_SECTION_CART}}  {{L_SECTION_DECL}}
{{L_FULL_NAME}}  {{L_BIRTH_DATE}}     {{L_POSTAL_CODE}}      {{L_ADDRESS}}
{{L_EMAIL}}      {{L_PHONE}}          {{L_CART_NAME}}     {{L_CATEGORY}}
{{L_TEAM}}       {{L_NOTES}}          {{L_NUMBER}}        {{L_DECL_BODY}}
{{L_SIGN_PLACE}} {{L_SIGN_DATE}}      {{L_SIGN_RIDER}}    {{L_SIGN_GUARDIAN}}
{{L_MINOR_NOTE}} {{L_FOOTER}}         {{L_TRANSLATION_WARNING}}
```

---

## Treść IT (układ dokumentu)

```
                                             ┌──────────────────┐
CARRULEDDHI SHOW 2026                        │  N. {{RACE_NUMBER}}  │
17 ottobre 2026 · Santa Teresa Gallura (SS)  └──────────────────┘

{{L_DOC_TITLE}}

── {{L_SECTION_RIDER}} ─────────────────────────────────────────────
{{L_FULL_NAME}}:   {{FULL_NAME}}
{{L_BIRTH_DATE}}:  {{BIRTH_DATE}}
{{L_POSTAL_CODE}}:    {{POSTAL_CODE}}
{{L_ADDRESS}}:     {{ADDRESS}}
{{L_EMAIL}}:       {{EMAIL}}
{{L_PHONE}}:       {{PHONE}}

── {{L_SECTION_CART}} ──────────────────────────────────────────────
{{L_CART_NAME}}:   {{CART_NAME}}
{{L_CATEGORY}}:    {{CATEGORY}}
{{L_TEAM}}:        {{TEAM}}
{{L_NOTES}}:       {{CART_NOTES}}

── {{L_SECTION_DECL}} ─────────────────────────────────────────────
{{L_DECL_BODY}}

{{L_MINOR_NOTE}}

{{L_SIGN_PLACE}} ______________________   {{L_SIGN_DATE}} ____________

{{L_SIGN_RIDER}}                          {{L_SIGN_GUARDIAN}}

______________________________            ______________________________

{{L_FOOTER}}
```

## Treść IT etykiet

| Placeholder | Wartość IT |
|---|---|
| `L_DOC_TITLE` | Modulo di iscrizione — da consegnare firmato |
| `L_SECTION_RIDER` | DATI DEL PILOTA |
| `L_SECTION_CART` | DATI DEL MEZZO |
| `L_SECTION_DECL` | DICHIARAZIONE E LIBERATORIA |
| `L_FULL_NAME` | Nome e cognome |
| `L_BIRTH_DATE` | Data di nascita |
| `L_POSTAL_CODE` | CAP |
| `L_ADDRESS` | Indirizzo |
| `L_EMAIL` | E-mail |
| `L_PHONE` | Telefono |
| `L_CART_NAME` | Nome del carruleddhu |
| `L_CATEGORY` | Categoria |
| `L_TEAM` | Team |
| `L_NOTES` | Note sul mezzo |
| `L_NUMBER` | Numero di partenza |
| `L_SIGN_PLACE` | Luogo |
| `L_SIGN_DATE` | Data |
| `L_SIGN_RIDER` | Firma del pilota |
| `L_SIGN_GUARDIAN` | Firma del genitore o tutore (se minorenne) |
| `L_MINOR_NOTE` | I minori partecipano esclusivamente con liberatoria firmata da un genitore o tutore legale. |
| `L_FOOTER` | Documento generato automaticamente il {{GENERATED_AT}} — Carruleddhi Show 2026, Shardana Nuragici e Comitato FIDALI 82. |

### `L_DECL_BODY` (IT)

> Il sottoscritto dichiara di aver letto e di accettare integralmente il regolamento
> dell'evento, di partecipare volontariamente e sotto la propria responsabilità, di
> utilizzare un casco omologato per tutta la durata della discesa e di sottoporre il
> mezzo al controllo tecnico prima della partenza. Dichiara inoltre di essere in
> condizioni psicofisiche idonee e di acconsentire al trattamento dei dati personali
> per la gestione dell'iscrizione, secondo l'informativa privacy pubblicata sul sito.

> **Uwaga prawna:** treść deklaracji i liberatorii musi zostać zatwierdzona przez
> ubezpieczyciela i prawnika organizatora przed publikacją. Powyższy tekst jest
> propozycją redakcyjną, nie opinią prawną.

---

## Kopia przetłumaczona — dodatkowy pasek

W wariancie `[TEMPLATE-TRANSLATED]` na samej górze, przed nagłówkiem:

```
╔══════════════════════════════════════════════════════════════════╗
║  {{L_TRANSLATION_WARNING}}                                       ║
╚══════════════════════════════════════════════════════════════════╝
```

`L_TRANSLATION_WARNING` per język:

| Język | Treść |
|---|---|
| it | Copia di cortesia. Consegna e firma solo la versione italiana. |
| pl | Kopia informacyjna. Do podpisu i oddania służy wyłącznie wersja włoska. |
| en | Courtesy copy. Only the Italian version is to be signed and handed in. |
| de | Übersetzung zur Information. Nur die italienische Fassung wird unterschrieben und abgegeben. |
| es | Copia informativa. Solo la versión italiana se firma y se entrega. |
| fr | Copie de courtoisie. Seule la version italienne doit être signée et remise. |

Plik `emails/copy.json` zawiera te same komunikaty w kluczu `regPrintBody`,
żeby mail i PDF mówiły dokładnie to samo.

## Etykiety w pozostałych językach

Tłumaczenia etykiet `L_*` trzymaj w **tym samym** module `Set variable` co teksty maili
(sekcja `labels` w `emails/copy.json`). Nazwy pól w `copy.json` odpowiadają
placeholderom: `labels.fullName` → `{{L_FULL_NAME}}`, `labels.birthDate` → `{{L_BIRTH_DATE}}` itd.

Dwie etykiety są celowo NIEtłumaczone również w kopii przetłumaczonej, bo to nazwy
własne dokumentów urzędowych: `Codice fiscale` oraz `Carruleddhu`.
