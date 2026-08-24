async (doc, win) => {
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const out = {};
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };

  /* --- fonts ------------------------------------------------------------- */
  out.fonts = [...doc.fonts].map((f) => `${f.family}/${f.status}`);
  out.displayFont = win.getComputedStyle(doc.querySelector('.hero__title')).fontFamily.split(',')[0].replace(/"/g, '');
  out.displayWeight = win.getComputedStyle(doc.querySelector('.hero__title')).fontWeight;
  out.bodyFont = win.getComputedStyle(doc.body).fontFamily.split(',')[0].replace(/"/g, '');

  /* --- stepper ----------------------------------------------------------- */
  const signup = doc.querySelector('#signup');
  win.scrollTo(0, signup.getBoundingClientRect().top + win.scrollY);
  await new Promise((r) => setTimeout(r, 500));
  const steps = [...doc.querySelectorAll('.step-indicator')];
  out.activeIndex = steps.findIndex((s) => s.classList.contains('is-active'));
  const nums = steps.map((s) => box(s.querySelector('.step-indicator__number')));
  const copies = steps.map((s) => box(s.querySelector('.step-indicator__copy')));
  out.numLefts = nums.map((n) => n && n.x);
  out.copyLefts = copies.map((c) => c && c.x);
  out.numLeftSpread = Math.max(...out.numLefts) - Math.min(...out.numLefts);
  out.copyLeftSpread = Math.max(...out.copyLefts) - Math.min(...out.copyLefts);
  const rail = doc.querySelector('.step-list');
  const railCS = win.getComputedStyle(rail, '::before');
  const railLeft = parseFloat(railCS.left);
  const railW = parseFloat(railCS.width);
  const railCentre = Math.round(box(rail).x + railLeft + railW / 2);
  out.railCentre = railCentre;
  out.numCentres = nums.map((n) => n && Math.round(n.x + n.w / 2));
  out.railVsCircle = out.numCentres.map((c) => c - railCentre);
  out.copyMidVsNumMid = steps.map((s, i) =>
    nums[i] && copies[i] ? Math.round(copies[i].y + copies[i].h / 2 - (nums[i].y + nums[i].h / 2)) : null
  );

  /* --- date button lines up with the inputs beside it -------------------- */
  const trig = doc.querySelector('.date-trigger');
  const firstInput = doc.querySelector('#first-name');
  out.dateTriggerH = trig && !trig.hidden ? box(trig).h : 'hidden';
  out.inputH = box(firstInput).h;
  out.dateVsInputH = typeof out.dateTriggerH === 'number' ? out.dateTriggerH - out.inputH : null;
  out.dateIcon = trig && !trig.hidden ? box(trig.querySelector('.date-trigger__icon')) : null;
  const strong = trig && !trig.hidden ? box(trig.querySelector('.date-trigger__copy strong')) : null;
  out.iconTopVsValueTop = out.dateIcon && strong ? out.dateIcon.y - strong.y : null;

  /* --- confetti ---------------------------------------------------------- */
  const press = doc.querySelector('[data-attendance-button]');
  win.scrollTo(0, doc.querySelector('#attendance').getBoundingClientRect().top + win.scrollY);
  await new Promise((r) => setTimeout(r, 400));
  press.click();
  await new Promise((r) => setTimeout(r, 120));
  out.confettiAfterClick = doc.querySelectorAll('.confetti-piece').length;
  const piece = doc.querySelector('.confetti-piece');
  out.confettiAnim = piece ? win.getComputedStyle(piece).animationName : null;
  await new Promise((r) => setTimeout(r, 2600));
  out.confettiAfterSettle = doc.querySelectorAll('.confetti-piece').length;

  /* --- attendance background must be still ------------------------------ */
  out.attendanceAnim = win.getComputedStyle(doc.querySelector('.attendance'), '::before').animationName;

  /* --- button press shadow --------------------------------------------- */
  const btn = doc.querySelector('.btn');
  out.btnShadow = win.getComputedStyle(btn).boxShadow;
  return out;
};
