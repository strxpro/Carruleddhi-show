/**
 * UWAGA: TA SONDA MIERZY `admin-legacy.html`, NIE OBECNY PANEL.
 * ===========================================================================
 * `[data-sponsor-demo]`, `[data-sponsor-list]` i `.sponsor-row` to znaczniki poprzedniego,
 * pisanego ręcznie panelu. Dzisiejszy panel to React w `src/admin/`, budowany do
 * `dist/admin.html`, i tych klas nie ma nigdzie poza `admin-legacy.html`.
 *
 * Sprawdzone: `admin-legacy.html` NIE trafia do `dist/`, więc nie ma go na produkcji.
 *
 * Uruchamiać wyłącznie tak, i tylko gdy grzebiesz w starym panelu:
 *     node tools/cdp.mjs probe tools/probe-admin-sponsors.js --url /admin-legacy.html
 */
async (doc, win) => {
  const out = {};
  const demo = doc.querySelector('[data-sponsor-demo]');
  out.demoButton = Boolean(demo);
  if (!demo) return out;

  const list = doc.querySelector('[data-sponsor-list]');
  out.rowsBefore = list.querySelectorAll('.sponsor-row:not(.sponsor-row--empty)').length;
  demo.click();
  await new Promise((r) => setTimeout(r, 400));
  out.rowsAfter = list.querySelectorAll('.sponsor-row:not(.sponsor-row--empty)').length;
  out.invalidRows = list.querySelectorAll('.sponsor-row.is-invalid').length;
  out.paths = [...list.querySelectorAll('[data-sponsor-field="image"]')].map((i) => i.value);
  const preview = doc.querySelector('[data-sponsor-preview]');
  out.previewImages = preview ? preview.querySelectorAll('img').length : 0;
  await new Promise((r) => setTimeout(r, 700));
  out.previewLoaded = preview
    ? [...preview.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0).length
    : 0;
  out.previewEmptyClass = preview?.closest('.sponsor-preview')?.classList.contains('is-empty');
  out.fileProtocolWarning = doc.documentElement.classList.contains('is-file-protocol');
  return out;
};
