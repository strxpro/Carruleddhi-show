/**
 * Kreator sponsora: zgoda bez fioletowych odsylaczy, a przy odsylaczu wybor
 * strona / social / nic — i oferta dla tych bez strony.
 *
 * Pastylki kreatora siedza w `[data-chat-chips-list]`, tam gdzie podpowiedzi — to jest
 * jeden rzad przyciskow na oba zastosowania, wiec sonda tez patrzy tylko tam.
 *
 *   node tools/cdp.mjs probe tools/probe-c-sponsor-link.js --w 390 --h 844 \
 *     --inject tools/inject-known-person.js
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  document.querySelector('[data-chat]')?.scrollIntoView({ block: 'center' });
  await sleep(900);
  document.querySelector('[data-chat-gate-known] .chat__chip')?.click();
  await sleep(1200);

  const input = document.querySelector('[data-chat-input]');
  const chipEls = () => [...document.querySelectorAll('[data-chat-chips-list] .chat__chip')];
  const chips = () => chipEls().map((b) => b.textContent.trim());
  const lastAi = () => [...document.querySelectorAll('[data-chat-log] .chat-msg--ai')]
    .slice(-1)[0]?.textContent.replace(/^Automat/, '').trim().slice(0, 110) || '';
  const docsLinks = () => document.querySelectorAll('[data-chat-log] .chat__docs a').length;

  const tap = async (match) => {
    const button = chipEls().find((b) => match.test(b.textContent.trim()));
    if (!button) return false;
    button.click();
    await sleep(1500);
    return true;
  };
  const say = async (t) => {
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-chat-send]')?.click();
    await sleep(1600);
  };

  const out = { kroki: [] };
  const note = (krok) => out.kroki.push({ krok, zdanie: lastAi(), pastylki: chips(), odsylaczeDokumentow: docsLinks() });

  await say('Chcę zostać sponsorem');
  note('oferta');
  await tap(/sponsorem|Chcę/i);
  note('pytanie o nazwę');

  await say('Trattoria Sonda');
  note('zgoda');
  /* TU jest sedno pierwszej poprawki: ile odsylaczy do polityki wisi pod pytaniem. */
  out.odsylaczyPodZgoda = docsLinks();

  await tap(/przecz|akcept|zapozna/i);
  await sleep(1200);
  const dialog = document.querySelector('dialog[open]');
  out.oknoZgodyOtwarte = Boolean(dialog);
  if (dialog) {
    const scroller = [...dialog.querySelectorAll('*')].find((el) => el.scrollHeight - el.clientHeight > 20);
    if (scroller) { scroller.scrollTop = scroller.scrollHeight; scroller.dispatchEvent(new Event('scroll', { bubbles: true })); }
    await sleep(700);
    const accept = [...dialog.querySelectorAll('button')].find((b) => !b.disabled && /akcept|zgadzam|rozumiem/i.test(b.textContent));
    accept?.click();
    await sleep(1600);
  }
  note('po zgodzie');

  await say('Anna Kowalska');
  note('telefon');
  await say('+39 333 111 222');
  note('logo');
  await tap(/bez obraz|pomiń|bez zdj/i);
  note('odsyłacz — WYBÓR');

  out.pastylkiOdsylacza = chips();
  out.klikNieMam = await tap(new RegExp(new URLSearchParams(location.search).get("branch") || "nie mam", "i"));
  await sleep(1200);
  out.ofertaMailowa = [...document.querySelectorAll('[data-chat-log] a[href^="mailto:"]')]
    .map((a) => a.getAttribute('href'));
  out.zdaniaNaKoniec = [...document.querySelectorAll('[data-chat-log] .chat-msg--ai')].slice(-2)
    .map((m) => m.textContent.replace(/^Automat/, '').trim().slice(0, 110));
  return out;
}
