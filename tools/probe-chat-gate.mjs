/**
 * Bramka weryfikacyjna w rozmowie: pole na kod, wiersz systemowy, trzy pastylki, kolejność
 * kroków sponsora.
 *
 *     node tools/probe-chat-gate.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Wszystko, co ta bramka obiecuje, obiecuje przeglądarce: klawiatura numeryczna na
 *   telefonie, wysyłka na szóstej cyfrze bez przycisku, odsianie liter bez komunikatu
 *   o błędzie, kod, który NIE staje się bąbelkiem w wątku, komunikat systemowy zamiast
 *   wypowiedzi automatu i cel dotykowy trzech wyjść. Żadnej z tych rzeczy nie widać z kodu
 *   Workera i żadnej nie sprawdzi test jednostkowy — trzeba przejść bramkę palcem.
 *
 *   Podglądowy serwer nie ma Workera, więc żądania bramki (`verify-start`, `verify-code`,
 *   `sponsor-lead`) odbijają się o 404 i `postJSON` zamienia je w tryb demo — czyli bramka
 *   przechodzi i to wystarcza do wszystkich asercji czysto interfejsowych. Sonda tych żądań
 *   NIE podstawia: tylko je liczy, bo „pięć cyfr nie wysyła, szósta wysyła" jest właśnie
 *   pytaniem o to, ile razy poszło żądanie.
 *
 *   Podstawiona jest JEDNA rzecz: odpowiedź czatu ze znacznikiem `selfService`. Kreator
 *   sponsora otwiera serwer, a nie strona, więc bez tego jednego skoku nie ma czego mierzyć.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const base = process.argv[2] || 'http://127.0.0.1:4173';

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Nie znalazłem Chrome ani Edge.');
  return found;
}

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));

  /* LICZNIK ŻĄDAŃ BRAMKI I JEDEN PODSTAWIONY SKOK
     ---------------------------------------------------------------------------
     Zadania bramki lecą dalej, do podglądu, i odbijają się o 404 — sonda je tylko liczy.
     Podstawiona jest wylacznie odpowiedz czatu: znacznik selfService pochodzi od Workera,
     a bez niego kreator sponsora nie otwiera sie wcale. Tresci wyslanych wiadomosci sa
     zapisywane, zeby dalo sie sprawdzic, ze szesc cyfr NIE poszlo do watku. */
  const calls = { 'verify-start': 0, 'verify-code': 0, 'sponsor-lead': 0 };
  const sent = [];
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input?.url || '');
    for (const name of Object.keys(calls)) if (url.includes('/' + name)) calls[name] += 1;
    if (url.includes('/api/carruleddhi/chat')) {
      let body = {};
      try { body = JSON.parse(init?.body || '{}'); } catch (_) {}
      if (body.action === 'send') {
        sent.push(String(body.message || ''));
        return new Response(
          JSON.stringify({ ok: true, mode: 'ai', reply: null, selfService: 'sponsor' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, mode: 'ai', messages: [] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(input, init);
  };

  // Czyste wejscie: karta z imieniem i adresem ma sie pokazac.
  try {
    localStorage.removeItem('carruleddhi.chat.name');
    localStorage.removeItem('carruleddhi.chat.email');
  } catch (_) {}

  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const T = (key) => String(window.CARRULEDDHI_API?.text(key) || '');
  const log = () => document.querySelector('[data-chat-log]');
  const logText = () => String(log()?.textContent || '');
  const chips = () => [...(document.querySelector('[data-chat-chips-list]')?.querySelectorAll('.chat__chip') || [])];
  const chip = (key) => chips().find((c) => c.textContent.trim() === T(key).trim());
  const codeInput = () => document.querySelector('[data-chat-code]');
  const bubbles = () => document.querySelectorAll('.chat-msg--visitor').length;

  const write = (field, value) => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  /* ZGODA PRZEZ OKNO Z DOKUMENTEM, BO TAK JĄ TERAZ DAJE CZŁOWIEK
     ---------------------------------------------------------------------------
     Pastylka „Zgadzam się" zniknęła: zgoda pada dopiero po przewinięciu dokumentu do końca
     w tym samym oknie, którego używa formularz zapisu. Sonda robi więc to, co palec —
     otwiera okno, przewija do dołu, naciska „akceptuję". Pętla, a nie jedno przewinięcie:
     treść dociąga się osobnym żądaniem, więc pierwsze przewinięcie trafia czasem w pustą
     ramkę, a przycisk odblokowuje się dopiero, gdy tekst już jest. */
  const acceptConsent = async () => {
    chip('chat.sponsorConsentRead')?.click();
    await sleep(500);
    for (let round = 0; round < 14; round += 1) {
      const scroller = document.querySelector('[data-consent-scroll]');
      const accept = document.querySelector('[data-consent-accept]');
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
        scroller.dispatchEvent(new Event('scroll'));
      }
      if (accept && !accept.disabled) break;
      await sleep(200);
    }
    document.querySelector('[data-consent-accept]')?.click();
    // Przycisk „akceptuję" ma 520 ms animacji wypełnienia, po niej leci wywołanie zwrotne.
    await sleep(1100);
  };

  const say = async (message) => {
    const input = document.querySelector('[data-chat-input]');
    if (!input) return;
    write(input, message);
    document.querySelector('[data-chat-send]')?.click();
    await sleep(450);
  };

  const tab = document.querySelector('[data-contact-tab="chat"]');
  if (!tab) {
    out.errors.push('brak zakladki czatu');
  } else {
    document.getElementById('contact')?.scrollIntoView();
    await sleep(300);
    tab.click();
    await sleep(500);

    // Karta przed rozmowa: imie i adres, inaczej nie ma ani dziennika, ani kompozytora.
    const nameField = document.getElementById('chat-gate-name');
    const emailField = document.getElementById('chat-gate-email');
    if (nameField) nameField.value = 'Marco';
    if (emailField) emailField.value = 'marco@example.com';
    document.querySelector('[data-chat-gate-form] button[type=submit]')?.click();
    await sleep(600);
    out.entered = { logVisible: document.querySelector('[data-chat-log]')?.hidden === false };

    /* Sponsor od oferty do bramki. Zwraca stan wątku ZARAZ PO nazwie carruleddhi — to jest
       moment, w którym zgoda albo stoi przed pytaniami o kontakt, albo nie stoi. */
    const toGate = async () => {
      await say('Chcialbym zostac sponsorem Carruleddhi Show.');
      const offer = { chips: chips().map((c) => c.textContent.trim()) };
      chip('chat.sponsorYes')?.click();
      await sleep(250);

      await say('Trattoria Probe');
      const afterName = {
        consentAsked: logText().includes(T('chat.sponsorConsentAsk')),
        phoneAsked: logText().includes(T('chat.sponsorAskPhone')),
        emailAsked: logText().includes(T('chat.sponsorAskEmail')),
        personAsked: logText().includes(T('chat.sponsorAskPerson')),
        docLinks: document.querySelectorAll('.chat__docs a').length,
        chips: chips().map((c) => c.textContent.trim())
      };

      await acceptConsent();
      await say('Mario Rossi');
      const afterPerson = {
        phoneAsked: logText().includes(T('chat.sponsorAskPhone')),
        skipPill: Boolean(chip('chat.sponsorPhoneSkip'))
      };

      /* Trzy pominięcia pod rząd: numer, zdjęcie i odsyłacz. Wszystkie trzy kroki są
         opcjonalne i wszystkie mają własną pastylkę — droga „nic nie podaję" musi dojść do
         podsumowania, bo to jest najczęstsza droga przez ten kreator. */
      chip('chat.sponsorPhoneSkip')?.click();
      await sleep(400);
      chip('chat.sponsorLogoSkip')?.click();
      await sleep(400);
      chip('chat.sponsorLinkSkip')?.click();
      await sleep(400);
      await say('probe@example.com');
      await sleep(700);
      /* Bramka staje dopiero po potwierdzeniu podsumowania: kod na skrzynkę jest pierwszą
         rzeczą, która wychodzi na zewnątrz, i wychodzi po naciśnięciu „tak, wyślij". */
      const summary = {
        shown: Boolean(document.querySelector('[data-chat-summary]')),
        gateBefore: Boolean(codeInput()),
        chips: chips().map((c) => c.textContent.trim())
      };
      chip('chat.sponsorSummaryYes')?.click();
      await sleep(900);
      return { offer, afterName, afterPerson, summary };
    };

    const first = await toGate();
    out.offer = first.offer;
    out.afterName = first.afterName;
    out.afterPerson = first.afterPerson;
    out.summary = first.summary;

    // ------------------------------------------------------------------ pole na kod
    const field = codeInput();
    out.field = {
      present: Boolean(field),
      type: field?.getAttribute('type') || '',
      inputmode: field?.getAttribute('inputmode') || '',
      autocomplete: field?.getAttribute('autocomplete') || '',
      maxlength: field?.getAttribute('maxlength') || '',
      pattern: field?.getAttribute('pattern') || '',
      height: field ? Math.round(field.getBoundingClientRect().height) : 0,
      inComposer: Boolean(field?.closest('[data-chat-form]')),
      inLog: Boolean(field?.closest('[data-chat-log]')),
      verifyStart: calls['verify-start']
    };

    // Wiersz „wyslalem kod": systemowy, nie babelek automatu.
    const sentPrefix = T('chat.gateCodeSent').split('%EMAIL%')[0].trim();
    const row = [...(log()?.children || [])].reverse()
      .find((el) => sentPrefix && el.textContent.includes(sentPrefix));
    out.gateLine = {
      found: Boolean(row),
      className: row?.className || '',
      system: Boolean(row?.classList.contains('chat__system')),
      aiBubble: Boolean(row?.classList.contains('chat-msg--ai'))
    };

    // Trzy wyjscia z bramki i ich cel dotykowy.
    out.pills = {
      labels: chips().map((c) => c.textContent.trim()),
      gateVariant: chips().filter((c) => c.classList.contains('chat__chip--gate')).length,
      heights: chips().map((c) => Math.round(c.getBoundingClientRect().height)),
      minHeights: chips().map((c) => getComputedStyle(c).minHeight)
    };

    if (field) {
      const bubblesBefore = bubbles();
      const sentBefore = sent.length;

      // Litery i spacje: odsiane w miejscu, bez zdania o bledzie i bez zadania.
      write(field, 'ab 12 x3');
      await sleep(200);
      out.sieve = {
        value: field.value,
        hint: String(document.querySelector('[data-chat-code-hint]')?.textContent || ''),
        verifyCode: calls['verify-code']
      };

      // Piec cyfr: nic nie leci.
      write(field, '');
      for (const digit of ['1', '2', '3', '4', '5']) {
        write(field, field.value + digit);
        await sleep(90);
      }
      out.five = {
        value: field.value,
        verifyCode: calls['verify-code'],
        fieldThere: Boolean(codeInput()),
        confirmed: logText().includes(T('chat.gateConfirmed'))
      };

      // Szosta cyfra: leci, bez nacisniecia przycisku.
      write(field, field.value + '6');
      await sleep(900);
      out.sixth = {
        verifyCode: calls['verify-code'],
        fieldGone: !codeInput(),
        confirmed: logText().includes(T('chat.gateConfirmed')),
        sponsorLead: calls['sponsor-lead'],
        thanks: logText().includes(T('chat.sponsorThanks'))
      };

      out.noBubble = {
        bubblesBefore,
        bubblesAfter: bubbles(),
        chatSendsBefore: sentBefore,
        chatSendsAfter: sent.length,
        digitsInThread: sent.filter((m) => /\\d{4}/.test(m)).length,
        codeInLog: logText().includes('123456')
      };
    }

    // ------------------------------------------------------------ wklejenie szesciu cyfr
    const second = await toGate();
    out.secondRun = { gateThere: Boolean(codeInput()), consentBeforePhone: second.afterName.phoneAsked === false };
    const pasteField = codeInput();
    if (pasteField) {
      const before = calls['verify-code'];
      const bubblesBefore = bubbles();
      // Wklejenie: jedno zdarzenie input z kompletem cyfr, tak jak przy Ctrl+V.
      write(pasteField, '654321');
      await sleep(900);
      out.paste = {
        verifyCodeDelta: calls['verify-code'] - before,
        fieldGone: !codeInput(),
        bubblesDelta: bubbles() - bubblesBefore
      };
    }
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-chatgate-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__chatgateprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=60000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__chatgateprobe.html?skipIntro=1`
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Sonda nie wystartowała. Pierwsze 400 znaków:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const r = JSON.parse(match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));

  let fails = 0;
  const check = (pass, line) => {
    if (!pass) fails += 1;
    console.log(`${pass ? 'ok  ' : 'FAIL'}  ${line}`);
  };

  console.log(`błędy JS: ${r.errors.length ? r.errors.join(' | ') : 'brak'}\n`);

  /* Nieobecny pomiar to nie brak asercji, to asercja niezaliczona. Bez tego przejście, które
     zatrzymało się przed bramką, dawałoby „wszystko zaliczone" na pustym zestawie. */
  const wanted = ['field', 'gateLine', 'pills', 'sieve', 'five', 'sixth', 'noBubble',
    'afterName', 'afterPerson', 'summary', 'secondRun', 'paste'];
  const missing = wanted.filter((key) => !r[key]);
  check(missing.length === 0, `komplet pomiarów${missing.length ? `, brakuje: ${missing.join(', ')}` : ''}`);
  console.log('');

  if (r.field) {
    check(r.field.present === true, 'pole na kod stoi w rozmowie');
    check(r.field.inputmode === 'numeric', `inputmode="${r.field.inputmode}"`);
    check(r.field.autocomplete === 'one-time-code', `autocomplete="${r.field.autocomplete}"`);
    check(r.field.type === 'text', `type="${r.field.type}", nie number`);
    check(r.field.maxlength === '6', `maxlength="${r.field.maxlength}"`);
    check(r.field.height >= 44, `cel dotykowy pola: ${r.field.height} px`);
    check(r.field.inLog === true && r.field.inComposer === false,
      `pole jest wierszem dziennika, nie kompozytorem (log ${r.field.inLog}, kompozytor ${r.field.inComposer})`);
    check(r.field.verifyStart === 1, `jeden list z kodem na jedno wejście w bramkę: ${r.field.verifyStart}`);
  }

  if (r.gateLine) {
    console.log('');
    check(r.gateLine.found === true, 'komunikat bramki jest w dzienniku');
    check(r.gateLine.system === true && r.gateLine.aiBubble === false,
      `komunikat bramki ma .chat__system, nie .chat-msg--ai: "${r.gateLine.className}"`);
  }

  if (r.pills) {
    console.log('');
    check(r.pills.labels.length === 3, `trzy wyjścia z bramki: ${r.pills.labels.length}`);
    check(r.pills.gateVariant === 3, `wszystkie trzy mają .chat__chip--gate: ${r.pills.gateVariant}`);
    check(r.pills.heights.every((h) => h >= 44),
      `cele dotykowe pastylek: ${r.pills.heights.join(', ')} px (min-height ${r.pills.minHeights.join(', ')})`);
    console.log(`      treść: ${r.pills.labels.join(' | ')}`);
  }

  if (r.sieve) {
    console.log('');
    check(r.sieve.value === '123', `"ab 12 x3" zostaje jako "${r.sieve.value}"`);
    check(r.sieve.hint === '', `odsianie bez komunikatu o błędzie (podpowiedź: "${r.sieve.hint}")`);
    check(r.sieve.verifyCode === 0, `trzy cyfry nic nie wysyłają: ${r.sieve.verifyCode}`);
  }

  if (r.five && r.sixth) {
    console.log('');
    check(r.five.verifyCode === 0 && r.five.fieldThere === true && r.five.confirmed === false,
      `pięć cyfr nie wysyła: ${r.five.verifyCode} żądań, pole zostaje ${r.five.fieldThere}`);
    check(r.sixth.verifyCode === 1, `szósta cyfra wysyła bez przycisku: ${r.sixth.verifyCode} żądanie`);
    check(r.sixth.confirmed === true, 'bramka mówi wprost, że adres jest potwierdzony');
    check(r.sixth.fieldGone === true, 'pole na kod schodzi po potwierdzeniu');
    check(r.sixth.sponsorLead === 1 && r.sixth.thanks === true,
      `zgłoszenie idzie dopiero po kodzie: ${r.sixth.sponsorLead} żądanie, podziękowanie ${r.sixth.thanks}`);
  }

  if (r.noBubble) {
    console.log('');
    check(r.noBubble.bubblesAfter === r.noBubble.bubblesBefore,
      `kod nie tworzy bąbelka gościa: ${r.noBubble.bubblesBefore} -> ${r.noBubble.bubblesAfter}`);
    check(r.noBubble.chatSendsAfter === r.noBubble.chatSendsBefore && r.noBubble.digitsInThread === 0,
      `kod nie tworzy wiersza w wątku: ${r.noBubble.chatSendsBefore} -> ${r.noBubble.chatSendsAfter} wiadomości`);
    check(r.noBubble.codeInLog === false, 'wpisanych cyfr nie ma w treści rozmowy');
  }

  if (r.afterName && r.afterPerson) {
    console.log('');
    check(r.afterName.consentAsked === true, 'po nazwie carruleddhi pyta o zgodę');
    check(r.afterName.phoneAsked === false && r.afterName.emailAsked === false
      && r.afterName.personAsked === false,
      `przed zgodą nie ma pytania o telefon, adres ani nazwisko (telefon ${r.afterName.phoneAsked})`);
    check(r.afterName.docLinks === 2, `dwa odsyłacze do dokumentów przy zgodzie: ${r.afterName.docLinks}`);
    check(r.afterPerson.phoneAsked === true, 'pytanie o telefon dopiero po zgodzie');
    check(r.afterPerson.skipPill === true, 'telefon da się pominąć naciśnięciem');
  }

  if (r.summary) {
    console.log('');
    check(r.summary.shown === true, 'podsumowanie staje po adresie, przed bramką');
    check(r.summary.gateBefore === false,
      'pole na kod NIE stoi przed potwierdzeniem — kod wychodzi po „tak, wyślij"');
    check(r.summary.chips.length === 2, `dwie pastylki pod podsumowaniem: ${r.summary.chips.length}`);
    console.log(`      treść: ${r.summary.chips.join(' | ')}`);
  }

  if (r.paste) {
    console.log('');
    check(r.secondRun?.gateThere === true, 'bramka staje drugi raz na nowym przejściu');
    check(r.paste.verifyCodeDelta === 1, `wklejenie sześciu cyfr wysyła: ${r.paste.verifyCodeDelta} żądanie`);
    check(r.paste.fieldGone === true, 'wklejony kod też zdejmuje pole');
    check(r.paste.bubblesDelta === 0, `wklejony kod nie tworzy bąbelka: ${r.paste.bubblesDelta}`);
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
