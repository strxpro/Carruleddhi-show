/**
 * Czat: czy wyslanie zdania wysyla JEDNO zapytanie i czy strona przy tym stoi.
 *
 *     node tools/cdp.mjs probe tools/probe-c-chat-send.js --w 390 --h 844 \
 *       --inject tools/inject-chat-stub.js
 *
 * Dwie skargi naraz, obie mierzalne: liczba zadan do /api/carruleddhi/chat na jedno
 * nacisniecie, i przewiniecie strony przed i po.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const out = { steps: [] };
  const panel = document.querySelector('[data-chat]');
  if (!panel) return { note: 'brak panelu czatu' };
  panel.scrollIntoView({ block: 'center' });
  await sleep(800);

  const setField = (sel, value) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };

  out.gateVisible = (document.querySelector('[data-chat-gate]')?.getClientRects().length || 0) > 0;
  out.gateFields = [...document.querySelectorAll('[data-chat-gate] input')].map((i) => i.id || i.name);
  if (out.gateVisible) {
    setField('#chat-gate-name', 'Sonda');
    setField('#chat-gate-email', 'sonda@example.com');
    document.querySelector('[data-chat-gate-form]')?.requestSubmit();
    await sleep(1500);
  }
  out.afterGate = {
    composerVisible: (document.querySelector('[data-chat-form]')?.getClientRects().length || 0) > 0,
    calls: (window.__chatCalls || []).map((c) => c.action)
  };

  const input = document.querySelector('[data-chat-input]');
  if (!input) return { ...out, note: 'brak pola wiadomosci' };

  const sendOnce = async (label, how) => {
    const before = Math.round(window.scrollY);
    const callsBefore = (window.__chatCalls || []).filter((c) => c.action === 'send').length;
    input.value = 'Pytanie sondy: ' + label;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(150);
    how();
    await sleep(1800);
    const after = Math.round(window.scrollY);
    const sends = (window.__chatCalls || []).filter((c) => c.action === 'send');
    out.steps.push({
      label,
      wyslanoZapytan: sends.length - callsBefore,
      przewiniecie: `${before} -> ${after}`,
      dryf: after - before,
      bubbles: document.querySelectorAll('[data-chat-log] .chat-msg, [data-chat-log] > *').length
    });
  };

  await sendOnce('przycisk', () => document.querySelector('[data-chat-send]')?.click());
  await sendOnce('Enter', () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));

  out.allCalls = (window.__chatCalls || []).map((c) => c.action);
  return out;
}
