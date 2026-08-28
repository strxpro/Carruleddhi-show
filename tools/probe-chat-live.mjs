/**
 * Odpytuje żywy czat na produkcji: open, send, poll — po kolei, jednym tokenem.
 *
 *     node tools/probe-chat-live.mjs
 *     node tools/probe-chat-live.mjs https://www.carruleddhishow.com
 *
 * PO CO
 *   „Czat nie odpowiada na pytania, które ma w słowniku" ma dwie zupełnie różne przyczyny:
 *   API nie odpowiada, albo API odpowiada i przeglądarka tego nie pokazuje. Z fotela wygląda
 *   to identycznie, a naprawia się w dwóch różnych plikach.
 *
 *   Ten skrypt sprawdza pierwszą połowę — samo API, bez przeglądarki. Jeśli tu wszystko
 *   przechodzi, wina jest na stronie i tam trzeba szukać.
 *
 *   Node, a nie PowerShell: Invoke-WebRequest przy akcji `open` nie zwracał ani odpowiedzi,
 *   ani wyjątku, więc nie dawał odpowiedzi na pytanie, które zadawano.
 */
const base = (process.argv[2] || 'https://www.carruleddhishow.com').replace(/\/+$/, '');
const endpoint = `${base}/api/carruleddhi/chat`;

/** 32 znaki hex, tak jak generuje je przeglądarka. */
const token = [...crypto.getRandomValues(new Uint8Array(16))]
  .map((byte) => byte.toString(16).padStart(2, '0'))
  .join('');

async function call(label, payload) {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'pl', ...payload }),
      signal: AbortSignal.timeout(25000)
    });
    const text = await response.text();
    const ms = Date.now() - started;
    let body;
    try { body = JSON.parse(text); } catch (_) { body = null; }
    console.log(`${response.ok ? 'ok  ' : 'FAIL'}  ${label} — HTTP ${response.status} w ${ms} ms`);
    if (!body) console.log(`      odpowiedź nie jest JSON-em: ${text.slice(0, 200)}`);
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    console.log(`FAIL  ${label} — ${error.name}: ${error.message} (po ${Date.now() - started} ms)`);
    return { ok: false, status: 0, body: null };
  }
}

console.log(`endpoint: ${endpoint}`);
console.log(`token:    ${token}\n`);

const opened = await call('open', { action: 'open', token });
if (opened.body) {
  console.log(`      tryb: ${opened.body.mode}   wiadomości: ${(opened.body.messages || []).length}   czat otwarty: ${opened.body.chatOpen}`);
}

/* Cztery pytania, które słownik zna, po jednym na inny wzorzec dopasowania. Jeśli
   któreś wróci przekazaniem do człowieka, to znaczy, że faqAnswer() go nie rozpoznał — i
   wtedy widać które, a nie tylko „nie działa". */
const asks = [
  ['kask', 'Czy kask jest obowiązkowy?'],
  ['koszt', 'Ile to kosztuje?'],
  ['silnik', 'Czy wózek może mieć silnik?'],
  ['kiedy i gdzie', 'Kiedy i gdzie się to odbywa?'],
  ['numer', 'Jak dostanę numer startowy?'],
  ['kto', 'Kto może startować?'],
  // Tego w słowniku nie ma — sprawdza, czy odpowiada model, czy leci eskalacja.
  ['poza słownikiem', 'Ile mam czasu na zbudowanie wózka?']
];

console.log('');
for (const [label, message] of asks) {
  const sent = await call(`send: ${label}`, {
    action: 'send',
    token,
    message,
    name: 'Sonda',
    email: 'sonda@example.com'
  });
  const reply = sent.body?.reply || '';
  const mode = sent.body?.mode || '?';
  const escalated = mode === 'human';
  console.log(`      tryb=${mode} ${escalated ? '(przekazane człowiekowi)' : ''}`);
  console.log(`      „${reply.slice(0, 120)}${reply.length > 120 ? '…' : ''}"`);
}

console.log('');
const polled = await call('poll', { action: 'poll', token, since: '' });
if (polled.body) {
  console.log(`      wiadomości w wątku: ${(polled.body.messages || []).length}   ktoś pisze: ${polled.body.theirTyping}`);
}

console.log(`
Jak to czytać:
  Wszystkie „send" z trybem ai i odpowiedzią  → API działa, słownik działa. Szukaj na stronie.
  „poza słownikiem" z trybem ai              → model odpowiada, klucz AI_API_KEY jest dobry.
  „poza słownikiem" z trybem human           → modelu nie ma. Sprawdź AI_API_KEY, AI_API_URL,
                                               AI_MODEL i zrób Redeploy.
  Pytanie ze słownika z trybem human         → faqAnswer() nie rozpoznal slowa. To blad w
                                               liscie slow kluczowych w worker/index.js.`);
