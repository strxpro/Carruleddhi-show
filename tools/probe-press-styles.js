async (doc, win) => {
  /**
   * The earlier run read the pressed transform 80 ms after the click and got the
   * t=0 value, because a headless page with --disable-gpu does not advance the
   * transition clock reliably. That measures the animation, not the cascade.
   * Killing the transition first makes the computed style jump straight to the
   * target, which is what actually needs proving: that the rule wins.
   */
  const kill = doc.createElement('style');
  kill.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  doc.head.appendChild(kill);
  await new Promise((r) => setTimeout(r, 120));

  const cs = (el) => {
    const s = win.getComputedStyle(el);
    return { transform: s.transform, background: s.backgroundColor, shadow: s.boxShadow.slice(0, 56), border: s.borderTopColor };
  };
  const out = {};

  doc.querySelectorAll('[data-form-step]').forEach((s) => {
    const third = s.dataset.formStep === '3';
    s.hidden = !third;
    s.classList.toggle('is-active', third);
  });
  await new Promise((r) => setTimeout(r, 120));

  const gate = doc.querySelector('[data-consent-gate]');
  out.gateRest = cs(gate);
  gate.classList.add('is-pressing');
  await new Promise((r) => setTimeout(r, 80));
  out.gatePressed = cs(gate);
  out.gateTransformChanged = out.gatePressed.transform !== out.gateRest.transform;
  out.gateBackgroundChanged = out.gatePressed.background !== out.gateRest.background;
  out.gateShadowChanged = out.gatePressed.shadow !== out.gateRest.shadow;
  const mark = doc.querySelector('.consent-gate__mark');
  out.markPressedTransform = win.getComputedStyle(mark).transform;
  gate.classList.remove('is-pressing');

  const press = doc.querySelector('[data-attendance-button]');
  out.attRest = cs(press);
  press.classList.add('is-done');
  await new Promise((r) => setTimeout(r, 80));
  out.attDone = cs(press);
  out.attTransformChanged = out.attDone.transform !== out.attRest.transform;
  out.attWentDarkRed = out.attDone.background === 'rgb(142, 26, 44)';

  kill.remove();
  return out;
};
