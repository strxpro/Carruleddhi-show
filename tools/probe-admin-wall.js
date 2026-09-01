/**
 * UWAGA: TA SONDA MIERZY `admin-legacy.html`, NIE OBECNY PANEL.
 * ===========================================================================
 * Panel administratora jest dzisiaj aplikacją Reacta w `src/admin/` i buduje się do
 * `dist/admin.html`. Znaczniki, których szuka ten plik — `#moderation-title`, `.panel`,
 * `[data-wall-load]`, `.moderation__*`, `window.__wallCalls` — należą do poprzedniego,
 * pisanego ręcznie panelu, który został w repozytorium jako `admin-legacy.html`.
 *
 * Sprawdzone: `admin-legacy.html` NIE trafia do `dist/`, więc nie ma go na produkcji.
 * Ta sonda nadal przechodzi, ale odpowiada na pytanie o stronę, której nikt nie otwiera.
 *
 * Uruchamiać wyłącznie tak, i tylko gdy grzebiesz w starym panelu:
 *     node tools/cdp.mjs probe tools/probe-admin-wall.js --url /admin-legacy.html
 *
 * Zapisane, bo przegląd sond zajął się tym plikiem dwa razy, zanim ustalił, że mierzy
 * co innego, niż wygląda.
 */
(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

  const panel = $('#moderation-title')?.closest('.panel');
  if (!panel) return { fatal: 'no moderation panel' };
  const out = { navLink: Boolean($('a[href="#moderation-title"]')) };

  // Nothing loaded yet: the empty state must say what to do, not just be blank.
  out.emptyBefore = $('.moderation__empty', panel)?.textContent.trim().slice(0, 40) || '';

  // No passphrase yet, so this must refuse rather than call the proxy.
  $('[data-wall-load]').click();
  await sleep(400);
  out.callsWithoutKey = window.__wallCalls.length;
  out.toastWithoutKey = ($('[data-admin-toast]') || {}).textContent || '';

  // The integrations panel must offer the wall endpoint, otherwise the section on
  // the site can never be pointed at the proxy.
  out.wallEndpointField = Boolean($('[name="endpointWall"]'));
  out.endpointStat = $('[data-stat-endpoints]')?.textContent || '';

  $('[data-roster-key]').value = 'probe-secret';
  $('[data-wall-load]').click();
  await sleep(600);

  out.calls = window.__wallCalls.map((call) => `${call.action}:${call.key ? 'keyed' : 'nokey'}`);
  out.tallies = {
    pending: $('[data-wall-tally-pending]').textContent,
    approved: $('[data-wall-tally-approved]').textContent,
    all: $('[data-wall-tally-all]').textContent
  };
  out.count = $('[data-wall-count]').textContent;

  // Default filter is "pending", so only the two unapproved rows should show.
  out.itemsPending = $$('.moderation__item', panel).length;
  out.pendingHavePhoto = $$('.moderation__photo', panel).length;
  out.approveButtons = $$('[data-wall-act="approve"]', panel).length;
  out.hideButtons = $$('[data-wall-act="hide"]', panel).length;
  out.starRows = $$('.moderation__stars', panel).map((s) => s.textContent);

  // Approve the first pending message: it should leave the pending filter at once.
  $('[data-wall-act="approve"]', panel).click();
  await sleep(500);
  out.afterApprove = {
    items: $$('.moderation__item', panel).length,
    pending: $('[data-wall-tally-pending]').textContent,
    approved: $('[data-wall-tally-approved]').textContent,
    lastCall: window.__wallCalls[window.__wallCalls.length - 1].action
  };

  // Switch to the approved filter and check the row is there with a hide button.
  $('[data-wall-filter="approved"]').click();
  await sleep(250);
  out.approvedView = {
    items: $$('.moderation__item', panel).length,
    hideButtons: $$('[data-wall-act="hide"]', panel).length,
    approveButtons: $$('[data-wall-act="approve"]', panel).length,
    activeChip: $('.chip.is-active').dataset.wallFilter
  };

  // Hide it again.
  $('[data-wall-act="hide"]', panel).click();
  await sleep(500);
  out.afterHide = {
    pending: $('[data-wall-tally-pending]').textContent,
    approved: $('[data-wall-tally-approved]').textContent,
    lastCall: window.__wallCalls[window.__wallCalls.length - 1].action
  };

  // Delete from the "all" view.
  $('[data-wall-filter="all"]').click();
  await sleep(250);
  const before = $$('.moderation__item', panel).length;
  $('[data-wall-act="delete"]', panel).click();
  await sleep(600);
  out.afterDelete = {
    before,
    after: $$('.moderation__item', panel).length,
    all: $('[data-wall-tally-all]').textContent,
    lastCall: window.__wallCalls[window.__wallCalls.length - 1].action
  };

  // The panel must not widen the page.
  out.docWidth = document.documentElement.scrollWidth;
  out.viewport = innerWidth;
  const rect = panel.getBoundingClientRect();
  out.panelWidth = Math.round(rect.width);
  return out;
})
