/**
 * Brama czatu, gdy adres jest juz znany.
 *
 *   node tools/cdp.mjs probe tools/probe-c-gate-known.js --w 390 --h 844 \
 *     --inject tools/inject-known-person.js
 *   ... --url "/?change=1"   -> sciezka „zmien adres"
 *   ... --url "/?noname=1"   -> znamy adres, nie znamy imienia
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const params = new URLSearchParams(location.search);
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  document.querySelector('[data-chat]')?.scrollIntoView({ block: 'center' });
  await sleep(900);

  const gate = document.querySelector('[data-chat-gate]');
  const card = document.querySelector('[data-chat-gate-known]');
  const form = document.querySelector('[data-chat-gate-form]');
  const visible = (el) => Boolean(el) && el.getClientRects().length > 0;

  const out = {
    kartaPotwierdzenia: visible(card),
    formularzWidoczny: visible(form),
    zdanie: card?.querySelector('.chat-gate__lead')?.textContent.trim(),
    pastylki: [...(card?.querySelectorAll('.chat__chip') || [])].map((b) => b.textContent.trim()),
    poleImienia: Boolean(card?.querySelector('#chat-gate-known-name'))
  };
  if (!card) return { ...out, note: 'karty nie ma — nie ma czego mierzyc' };

  if (params.has('change')) {
    card.querySelectorAll('.chat__chip')[1]?.click();
    await sleep(600);
    out.poZmianieAdresu = {
      kartaZnikla: !document.querySelector('[data-chat-gate-known]'),
      formularzWrocil: visible(document.querySelector('[data-chat-gate-form]')),
      fokus: document.activeElement?.id || document.activeElement?.tagName
    };
    return out;
  }

  if (out.poleImienia) {
    const field = card.querySelector('#chat-gate-known-name');
    /* Najpierw pusto: pastylka nie ma prawa przepuscic rozmowy bez imienia. */
    card.querySelectorAll('.chat__chip')[0]?.click();
    await sleep(400);
    out.pustePrzeszlo = !visible(document.querySelector('[data-chat-gate-known]'));
    field.value = 'Anna';
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  card.querySelectorAll('.chat__chip')[0]?.click();
  await sleep(1400);
  out.poPotwierdzeniu = {
    kartaZnikla: !document.querySelector('[data-chat-gate-known]'),
    bramaSchowana: Boolean(gate?.hidden),
    kompozytorWidoczny: visible(document.querySelector('[data-chat-form]')),
    zapamietanyMail: window.localStorage.getItem('carruleddhi.chat.email'),
    zapamietaneImie: window.localStorage.getItem('carruleddhi.chat.name'),
    zadania: (window.__chatCalls || []).map((c) => c.action)
  };
  return out;
}
