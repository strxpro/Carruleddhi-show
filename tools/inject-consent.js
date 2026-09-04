/** Zapisuje zgode „tylko niezbedne" przed startem strony, zeby okno zgody nie zaslanialo
    doku przy pomiarach. Analityka wylaczona — najmniej inwazyjny wybor. */
(() => {
  try {
    localStorage.setItem('carruleddhi.cookies', JSON.stringify({
      version: 1, necessary: true, analytics: false, savedAt: new Date().toISOString()
    }));
  } catch (_) { /* tryb prywatny; okno zgody po prostu zostanie */ }
})();
