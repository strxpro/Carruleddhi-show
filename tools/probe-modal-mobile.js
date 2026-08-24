async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const out = { viewport: { w: win.innerWidth, h: win.innerHeight } };
  doc.documentElement.style.scrollBehavior = 'auto';

  /* ------------------------------------------------ reminder dialog alignment */
  win.scrollTo(0, doc.querySelector('#attendance').getBoundingClientRect().top + win.scrollY);
  await wait(600);
  doc.querySelector('[data-attendance-button]').click();
  await wait(900);
  const modal = doc.querySelector('.modal.is-open');
  out.reminder = { opened: Boolean(modal) };
  if (modal) {
    const dialog = modal.querySelector('.modal__dialog');
    const d = box(dialog);
    out.reminder.dialog = d;
    out.reminder.topReachable = d.y >= -1;
    out.reminder.fitsWidth = d.x >= 0 && d.x + d.w <= win.innerWidth + 1;
    out.reminder.horizontalGap = [d.x, Math.round(win.innerWidth - (d.x + d.w))];
    out.reminder.centred = Math.abs(out.reminder.horizontalGap[0] - out.reminder.horizontalGap[1]) <= 2;
    out.reminder.fitsHeight = d.h <= win.innerHeight + 1;
    out.reminder.modalScrolls = win.getComputedStyle(modal).overflowY;
    out.reminder.closeButton = box(modal.querySelector('.modal__close'));
    out.reminder.closeInside = out.reminder.closeButton.x >= d.x
      && out.reminder.closeButton.x + out.reminder.closeButton.w <= d.x + d.w;
    const chips = [...modal.querySelectorAll('.reminder-times span')].map(box);
    out.reminder.timeChips = chips;
    out.reminder.chipsOnOneRow = chips.every((c) => c.y === chips[0].y);
    // Anything wider than the dialog is copy spilling out of the card.
    const spills = [...dialog.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.left < d.x - 1 || r.right > d.x + d.w + 1);
    });
    out.reminder.spillingElements = spills.length;
    out.reminder.spillSamples = spills.slice(0, 4).map((el) => String(el.className || el.tagName).slice(0, 30));
    modal.classList.remove('is-open');
    doc.body.classList.remove('is-locked');
  }
  await wait(400);

  /* ---------------------------------------------------- consent reader sheet */
  doc.querySelectorAll('[data-form-step]').forEach((s) => {
    const third = s.dataset.formStep === '3';
    s.hidden = !third;
    s.classList.toggle('is-active', third);
  });
  win.scrollTo(0, doc.querySelector('#signup').getBoundingClientRect().top + win.scrollY);
  await wait(500);
  const dlg = doc.querySelector('[data-consent-dialog]');
  doc.querySelector('[data-consent-gate]').click();
  await wait(1200);
  out.consent = { open: dlg.open };
  if (dlg.open) {
    const surface = box(dlg.querySelector('.consent-dialog__surface'));
    out.consent.surface = surface;
    out.consent.fillsWidth = surface.w >= win.innerWidth - 2;
    out.consent.fillsHeight = surface.h >= win.innerHeight - 2;
    out.consent.acceptButton = box(dlg.querySelector('[data-consent-accept]'));
    out.consent.acceptVisible = out.consent.acceptButton.y + out.consent.acceptButton.h <= win.innerHeight + 1;
    dlg.close();
  }
  return out;
};
