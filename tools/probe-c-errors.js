/**
 * TOR C — przelot przez cala strone i zbior bledow konsoli.
 * Ostatni krok przed oddaniem: zmiany w CSS nie zglaszaja sie same, ale skrypt,
 * ktory sie o nie potknie, zglosi.
 */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  document.documentElement.style.scrollBehavior = 'auto';
  document.documentElement.style.scrollSnapType = 'none';
  const max = document.documentElement.scrollHeight - window.innerHeight;
  for (let i = 0; i <= 16; i += 1) { window.scrollTo(0, (max / 16) * i); await sleep(160); }
  window.scrollTo(0, 0);
  await sleep(400);
  return {
    height: document.documentElement.scrollHeight,
    sponsorZone: Boolean(document.querySelector('.sponsor-zone')),
    menuLangs: document.querySelectorAll('[data-menu-language]').length,
    sponsorAsk: Boolean(document.querySelector('[data-sponsor-ask]'))
  };
}
