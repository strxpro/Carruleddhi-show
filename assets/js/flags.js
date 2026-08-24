/**
 * Inline SVG flags.
 *
 * Windows ships no colour emoji for regional indicator pairs, so 🇵🇱 renders as
 * the bare letters "PL" in Chrome and Edge. These small SVGs render identically
 * on every platform and keep the picker readable at 20px.
 */

const FLAG_BODIES = Object.freeze({
  it: '<rect width="8" height="16" fill="#009246"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#ce2b37"/>',
  pl: '<rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#dc143c"/>',
  en: '<rect width="24" height="16" fill="#012169"/>'
    + '<path d="M0 0l24 16M24 0L0 16" stroke="#fff" stroke-width="3.2"/>'
    + '<path d="M0 0l24 16M24 0L0 16" stroke="#c8102e" stroke-width="1.9"/>'
    + '<path d="M12 0v16M0 8h24" stroke="#fff" stroke-width="5.4"/>'
    + '<path d="M12 0v16M0 8h24" stroke="#c8102e" stroke-width="3.2"/>',
  de: '<rect width="24" height="5.34" fill="#000"/><rect y="5.34" width="24" height="5.33" fill="#dd0000"/><rect y="10.67" width="24" height="5.33" fill="#ffce00"/>',
  es: '<rect width="24" height="16" fill="#aa151b"/><rect y="4" width="24" height="8" fill="#f1bf00"/>',
  fr: '<rect width="8" height="16" fill="#002654"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#ed2939"/>'
});

const FLAG_TITLES = Object.freeze({
  it: 'Italia', pl: 'Polska', en: 'United Kingdom', de: 'Deutschland', es: 'España', fr: 'France'
});

let clipSeed = 0;

/** Returns a self-contained SVG string. `decorative` hides it from assistive tech. */
export function flagSvg(locale, { decorative = true, size = 22 } = {}) {
  const body = FLAG_BODIES[locale];
  if (!body) return '';
  const label = FLAG_TITLES[locale] || locale.toUpperCase();
  const a11y = decorative
    ? 'aria-hidden="true" focusable="false"'
    : `role="img" aria-label="${label}"`;
  clipSeed += 1;
  const clipId = `flag-clip-${locale}-${clipSeed}`;
  return `<svg class="flag" viewBox="0 0 24 16" width="${size}" height="${Math.round((size / 24) * 16)}" ${a11y}>`
    + `<defs><clipPath id="${clipId}"><rect width="24" height="16" rx="2.6"/></clipPath></defs>`
    + `<g clip-path="url(#${clipId})">${body}</g>`
    + '<rect width="24" height="16" rx="2.6" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="1"/>'
    + '</svg>';
}

export { FLAG_TITLES };
