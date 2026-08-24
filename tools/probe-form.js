async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const signup = doc.querySelector('#signup');
  win.scrollTo(0, signup.getBoundingClientRect().top + win.scrollY);
  await new Promise((r) => setTimeout(r, 400));

  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const out = {};

  const prog = doc.querySelector('.form-progress');
  const runner = doc.querySelector('.form-progress__runner');
  out.progress = box(prog);
  out.runner = box(runner);
  out.runnerClipped = runner && prog ? Math.round(prog.getBoundingClientRect().top - runner.getBoundingClientRect().top) : null;

  const items = [...doc.querySelectorAll('.step-indicator')];
  out.steps = items.map((it) => ({
    num: box(it.querySelector('.step-indicator__number')),
    copy: box(it.querySelector('.step-indicator__copy strong')),
    small: box(it.querySelector('.step-indicator__copy small'))
  }));
  const rail = doc.querySelector('.step-list');
  out.railBefore = rail ? win.getComputedStyle(rail, '::before').left : null;
  out.numCenters = out.steps.map((s) => (s.num ? s.num.x + s.num.w / 2 : null));
  out.copyLefts = out.steps.map((s) => (s.copy ? s.copy.x : null));
  out.copyMidVsNumMid = out.steps.map((s) =>
    s.num && s.copy ? Math.round(s.copy.y + s.copy.h / 2 - (s.num.y + s.num.h / 2)) : null
  );

  const trig = doc.querySelector('.date-trigger');
  out.dateTriggerHidden = trig ? trig.hidden : 'missing';
  if (trig && !trig.hidden) {
    out.dateTrigger = box(trig);
    out.dateIcon = box(trig.querySelector('.date-trigger__icon'));
    out.dateCopy = box(trig.querySelector('.date-trigger__copy'));
    out.iconVsCopyTop = out.dateIcon && out.dateCopy ? out.dateIcon.y - out.dateCopy.y : null;
  }

  const gate = doc.querySelector('[data-consent-gate]');
  out.consentGate = box(gate);
  const sw = doc.querySelector('.consent-box .checkbox');
  out.newsSwitch = box(sw);
  out.newsSwitchCols = sw ? win.getComputedStyle(sw).gridTemplateColumns : null;

  const addr = doc.querySelector('[name="address"]');
  out.addressField = box(addr);
  out.addressAutocomplete = addr ? addr.getAttribute('autocomplete') : null;
  out.addressList = addr ? addr.getAttribute('list') : null;
  return out;
};
