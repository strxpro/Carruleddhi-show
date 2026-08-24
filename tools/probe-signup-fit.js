async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';
  doc.documentElement.style.scrollSnapType = 'none';
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width) };
  };

  const section = doc.querySelector('#signup');
  win.scrollTo(0, section.offsetTop);
  await wait(700);

  const out = {
    viewport: win.innerHeight,
    section: { h: Math.round(section.getBoundingClientRect().height), panel: section.dataset.panel },
    steps: {}
  };
  out.section.overBy = Math.max(0, out.section.h - win.innerHeight);

  const shell = doc.querySelector('.form-shell');
  out.shell = box(shell);
  out.head = box(doc.querySelector('.signup__head'));
  out.sidebar = box(doc.querySelector('.form-sidebar'));
  out.main = box(doc.querySelector('.form-main'));

  for (const step of ['1', '2', '3']) {
    doc.querySelectorAll('[data-form-step]').forEach((s) => {
      const on = s.dataset.formStep === step;
      s.hidden = !on;
      s.classList.toggle('is-active', on);
    });
    await wait(220);
    const panel = doc.querySelector(`[data-form-step="${step}"]`);
    const rect = panel.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    out.steps[step] = {
      panelH: Math.round(rect.height),
      bottom: Math.round(rect.bottom),
      fitsViewport: rect.bottom <= win.innerHeight + 1,
      overflowsShell: Math.round(rect.bottom - shellRect.bottom),
      fields: panel.querySelectorAll('.field').length,
      shellScrolls: shell.scrollHeight > shell.clientHeight + 1
    };
  }

  out.allStepsFit = Object.values(out.steps).every((s) => s.fitsViewport);
  return out;
};
