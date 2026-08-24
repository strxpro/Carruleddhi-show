async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const out = {};
  const cs = (el, prop, pseudo) => win.getComputedStyle(el, pseudo || null)[prop];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------- attendance: stays pressed */
  const att = doc.querySelector('#attendance');
  win.scrollTo(0, att.getBoundingClientRect().top + win.scrollY);
  await wait(500);
  const press = doc.querySelector('[data-attendance-button]');
  out.pressBefore = { done: press.classList.contains('is-done'), bg: cs(press, 'backgroundColor'), transform: cs(press, 'transform') };
  press.click();
  await wait(900);
  out.pressAfter = {
    done: press.classList.contains('is-done'),
    disabled: press.disabled,
    bg: cs(press, 'backgroundColor'),
    transform: cs(press, 'transform'),
    ariaPressed: press.getAttribute('aria-pressed')
  };
  out.reminderOpenAfterClick = Boolean(doc.querySelector('.modal.is-open'));
  doc.querySelector('.modal.is-open')?.classList.remove('is-open');
  doc.body.classList.remove('is-locked');
  await wait(250);

  /* -------------------------------------------- consent gate: press, then pop */
  const signup = doc.querySelector('#signup');
  win.scrollTo(0, signup.getBoundingClientRect().top + win.scrollY);
  await wait(400);
  // Step 3 holds the gate. Reveal it directly rather than filling two steps of
  // validated fields: this measures the button, not the wizard.
  doc.querySelectorAll('[data-form-step]').forEach((s) => {
    const third = s.dataset.formStep === '3';
    s.hidden = !third;
    s.classList.toggle('is-active', third);
  });
  await wait(300);
  const gate = doc.querySelector('[data-consent-gate]');
  const dlg = doc.querySelector('[data-consent-dialog]');
  gate.scrollIntoView({ block: 'center' });
  await wait(250);
  out.gateVisible = gate.getBoundingClientRect().height > 4;
  out.gateRestTransform = cs(gate, 'transform');
  out.gateDialogOpenBefore = dlg.open;
  gate.click();
  await wait(80);
  out.gatePressingAt80ms = gate.classList.contains('is-pressing');
  out.gateDialogOpenAt80ms = dlg.open;
  out.gatePressTransform = cs(gate, 'transform');
  out.gatePressShadow = cs(gate, 'boxShadow');
  await wait(300);
  out.gateDialogOpenAt380ms = dlg.open;
  out.pressStateVisibleBeforeDialog = out.gatePressingAt80ms && !out.gateDialogOpenAt80ms && out.gateDialogOpenAt380ms;
  if (dlg.open) dlg.close();
  doc.body.classList.remove('is-locked');

  /* ------------------------------------------------------------------ route */
  const route = doc.querySelector('#route');
  win.scrollTo(0, route.getBoundingClientRect().top + win.scrollY);
  await wait(3400);
  const frame = doc.querySelector('[data-route-frame]');
  out.routeDrawn = frame.classList.contains('is-route-drawn');
  const dash = doc.querySelector('[data-route-dash]');
  out.dash = {
    animation: cs(dash, 'animationName'),
    duration: cs(dash, 'animationDuration'),
    width: cs(dash, 'strokeWidth'),
    opacity: cs(dash, 'opacity')
  };
  const runner = doc.querySelector('[data-route-runner]');
  const angles = [];
  for (let i = 0; i < 8; i += 1) {
    const m = cs(runner, 'transform').match(/matrix\(([^)]+)\)/);
    if (m) {
      const [a, b] = m[1].split(',').map(Number);
      // Sign of the y-scale after decomposition tells us whether it is flipped
      // upside down; a horizontal mirror keeps it positive.
      angles.push({ a: a.toFixed(3), b: b.toFixed(3), facing: runner.style.getPropertyValue('--runner-facing') });
    }
    await wait(400);
  }
  out.runnerMatrices = angles;
  out.runnerUpsideDownFrames = angles.filter((s) => Math.abs(Number(s.b)) > 0.3).length;
  out.pins = [...doc.querySelectorAll('[data-route-frame] .route__pin')].map((p) => ({
    cls: p.className.replace('route__pin ', ''),
    text: (p.textContent || '').trim(),
    visible: p.getBoundingClientRect().height > 2
  }));
  return out;
};
