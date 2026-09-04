/** Pasek przed i po nacisnieciu „bede tam": czy napis zostaje krotki i czy nic nie wystaje. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(2600);
  const header = document.querySelector('.site-header');
  const button = document.querySelector('.nav-attend');
  const opis = () => {
    const b = button.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const styl = getComputedStyle(button);
    return {
      napis: button.textContent.trim(),
      znakow: button.textContent.trim().length,
      szerokosc: Math.round(b.width),
      wysokoscPaska: Math.round(h.height),
      tlo: styl.backgroundColor,
      lamieSie: styl.whiteSpace,
      wystajePoza: Math.round(b.right) > Math.round(window.innerWidth),
      liniiTekstu: Math.round(b.height / parseFloat(styl.lineHeight || '16'))
    };
  };
  const przed = opis();
  /* Nachodzenie liczone wprost: czy prostokat przycisku zachodzi na sasiadow w pasku. */
  const nachodzi = () => {
    const kafle = [...header.querySelectorAll('.nav-attend, .lang-switch, .nav-toggle, .nav-live, .nav-vote')]
      .filter((el) => el.getClientRects().length)
      .map((el) => el.getBoundingClientRect());
    let ile = 0;
    for (let i = 0; i < kafle.length; i += 1) {
      for (let j = i + 1; j < kafle.length; j += 1) {
        const a = kafle[i]; const b = kafle[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) ile += 1;
      }
    }
    return ile;
  };
  const nachodziPrzed = nachodzi();
  button.click();
  await sleep(1200);
  /* Okno przypomnienia moze sie otworzyc — zamykam, zeby zmierzyc sam pasek. */
  document.querySelector('dialog[open] [data-close], dialog[open] .modal__close')?.click();
  await sleep(700);
  return { przed, nachodziPrzed, poNacisnieciu: opis(), nachodziPo: nachodzi() };
}
