/**
 * Asks a real browser whether the chat tab exists, switches, and wires up.
 *
 * The API cannot be reached from a preview server — there is no Vercel function behind it —
 * so this deliberately does not test sending. It tests the half that is pure front end and
 * that is easy to get silently wrong: the tab switch, the panels swapping, the chips, the
 * composer, and whether the translated strings actually landed on the elements.
 *
 *     node tools/probe-chat.mjs            (needs vite preview on :4178)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const target = process.argv[2] || 'http://localhost:4178/';

function chromePath() {
  const candidates = [
    join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['ProgramFiles(x86)'] || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')
  ];
  const found = candidates.find((path) => path && existsSync(path));
  if (!found) throw new Error('Chrome or Edge not found.');
  return found;
}

const probe = `
<script>
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = { errors: [] };
  window.addEventListener('error', (e) => out.errors.push(String(e.message)));
  await sleep(1500);

  const tabs = [...document.querySelectorAll('[data-contact-tab]')];
  const chat = document.querySelector('[data-chat]');
  const formPanel = document.querySelector('[data-contact-panel="form"]');

  out.tabs = tabs.map((t) => t.dataset.contactTab);
  out.tabLabels = tabs.map((t) => t.textContent.trim());
  out.chatExists = Boolean(chat);
  out.chatHiddenAtStart = chat ? chat.hidden : null;
  out.formVisibleAtStart = formPanel ? !formPanel.hidden : null;

  const chatTab = tabs.find((t) => t.dataset.contactTab === 'chat');
  if (chatTab) {
    chatTab.click();
    await sleep(1200);
    out.chatHiddenAfterClick = chat.hidden;
    out.formHiddenAfterClick = formPanel ? formPanel.hidden : null;
    out.chatTabActive = chatTab.classList.contains('is-active');
    out.logChildren = chat.querySelectorAll('.chat-msg, .chat__system').length;
    out.firstBubble = (chat.querySelector('.chat-msg__body') || {}).textContent || '';
    out.chips = [...chat.querySelectorAll('[data-chat-ask]')].map((c) => c.textContent.trim());
    const input = chat.querySelector('[data-chat-input]');
    out.composer = Boolean(input);
    out.placeholder = input ? input.getAttribute('placeholder') : '';
    out.note = (chat.querySelector('[data-chat-note]') || {}).textContent || '';
    const cs = input ? getComputedStyle(input) : null;
    out.inputWidth = input ? Math.round(input.getBoundingClientRect().width) : 0;
    out.logMaxHeight = cs ? getComputedStyle(chat.querySelector('.chat__log')).maxHeight : '';
  }

  const marker = document.createElement('pre');
  marker.id = 'probe-result';
  marker.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(marker);
})();
</script>
`;

const profile = mkdtempSync(join(tmpdir(), 'car-chat-'));
const response = await fetch(target);
if (!response.ok) throw new Error(`preview server answered ${response.status}`);
const html = (await response.text()).replace('</body>', `${probe}</body>`);

const probeFile = 'dist/__chatprobe.html';
writeFileSync(probeFile, html, 'utf8');

try {
  const dom = execFileSync(chromePath(), [
    '--headless=new',
    '--disable-gpu',
    '--window-size=1280,900',
    '--virtual-time-budget=30000',
    `--user-data-dir=${profile}`,
    '--dump-dom',
    new URL('/__chatprobe.html', target).toString()
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  const match = /<pre id="probe-result">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    console.log('Probe did not run. First 400 chars of DOM:');
    console.log(dom.slice(0, 400));
    process.exit(1);
  }
  const decoded = match[1]
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  console.log(decoded);
} finally {
  rmSync(probeFile, { force: true });
  rmSync(profile, { recursive: true, force: true });
}
