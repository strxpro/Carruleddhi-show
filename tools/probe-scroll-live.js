/**
 * Przeskoki przy przewijaniu, mierzone na ŻYWEJ stronie i przy prawdziwej szerokości telefonu.
 *
 *   node tools/cdp.mjs probe tools/probe-scroll-live.js --w 390 --h 844 \
 *        --origin http://127.0.0.1:4173 --url "/?skipIntro=1"
 *
 * DLACZEGO NIE WYSTARCZA probe-scroll-jump.mjs
 *   Tamta sonda chodzi przez `--dump-dom` z `--virtual-time-budget`, a to zamraża rAF,
 *   IntersectionObserver i zegar GSAP-a. Czyli mierzy stronę z wyłączonym dokładnie tym kodem,
 *   który może szarpnąć przewinięciem: obserwatorem trybu sekcji, efektem zjazdu i karuzelą.
 *   „Zero przeskoków" z tamtego pomiaru znaczy „zero przeskoków, gdy nic nie reaguje".
 *
 *   Druga luka: `--window-size` z szerokością poniżej 500 px jest przez Chrome podnoszone do
 *   500. Każdy dotychczasowy pomiar „telefonu" był robiony przy 500 px, czyli nad progami
 *   media queries 390 i 430 px. Tu szerokość idzie przez Emulation.setDeviceMetricsOverride,
 *   więc jest dokładnie taka, jak podana — patrz komentarz w cdp.mjs.
 *
 * CO ZWRACA
 *   Dla każdego kroku: gdzie poprosiliśmy, gdzie wylądowaliśmy, wysokość dokumentu i tryb
 *   sekcji. Rozróżnienie jest tu treścią: przesunięta pozycja przy stałej wysokości to ktoś
 *   przewija stronę za nas, a zmieniona wysokość to układ, który się dosuwa.
 *
 * CZEGO TA SONDA NIE ZMIERZY, I DLACZEGO NIE DA SIĘ TEGO OBEJŚĆ TUTAJ
 *   Rzutu palcem z bezwładnością. `window.scrollTo` ustawia pozycję i kończy; rzut oddaje ją
 *   przeglądarce, która dowozi ją dalej własną fizyką — a scroll-snap, kotwiczenie i korekty
 *   od `position: sticky` działają właśnie na tym wybiegu.
 *
 *   Próbowane: `Input.synthesizeScrollGesture` z `gestureSourceType: 'touch'`, czyli jedyna
 *   droga do prawdziwego rzutu z zewnątrz. W `--headless=new --disable-gpu` to wywołanie nie
 *   wraca — czeka na kompozytor, którego w tym trybie nie ma. Polecenie zostało napisane,
 *   zmierzone jako zawieszające się i usunięte, bo niedziałające narzędzie w repozytorium jest
 *   gorsze niż jego brak.
 *
 *   Wniosek praktyczny: to, co ta sonda pokazuje jako czyste, jest czyste w zakresie
 *   przewijania programowego przy prawdziwej szerokości i żywym rAF. Objaw zgłaszany wyłącznie
 *   przy rzucie palcem trzeba potwierdzić na urządzeniu.
 */
/* Wyrażenie funkcyjne, nie wywołane IIFE: cdp.mjs robi `const f = <plik>; await f(document, window)`.
   Plik kończący się na `()` daje obiekt tam, gdzie oczekiwana jest funkcja, i całość pada na
   „f is not a function". */
async (document, window) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const doc = document.documentElement;
  const out = { steps: [], jumps: [], heightChanges: [], panelChanges: [] };

  const sections = [...document.querySelectorAll('#main > section.section-card')];
  const panelState = () => sections.map((s) => `${s.id}:${s.dataset.panel || '?'}`).join(' ');

  out.viewport = `${window.innerWidth}x${window.innerHeight}`;
  out.snapType = getComputedStyle(doc).scrollSnapType;
  out.anchor = getComputedStyle(doc).overflowAnchor;
  out.panelsBefore = panelState();

  /* Płynne przewijanie z CSS wyłączone na czas pomiaru: chodzi o to, czy pozycja jest tam,
     gdzie ją postawiono, a animowane dojście do celu dawałoby fałszywe odczyty w każdym kroku.
     scroll-snap zostaje włączony — to jego wpływ chcemy zobaczyć, nie ukryć. */
  const previousBehavior = doc.style.scrollBehavior;
  doc.style.scrollBehavior = 'auto';

  let height = doc.scrollHeight;
  let panels = panelState();
  const STEP = 180;
  const limit = Math.min(60, Math.floor((doc.scrollHeight - window.innerHeight) / STEP));

  for (let i = 1; i <= limit; i += 1) {
    const asked = i * STEP;
    window.scrollTo(0, asked);
    /* Dwie klatki plus chwila: tyle, ile trzeba, żeby obserwatory zdążyły zareagować, a
       ewentualna korekta przewinięcia już się wydarzyła. Przy zamrożonym rAF ten odczyt nie
       miałby sensu — i to jest cała różnica między tą sondą a poprzednią. */
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await sleep(90);

    const landed = Math.round(window.scrollY);
    const nowHeight = doc.scrollHeight;
    const nowPanels = panelState();
    const drift = landed - asked;

    out.steps.push({ asked, landed, drift, height: nowHeight });
    // Trzy piksele tolerancji na zaokrąglenia przy skalowaniu, nie na przeskoki.
    if (Math.abs(drift) > 3) {
      const at = sections.find((s) => {
        const box = s.getBoundingClientRect();
        return box.top <= 4 && box.bottom > 4;
      });
      out.jumps.push({ asked, landed, drift, section: at ? at.id : '?' });
    }
    if (nowHeight !== height) {
      out.heightChanges.push({ asked, from: height, to: nowHeight });
      height = nowHeight;
    }
    if (nowPanels !== panels) {
      out.panelChanges.push({ asked, from: panels, to: nowPanels });
      panels = nowPanels;
    }
  }

  doc.style.scrollBehavior = previousBehavior;
  out.stepsTaken = out.steps.length;
  out.documentHeight = doc.scrollHeight;
  /* Pełna lista kroków jest długa i przy zdrowej stronie nic nie wnosi — zostaje policzona i
     odrzucona, żeby na ekranie widać było to, co się nie udało. */
  out.steps = out.steps.length;
  return out;
}
