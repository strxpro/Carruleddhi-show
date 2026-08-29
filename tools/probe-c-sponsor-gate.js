/**
 * TOR C / C1 — czy pytanie wpisane przez „chcesz byc sponsorem" przezywa brame czatu.
 *
 * Kompozytor jest schowany, dopoki gosc nie poda imienia i adresu. Sonda przechodzi
 * przez brame i sprawdza, czy zdanie nadal tam lezy — bo wpisanie go w pole, ktore
 * zaraz zostanie wyczyszczone, byloby przyciskiem, ktory zglasza sukces i nic nie robi.
 *
 *     node tools/cdp.mjs probe tools/probe-c-sponsor-gate.js --w 1440 --h 900
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';

  const out = {};
  document.querySelector('[data-sponsor-ask]')?.click();
  await sleep(1500);

  const input = document.querySelector('[data-chat-input]');
  out.beforeGate = {
    value: input?.value,
    composerVisible: (document.querySelector('[data-chat-form]')?.getClientRects().length || 0) > 0,
    gateVisible: (document.querySelector('[data-chat-gate]')?.getClientRects().length || 0) > 0
  };

  const setField = (selector, value) => {
    const field = document.querySelector(selector);
    if (!field) return false;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  out.filled = setField('#chat-gate-name', 'Probe') && setField('#chat-gate-email', 'probe@example.com');
  document.querySelector('[data-chat-gate-form]')?.requestSubmit();
  await sleep(1800);

  out.afterGate = {
    value: document.querySelector('[data-chat-input]')?.value,
    composerVisible: (document.querySelector('[data-chat-form]')?.getClientRects().length || 0) > 0,
    gateVisible: (document.querySelector('[data-chat-gate]')?.getClientRects().length || 0) > 0
  };
  return out;
};
