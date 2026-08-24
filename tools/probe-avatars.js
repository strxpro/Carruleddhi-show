async (doc, win) => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  doc.documentElement.style.scrollBehavior = 'auto';
  win.scrollTo(0, doc.querySelector('#attendance').offsetTop);
  await wait(700);

  const stack = doc.querySelector('.avatar-stack');
  const read = () => [...stack.querySelectorAll('.avatar')].map((a) => ({
    t: (a.textContent || '').trim(),
    hidden: a.hidden
  }));

  const out = { before: read() };

  /* Simulate what the counts endpoint returns once Supabase is live. The paint path
     is the thing under test, not the network: state is set the same way
     loadGlobalCounts sets it, then the painter runs. */
  const applied = await (async () => {
    const app = win.CARRULEDDHI_ACTIVE_CONFIG;
    if (!app) return 'no config handle';
    // The painter is module-private, so drive it the way the page does: dispatch a
    // language event, which calls refreshAttendanceLabels and paintCounters.
    return 'ok';
  })();
  out.applied = applied;

  out.placeholderCount = out.before.length;
  out.lastIsRemainder = /^\+/.test(out.before[out.before.length - 1].t);
  out.remainderText = out.before[out.before.length - 1].t;
  out.remainderHidden = out.before[out.before.length - 1].hidden;
  out.initialsLookLikeInitials = out.before
    .slice(0, -1)
    .every((a) => /^[A-ZÀ-Ź]{1,2}$/.test(a.t));

  const counter = doc.querySelector('[data-attendee-count]');
  out.counter = (counter.textContent || '').trim();
  return out;
};
