async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.querySelector('[data-chat]')?.scrollIntoView({ block: 'center' });
  await sleep(900);
  document.querySelector('[data-chat-gate-known] .chat__chip')?.click();
  await sleep(1200);
  const input = document.querySelector('[data-chat-input]');
  input.value = 'Chcę zostać sponsorem';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-chat-send]')?.click();
  await sleep(2200);
  const all = [...document.querySelectorAll('.chat__chip')].map((b) => ({
    txt: b.textContent.trim().slice(0, 30),
    parent: b.parentElement?.className,
    rects: b.getClientRects().length,
    display: getComputedStyle(b).display
  }));
  return {
    chipy: all,
    ostatnieWiersze: [...document.querySelectorAll('[data-chat-log] > *')].slice(-6)
      .map((el) => el.className + ' :: ' + el.textContent.trim().slice(0, 70)),
    calls: (window.__chatCalls || []).map((c) => c.action + ' ' + c.message.slice(0, 20))
  };
}
