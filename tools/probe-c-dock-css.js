async (document) => {
  await new Promise((r) => setTimeout(r, 2500));
  const s = getComputedStyle(document.querySelector('[data-quick-actions]'));
  return { position: s.position, left: s.left, right: s.right, bottom: s.bottom, display: s.display, gridTemplateColumns: s.gridTemplateColumns, margin: s.margin };
}
