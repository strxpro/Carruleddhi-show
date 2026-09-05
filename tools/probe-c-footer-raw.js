/** Surowa struktura kolumny „Odkrywaj" w stopce — wszystko, nie tylko odsylacze. */
async (document) => {
  await new Promise((r) => setTimeout(r, 3400));
  const stopka = document.querySelector('.site-footer');
  const kolumny = [...stopka.querySelectorAll('h3')].map((h) => {
    const rodzic = h.parentElement;
    return {
      naglowek: h.textContent.trim(),
      rodzic: rodzic.tagName.toLowerCase() + '.' + String(rodzic.className).split(' ')[0],
      dzieci: [...rodzic.children].map((c) => ({
        tag: c.tagName.toLowerCase() + (c.className ? '.' + String(c.className).split(' ')[0] : ''),
        tekst: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 70),
        widoczne: c.getClientRects().length > 0
      }))
    };
  });
  return { kolumny };
}
