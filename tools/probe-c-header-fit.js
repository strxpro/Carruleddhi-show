/** Czy zawartosc paska miesci sie w pasku — na kazdej szerokosci osobno. */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(700);
  const shell = document.querySelector('.nav-shell');
  const r = shell.getBoundingClientRect();
  const cs = getComputedStyle(shell);
  const kids = [...shell.children].map((el) => {
    const b = el.getBoundingClientRect();
    return { co: el.className.split(' ')[0], x: Math.round(b.x), w: Math.round(b.width), prawa: Math.round(b.right) };
  }).filter((k) => k.w > 0);
  const attend = document.querySelector('.nav-attend');
  const ab = attend?.getBoundingClientRect();
  return {
    szerokosc: window.innerWidth,
    pasek: { x: Math.round(r.x), w: Math.round(r.width), prawa: Math.round(r.right) },
    padding: cs.paddingLeft + ' / ' + cs.paddingRight,
    dzieci: kids,
    /* Dodatnie = cos wystaje poza prawa krawedz paska. */
    wystaje: Math.max(0, Math.round(Math.max(...kids.map((k) => k.prawa)) - (r.right - parseFloat(cs.paddingRight)))),
    bedeTam: ab ? { w: Math.round(ab.width), h: Math.round(ab.height), tekst: attend.textContent.trim(), przycieciePoziome: attend.scrollWidth > attend.clientWidth + 1 } : null
  };
}
