# Telegram — specyfikacja endpointu dla toru A

Pisane przez tor D (Make), do wykonania przez tor A, bo cała robota jest w `worker/index.js`,
a ten plik należy do toru A. Stan na 29.08.2026.

---

## Zanim cokolwiek: token jest spalony

Token bota był trzykrotnie wklejony do czatu. Trzeba `/revoke` u @BotFather i wydać nowy.

Nowy token **nie ma prawa** trafić do repo, do czatu ani do blueprintu Make. Idzie sekretem
workera:

    wrangler secret put TELEGRAM_BOT_TOKEN
    wrangler secret put TELEGRAM_CHAT_ID
    wrangler secret put TELEGRAM_WEBHOOK_SECRET

Trzeci to dowolny losowy ciąg — do czego służy, niżej.

---

## Dlaczego wariant A, a nie przez Make

Moduł `telegram:WatchUpdates` w Make **nie oddaje pola `reply_to_message`**. Sprawdzone w
schemacie modułu. A na tym polu stoi cały pomysł: organizator odpisuje gościowi, robiąc
Reply na powiadomieniu w grupie. Bez `reply_to_message` nie da się ustalić, do którego
wątku należy odpowiedź — zostałoby zgadywanie po treści.

Więc Telegram woła worker bezpośrednio.

---

## Zmierzone: dziś na Telegram nie idzie NIC

`notifyChatTelegram()` (`worker/index.js`, ok. 1098) wysyła do Make:

```js
{ type: 'chat-telegram', branch: 'chat-telegram', threadId, name, email, locale, message }
```

**W scenariuszu 7084177 nie ma trasy `chat-telegram`.** Router ma osiem tras
(`registration-adult-it`, `registration-adult-xx`, `registration-minor-it`,
`registration-minor-xx`, whatsapp ×2, `reminder`, `contact`, `outbox`) plus dodaną dziś
`voting-receipt`. Payload z `branch: 'chat-telegram'` wpada w router i wypada bez żadnego
modułu — jedna operacja, zielony przebieg, zero skutku.

To jest ta sama klasa błędu, o której mówi `ZADANIA-ROWNOLEGLE.md`: funkcja zgłasza sukces
i nic nie robi. `sendToMake()` zwraca `response.ok`, a Make faktycznie odpowiada 200 —
przyjął webhooka. Tylko nikt go potem nie obsłużył.

---

## Zalecenie: wyrzucić Make z tej ścieżki w obie strony

Skoro wejście i tak omija Make, to trzymanie wyjścia w Make daje jedną korzyść (nie trzeba
pisać `fetch`) i trzy koszty: operacje Make na każdą wiadomość, drugie miejsce, w którym
mieszka konfiguracja Telegrama, i asymetria, przez którą przy debugowaniu połowa ścieżki
jest w innym systemie.

**Propozycja:** `notifyChatTelegram()` woła Telegrama wprost, zamiast `sendToMake()`.
Wtedy trasa `chat-telegram` w Make jest niepotrzebna i nie zakładam jej. Jeśli tor A
zdecyduje inaczej — powiedz, dołożę trasę, ale wtedy potrzebne jest połączenie Telegrama
w Make, czyli token także tam.

---

## Wyjście: powiadomienie z ukrytym znacznikiem wątku

`sendMessage` na `TELEGRAM_CHAT_ID`, `parse_mode: 'HTML'`. Znacznik wątku wjeżdża w treść
jako niewidoczny link — Telegram oddaje go z powrotem w `reply_to_message.text`, a
człowiek go nie widzi:

```
<a href="https://www.carruleddhishow.com/admin#t=THREADID">⁠</a>
```

Alternatywa bez sztuczek HTML: trzymać w bazie mapowanie `telegram_message_id → thread_id`
(kolumna w `chat_threads` albo mała tabelka). Czystsze, ale to migracja, a znacznik w
treści działa bez zmiany schematu. Wybór należy do toru A.

**Nie opierać się na parsowaniu widocznej treści** (np. wyciąganiu maila z linijki `✉️`).
Wątek bez adresu nie ma po czym być rozpoznany, a dwóch gości z jednego adresu rozjedzie
się w złe miejsce.

---

## Wejście: nowa trasa w workerze

Telegram nie wyśle ani tokenu Turnstile, ani nagłówka `X-Carruleddhi-Roster`. Dlatego ta
trasa **musi być obsłużona zanim** payload wejdzie w maszynerię `ALLOWED_TYPES` /
`PROTECTED_TYPES` / `turnstileOk()` — inaczej wpadnie na `CAPTCHA_FAILED`.

Miejsce: w `fetch()`, zaraz po ustaleniu `pathType`, obok wyjątku na `GET /form`.

```js
if (request.method === 'POST' && pathType === 'telegram') {
  return telegramWebhook(env, request, cors);
}
```

### Uwierzytelnienie

Telegram przy `setWebhook` przyjmuje `secret_token` i odsyła go w każdym żądaniu jako
nagłówek `X-Telegram-Bot-Api-Secret-Token`. To jest jedyna zapora — adres endpointu jest
publiczny.

```js
if (!secretsMatch(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),
                  env.TELEGRAM_WEBHOOK_SECRET)) {
  return json({ ok: false, code: 'TELEGRAM_UNAUTHORISED' }, 401, cors);
}
```

`secretsMatch()` już jest w pliku (ok. 5055) i porównuje w stałym czasie. Użyć jej, nie `===`.

Dodatkowo odrzucić wiadomości spoza `TELEGRAM_CHAT_ID` — nawet z poprawnym sekretem.

### Co robić z aktualizacją

```
update.message.reply_to_message  →  brak: zignorować, zwrócić 200
                                 →  jest: wyciągnąć THREADID ze znacznika
update.message.text              →  pusty: zignorować, zwrócić 200
```

Znaleziony wątek → wstawić wiersz do `chat_messages`:

```js
{ thread_id, author: 'organiser', source: 'telegram', body }
```

**Uwaga na nazwy.** Specyfikacja krążąca w promptach mówi `session_id` i `sender: 'user'`.
W tej bazie jest `thread_id` i `author` z wartościami `visitor | ai | organiser`. Zgodnie
z migracją, nie z promptem.

Po zapisie: `setThreadMode(env, thread_id, 'human')` — organizator wszedł do rozmowy, więc
bot ma zamilknąć. To jest to samo przejście, które dziś powoduje objaw „AI nie odpowiada"
i które A1 rozbraja przyciskiem „zakończ rozmowę".

### Zawsze 200

Telegram powtarza aktualizację, na którą dostał błąd, i potrafi w ten sposób zablokować
kolejkę webhooka. Każdy przypadek, którego nie obsługujemy — wiadomość nie-Reply, sticker,
edycja, wejście do grupy — kończy się `200 { ok: true, skipped: '...' }`, nie błędem.
Wyjątkiem jest 401 z sekretu: tam powtórka i tak nie pomoże, a cichy 200 ukrywałby, że
ktoś puka.

---

## Rejestracja webhooka

Po wdrożeniu workera, raz, ręcznie:

```
POST https://api.telegram.org/bot<TOKEN>/setWebhook
{
  "url": "https://www.carruleddhishow.com/api/carruleddhi/telegram",
  "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
  "allowed_updates": ["message"]
}
```

Sprawdzić skutek, nie odpowiedź: `getWebhookInfo` ma pokazać ten adres,
`pending_update_count: 0` i puste `last_error_message`. Samo `{"ok":true}` z `setWebhook`
znaczy tylko tyle, że Telegram przyjął zgłoszenie.

---

## Test, który naprawdę coś dowodzi

1. Gość pisze na czacie na stronie → wiadomość ląduje w grupie na Telegramie.
2. Reply na tej wiadomości w Telegramie.
3. `select author, source, body from chat_messages order by created_at desc limit 1`
   — ma być wiersz `organiser` / `telegram` z tą treścią.
4. Okno czatu gościa pokazuje odpowiedź przy najbliższym `poll`.

Punkt 3 jest tym punktem. Bez niego „działa" znaczy „nie wyrzuciło błędu".
