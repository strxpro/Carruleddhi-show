/* The harness evaluates this file to a function and calls it. Not an IIFE. */
(async () => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

  const section = $('#wall');
  if (!section) return { fatal: 'no #wall' };
  document.documentElement.style.scrollSnapType = 'none';
  section.scrollIntoView({ behavior: 'auto', block: 'start' });
  await sleep(900);

  const out = { hidden: section.hidden, state: section.dataset.wallState || '' };

  // --- star picker: are the five labels laid out 1..5 left to right?
  const labels = $$('.wall-stars__star', section);
  out.stars = labels.length;
  out.starOrder = labels
    .map((label) => ({ value: label.htmlFor.replace('wall-star-', ''), x: label.getBoundingClientRect().left }))
    .sort((a, b) => a.x - b.x)
    .map((entry) => entry.value)
    .join('');

  // Committed score: click the third visual star, count how many are yellow.
  const byX = labels.slice().sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  byX[2].click();
  // Past the 160 ms colour transition, so the read is the settled colour rather than
  // a frame in the middle of the fade.
  await sleep(500);
  const colours = () => byX.map((label) => getComputedStyle(label).backgroundColor);
  out.pickedValue = Number(($('.wall-stars__input:checked', section) || {}).value || 0);
  out.starColours = colours().join(' | ');
  const grey = 'rgb(216, 220, 235)';
  out.litAfterPick = colours().filter((c) => c !== grey).length;
  out.clearVisible = !$('[data-wall-stars-clear]', section).hidden;

  // --- average badge
  const score = $('[data-wall-score]', section);
  out.scoreHidden = score.hidden;
  out.scoreValue = $('[data-wall-score-value]', section).textContent;
  out.scoreVotes = $('[data-wall-score-votes]', section).textContent;
  out.scoreFills = $$('.wall-score__star', section).map((s) => s.dataset.fill).join(',');

  // --- notes
  const notes = $$('.wall-note', section);
  out.notes = notes.length;
  out.notesWithStars = $$('.wall-note__stars', section).length;
  out.notesWithPhoto = $$('.wall-note__photo', section).length;
  out.translateButtons = $$('.wall-note__translate', section).length;
  out.photoBoxes = $$('.wall-note__photo', section).map((b) => {
    const r = b.getBoundingClientRect();
    return `${Math.round(r.width)}x${Math.round(r.height)}`;
  });

  // --- translation round trip
  const translate = $('.wall-note__translate', section);
  if (translate) {
    const note = translate.closest('.wall-note');
    const before = $('.wall-note__text', note).textContent;
    translate.click();
    await sleep(400);
    const after = $('.wall-note__text', note).textContent;
    out.translateChanged = before !== after;
    out.translateLabel = translate.textContent;
    out.translatedFlag = note.dataset.translated;
    translate.click();
    await sleep(120);
    out.translateRestored = $('.wall-note__text', note).textContent === before;
  }

  // --- lightbox
  const photoButton = $('.wall-note__photo', section);
  if (photoButton) {
    photoButton.click();
    await sleep(300);
    const box = $('[data-wall-lightbox]');
    out.lightboxOpen = box.open === true || box.hasAttribute('open');
    const close = $('[data-wall-lightbox-close]', box);
    const cr = close.getBoundingClientRect();
    const br = box.getBoundingClientRect();
    out.closeRound = getComputedStyle(close).borderRadius;
    out.closeTopRight = cr.top < br.top + 30 && cr.right > br.right - 30;
    out.closeOnScreen = cr.top >= 0 && cr.right <= innerWidth;
    close.click();
    await sleep(250);
    out.lightboxClosed = !(box.open === true || box.hasAttribute('open'));
  }

  // --- photo downscale + submit, driven through the real input
  const canvas = document.createElement('canvas');
  canvas.width = 3200;
  canvas.height = 2400;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff5500';
  ctx.fillRect(0, 0, 3200, 2400);
  const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
  out.sourceKB = Math.round(blob.size / 1024);

  const file = new File([blob], 'test.png', { type: 'image/png' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const input = $('#wall-file');
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(1200);
  out.previewShown = !$('[data-wall-photo-preview]', section).hidden;
  out.photoHint = $('[data-wall-photo-hint]', section).textContent;

  $('#wall-name').value = 'Probe';
  $('#wall-message').value = 'Messaggio di prova abbastanza lungo per passare.';
  $('[data-wall-form]', section).requestSubmit();
  await sleep(900);
  out.sent = window.__lastWallPost || null;
  out.status = $('[data-wall-status]', section).textContent;
  out.previewAfterSend = !$('[data-wall-photo-preview]', section).hidden;

  // --- no sideways scroll introduced by any of this
  out.docWidth = document.documentElement.scrollWidth;
  out.viewport = innerWidth;

  return out;
})
