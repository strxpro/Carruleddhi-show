(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  window.scrollTo(0, 1200);
  await sleep(400);

  const out = {};
  const opener = $('[data-open-reminder]');
  out.openerFound = Boolean(opener);
  opener?.click();
  await sleep(700);

  const modal = $('[data-reminder-modal]');
  out.reminderOpen = modal?.classList.contains('is-open');
  out.lockedWithReminder = getComputedStyle(document.scrollingElement).overflowY === 'hidden';

  // No stray link to another page any more.
  out.newTabLinks = [...modal.querySelectorAll('a[target="_blank"]')].map((a) => a.getAttribute('href'));

  const gate = $('[data-reminder-consent-gate]', modal);
  const input = $('[data-reminder-consent-input]', modal);
  out.gateFound = Boolean(gate);
  out.consentCheckedAtStart = Boolean(input?.checked);

  // Submitting without consent must be refused, not silently ignored.
  window.__sent = null;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (i, init) => {
    const url = String(typeof i === 'string' ? i : i.url || '');
    if (url.includes('/api/carruleddhi/reminder')) {
      window.__sent = JSON.parse((init && init.body) || '{}');
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(i, init);
  };
  const form = $('[data-reminder-form]', modal);
  form.elements.namedItem('name').value = 'Anna';
  form.elements.namedItem('email').value = 'anna@example.com';
  form.requestSubmit();
  await sleep(500);
  out.refusedWithoutConsent = window.__sent === null;
  out.consentErrorShown = getComputedStyle($('[data-reminder-consent-error]', form)).display !== 'none';

  // Open the documents from the gate.
  gate.click();
  await sleep(1400);
  const dialog = $('[data-consent-dialog]');
  out.consentDialogOpen = Boolean(dialog?.open);
  out.stillLocked = getComputedStyle(document.scrollingElement).overflowY === 'hidden';

  const accept = $('[data-consent-accept]', dialog);
  out.acceptDisabledBeforeReading = accept.disabled;

  // Scroll the document panel to the bottom, the way a reader does.
  const scroller = $('[data-consent-scroll]', dialog);
  scroller.scrollTop = scroller.scrollHeight;
  scroller.dispatchEvent(new Event('scroll'));
  await sleep(600);
  out.acceptEnabledAfterReading = !accept.disabled;

  accept.click();
  await sleep(1000);
  out.consentDialogClosed = !dialog.open;
  out.consentCheckedAfterAccept = Boolean(input?.checked);
  out.reminderStillOpen = modal.classList.contains('is-open');
  out.lockedAfterReturningToReminder = getComputedStyle(document.scrollingElement).overflowY === 'hidden';

  // Now it should send.
  form.requestSubmit();
  await sleep(700);
  out.sentAfterConsent = window.__sent ? { consent: window.__sent.consent, name: window.__sent.name } : 'NOT SENT';

  return out;
})
