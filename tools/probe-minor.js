(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  const form = $('[data-registration-form]');
  if (!form) return { fatal: 'no form' };
  const box = $('[data-minor-box]', form);
  const clause = $('[data-minor-clause]');
  const birth = form.elements.namedItem('birthDate');
  const out = { eventDate: (window.CARRULEDDHI_CONFIG || {}).eventDate || '?' };

  const setDate = async (value) => {
    birth.value = value;
    birth.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(250);
  };

  const requiredNames = () => $$('[data-minor-field]', box)
    .filter((c) => c.hasAttribute('required'))
    .map((c) => c.name)
    .join(',');

  out.hiddenAtStart = box.hidden;
  out.clauseHiddenAtStart = clause.hidden;
  out.requiredAtStart = requiredNames();

  // Event is 2026-10-17. Born 2010-10-18 -> turns 16 the day AFTER the race.
  await setDate('2010-10-18');
  out.minorCase = {
    boxHidden: box.hidden,
    clauseHidden: clause.hidden,
    required: requiredNames(),
    intro: $('[data-minor-age]', box).textContent.slice(0, 60)
  };

  // Born exactly 18 years before the race day -> adult on the day.
  await setDate('2008-10-17');
  out.exactly18OnRaceDay = { boxHidden: box.hidden, required: requiredNames() };

  // One day later -> still 17 on race day, so a minor.
  await setDate('2008-10-18');
  out.dayShortOf18 = { boxHidden: box.hidden, required: requiredNames() };

  // Clearly an adult.
  await setDate('1990-05-05');
  out.adultCase = {
    boxHidden: box.hidden,
    clauseHidden: clause.hidden,
    required: requiredNames()
  };

  // --- payload for an adult
  const fill = (name, value) => {
    const control = form.elements.namedItem(name);
    if (!control) return;
    control.value = value;
    control.dispatchEvent(new Event('input', { bubbles: true }));
  };
  fill('firstName', 'Marco');
  fill('lastName', 'Rossi');
  fill('postalCode', '07028');
  fill('email', 'marco@example.com');
  fill('phone', '+39 320 000 0000');
  fill('address', 'Via Roma 1, Santa Teresa Gallura');
  fill('cartName', 'Fulmine');
  form.elements.namedItem('rulesConsent').checked = true;
  form.elements.namedItem('privacyConsent').checked = true;

  window.__sent = null;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : input.url || '');
    if (url.includes('/api/carruleddhi/registration')) {
      window.__sent = JSON.parse((init && init.body) || '{}');
      return new Response(JSON.stringify({ ok: true, raceNumber: '041' }), {
        status: 200, headers: { 'Content-Type': 'application/json' }
      });
    }
    return realFetch(input, init);
  };

  form.requestSubmit();
  await sleep(700);
  const adultSent = window.__sent;
  out.adultPayload = adultSent ? {
    hasPostalCode: 'postalCode' in adultSent,
    postalCode: adultSent.postalCode,
    hasTaxCode: 'taxCode' in adultSent,
    isMinor: adultSent.isMinor,
    riderAge: adultSent.riderAge,
    hasGuardian: 'guardianName' in adultSent
  } : 'NOT SENT';

  // --- now the minor path, on a fresh form
  $('[data-new-registration]')?.click();
  await sleep(500);
  out.afterResetBoxHidden = box.hidden;

  fill('firstName', 'Sara');
  fill('lastName', 'Rossi');
  fill('postalCode', '07028');
  fill('email', 'sara@example.com');
  fill('phone', '+39 320 111 1111');
  fill('address', 'Via Roma 2, Santa Teresa Gallura');
  // Step 2 as well: the reset emptied it, and a missing required field there stops
  // the submit before the guardian check is ever reached.
  fill('cartName', 'Saetta');
  await setDate('2012-03-04');
  out.minorBoxVisibleAgain = !box.hidden;

  fill('guardianName', 'Anna Rossi');
  fill('guardianEmail', 'anna@example.com');
  fill('guardianPhone', '+39 320 222 2222');
  fill('motherName', 'Anna Rossi');
  form.elements.namedItem('guardianRelation').value = 'mother';
  form.elements.namedItem('childKind').value = 'daughter';
  form.elements.namedItem('rulesConsent').checked = true;
  form.elements.namedItem('privacyConsent').checked = true;

  // Deliberately NOT ticking the guardian consent: the submit must be refused.
  window.__sent = null;
  form.requestSubmit();
  await sleep(600);
  out.refusedWithoutGuardianConsent = window.__sent === null;
  out.consentErrorShown = getComputedStyle($('[data-minor-consent-error]', form)).display !== 'none';
  out.stepAfterRefusal = $('[data-form-step].is-active')?.dataset.formStep || '?';

  form.elements.namedItem('guardianConsent').checked = true;
  form.elements.namedItem('guardianConsent').dispatchEvent(new Event('change', { bubbles: true }));
  form.requestSubmit();
  await sleep(700);
  const minorSent = window.__sent;
  out.minorPayload = minorSent ? {
    isMinor: minorSent.isMinor,
    riderAge: minorSent.riderAge,
    childKind: minorSent.childKind,
    guardianRelation: minorSent.guardianRelation,
    guardianName: minorSent.guardianName,
    guardianEmail: minorSent.guardianEmail,
    guardianConsent: minorSent.guardianConsent,
    motherName: minorSent.motherName,
    postalCode: minorSent.postalCode
  } : 'NOT SENT';

  out.docWidth = document.documentElement.scrollWidth;
  out.viewport = innerWidth;
  return out;
})
