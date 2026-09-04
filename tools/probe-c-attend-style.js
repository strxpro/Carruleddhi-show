async (document, window) => {
  const b = document.querySelector('.nav-attend');
  const c = getComputedStyle(b);
  return { klasy: b.className, tlo: c.backgroundColor, tekst: c.color, ramka: c.borderTopWidth + ' ' + c.borderTopColor, radius: c.borderRadius };
}
