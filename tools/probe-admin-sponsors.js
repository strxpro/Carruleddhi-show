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
