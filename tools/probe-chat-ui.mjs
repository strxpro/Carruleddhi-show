/**
 * Czat: bramka, podpowiedzi, brak duplikatów, brak przeskoków przy pisaniu.
 *
 *     node tools/probe-chat-ui.mjs http://127.0.0.1:4173
 *
 * PO CO
 *   Duplikaty wiadomości były niewidoczne z kodu: optymistyczny bąbel nie miał id, więc
 *   polling po kilku sekundach dokładał wersję z bazy. Żeby to zobaczyć, trzeba wysłać
 *   wiadomość i poczekać dłużej niż jeden cykl pollingu — czego żaden test jednostkowy nie
 *   zrobi, bo tam nie ma ani bazy, ani zegara.
 *
 *   Endpoint w podglądzie nie odpowiada (brak backendu), więc część rzeczy jest sprawdzana
 *   przez sam interfejs: czy log i pole są zasłonięte przed podaniem danych, czy po podaniu
 *   się odsłaniają, czy podpowiedzi są schowane i rozwijają się, i czy pisanie w polu nie
 *   zmienia pozycji przewijania strony.
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

  // Czyste wejscie: bramka ma sie pokazac, wiec zapamietane dane trzeba usunac.
  try {
    localStorage.removeItem('carruleddhi.chat.name');
    localStorage.removeItem('carruleddhi.chat.email');
  } catch (_) {}

  await sleep(2400);

  const kill = document.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
  document.head.appendChild(kill);

  const tab = document.querySelector('[data-contact-tab="chat"]');
  const panel = document.querySelector('[data-chat]');
  if (!tab || !panel) {
    out.errors.push('brak zakladki albo panelu czatu');
  } else {
    document.getElementById('contact')?.scrollIntoView();
    await sleep(300);
    tab.click();
    await sleep(500);

    const gate = document.querySelector('[data-chat-gate]');
    const log = document.querySelector('[data-chat-log]');
    const form = document.querySelector('[data-chat-form]');
    const chips = document.querySelector('[data-chat-chips]');

    out.beforeGate = {
      gateVisible: gate ? !gate.hidden : null,
      logHidden: log ? log.hidden : null,
      formHidden: form ? form.hidden : null,
      chipsHidden: chips ? chips.hidden : null,
      ready: panel.dataset.chatReady || ''
    };

    // Zla walidacja: pusty formularz nie ma przepuscic.
    document.querySelector('[data-chat-gate-form] button[type=submit]')?.click();
    await sleep(250);
    out.emptySubmit = {
      stillGated: gate ? !gate.hidden : null,
      errors: [...document.querySelectorAll('[data-chat-gate] [data-error]')]
        .map((e) => e.textContent.trim()).filter(Boolean)
    };

    // Zly adres.
    const nameField = document.getElementById('chat-gate-name');
    const emailField = document.getElementById('chat-gate-email');
    nameField.value = 'Marco';
    emailField.value = 'nie-adres';
    document.querySelector('[data-chat-gate-form] button[type=submit]').click();
    await sleep(250);
    out.badEmail = {
      stillGated: gate ? !gate.hidden : null,
      errors: [...document.querySelectorAll('[data-chat-gate] [data-error]')]
        .map((e) => e.textContent.trim()).filter(Boolean)
    };

    // Poprawne dane.
    emailField.value = 'marco@example.com';
    document.querySelector('[data-chat-gate-form] button[type=submit]').click();
    await sleep(600);
    out.afterGate = {
      gateHidden: gate ? gate.hidden : null,
      logHidden: log ? log.hidden : null,
      formHidden: form ? form.hidden : null,
      chipsHidden: chips ? chips.hidden : null,
      ready: panel.dataset.chatReady || '',
      stored: {
        name: localStorage.getItem('carruleddhi.chat.name'),
        email: localStorage.getItem('carruleddhi.chat.email')
      }
    };

    // Podpowiedzi: schowane, rozwijaja sie, ile ich jest.
    const toggle = document.querySelector('[data-chat-chips-toggle]');
    const list = document.querySelector('[data-chat-chips-list]');
    out.chips = {
      count: list ? list.querySelectorAll('.chat__chip').length : 0,
      closedHeight: list ? Math.round(list.getBoundingClientRect().height) : null,
      labels: list ? [...list.querySelectorAll('.chat__chip')].map((c) => c.textContent.trim()) : []
    };
    toggle?.click();
    await sleep(300);
    out.chips.openHeight = list ? Math.round(list.getBoundingClientRect().height) : null;
    // Czy ktorykolwiek chip jest przyciety: szerokosc tekstu wieksza niz pudelko.
    out.chips.clipped = list
      ? [...list.querySelectorAll('.chat__chip')].filter((c) => c.scrollWidth > c.clientWidth + 1).length
      : 0;

    // Pisanie nie moze przesuwac strony.
    const input = document.querySelector('[data-chat-input]');
    if (input) {
      window.scrollTo(0, Math.round(document.body.scrollHeight * 0.55));
      await sleep(300);
      const before = Math.round(window.scrollY);
      const panelBefore = document.getElementById('contact')?.dataset.panel || '';
      for (const chunk of ['Dzien dobry, ', 'mam pytanie o kask ', 'i o numer startowy, ',
                           'bo chcialbym zapisac sie z kolega ', 'i nie wiem jak to zrobic.']) {
        input.value += chunk;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(120);
      }
      await sleep(500);
      out.typing = {
        scrollBefore: before,
        scrollAfter: Math.round(window.scrollY),
        panelBefore,
        panelAfter: document.getElementById('contact')?.dataset.panel || '',
        inputHeight: Math.round(input.getBoundingClientRect().height),
        // Pasek przewijania w polu: ma go nie byc widac.
        inputOverflow: getComputedStyle(input).scrollbarWidth || '(nieznane)'
      };
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Wysylka: endpoint w podgladzie nie odpowiada, wiec sprawdzamy dwie rzeczy, ktore
    // dzialaja bez serwera - czy pojawia sie wskaznik pisania i czy jedno kliknieciem nie
    // powstaja dwie banki.
    if (input) {
      input.value = 'test jednej wiadomosci';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      const sendBtn = document.querySelector('[data-chat-send]');
      sendBtn.click();
      /* Odczyt natychmiast, bez sleep. Wskaznik jest dodawany synchronicznie, jeszcze przed
         await na zapytaniu, i zdejmowany w finally — a w podgladzie nie ma backendu, wiec
         zapytanie odbija sie w kilka milisekund. Kazde czekanie tutaj mierzyloby juz stan po
         nieudanej wysylce, nie sam wskaznik. */
      const typingShown = Boolean(document.querySelector('.chat-typing'));
      // Drugie kliknięcie w trakcie pierwszego: tego ma nie przepuscic blokada.
      sendBtn.click();
      await sleep(120);
      out.doubleSend = {
        typingShown,
        visitorBubbles: document.querySelectorAll('.chat-msg--visitor').length
      };
      await sleep(2500);
      out.doubleSend.visitorBubblesLater = document.querySelectorAll('.chat-msg--visitor').length;
      out.doubleSend.typingGone = !document.querySelector('.chat-typing');
    }
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-chatui-'));
const response = await fetch(`${base}/`);
if (!response.ok) throw new Error(`preview odpowiedział ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__chatuiprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=45000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    `${base}/__chatuiprobe.html?skipIntro=1`
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

  if (r.beforeGate) {
    check(r.beforeGate.gateVisible === true, 'bramka widoczna przed podaniem danych');
    check(r.beforeGate.logHidden === true && r.beforeGate.formHidden === true,
      `log i pole zasłonięte (log ${r.beforeGate.logHidden}, pole ${r.beforeGate.formHidden})`);
  }
  if (r.emptySubmit) {
    check(r.emptySubmit.stillGated === true && r.emptySubmit.errors.length > 0,
      `pusty formularz nie przechodzi: "${r.emptySubmit.errors.join(' / ')}"`);
  }
  if (r.badEmail) {
    check(r.badEmail.stillGated === true && r.badEmail.errors.length > 0,
      `zły adres nie przechodzi: "${r.badEmail.errors.join(' / ')}"`);
  }
  if (r.afterGate) {
    check(r.afterGate.gateHidden === true, 'bramka schodzi po poprawnych danych');
    check(r.afterGate.logHidden === false && r.afterGate.formHidden === false, 'log i pole odsłonięte');
    check(r.afterGate.stored.email === 'marco@example.com',
      `dane zapamiętane: ${r.afterGate.stored.name} / ${r.afterGate.stored.email}`);
  }

  if (r.chips) {
    console.log('');
    check(r.chips.count === 3, `trzy podpowiedzi, nie sześć: ${r.chips.count}`);
    check(r.chips.closedHeight === 0, `schowane na start (wysokość ${r.chips.closedHeight} px)`);
    check((r.chips.openHeight || 0) > 20, `rozwijają się (wysokość ${r.chips.openHeight} px)`);
    check(r.chips.clipped === 0, `żadna nie jest przycięta: ${r.chips.clipped}`);
    console.log(`      treść: ${r.chips.labels.join(' | ')}`);
  }

  if (r.typing) {
    console.log('');
    check(Math.abs(r.typing.scrollAfter - r.typing.scrollBefore) <= 2,
      `pisanie nie przesuwa strony: ${r.typing.scrollBefore} -> ${r.typing.scrollAfter} px`);
    check(r.typing.panelBefore === r.typing.panelAfter,
      `sekcja kontaktu nie przeskakuje pinned/flow: ${r.typing.panelBefore} -> ${r.typing.panelAfter}`);
    console.log(`      pole ma ${r.typing.inputHeight} px, scrollbar: ${r.typing.inputOverflow}`);
  }

  if (r.doubleSend) {
    console.log('');
    check(r.doubleSend.typingShown === true, 'wskaźnik pisania pokazuje się po wysłaniu');
    check(r.doubleSend.visitorBubbles === 1,
      `dwa kliknięcia = jedna wiadomość: ${r.doubleSend.visitorBubbles}`);
    check(r.doubleSend.visitorBubblesLater === 1,
      `i po cyklu pollingu nadal jedna: ${r.doubleSend.visitorBubblesLater}`);
    check(r.doubleSend.typingGone === true, 'wskaźnik pisania znika po odpowiedzi');
  }

  console.log(`\n${fails ? `${fails} niezaliczonych` : 'wszystko zaliczone'}`);
  process.exitCode = fails ? 1 : 0;
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
