/**
 * Carruleddhi gallery — minimal coverflow.
 *
 * Rewritten from a 3D cylinder to a flat, centred coverflow. Reasons:
 *   - the cylinder animated `filter: blur()` on five large cards every frame,
 *     which is a full repaint per frame and never felt smooth
 *   - cards on the far side of the ring were mirrored and unreadable
 *   - the perspective made the "front" card sit off-centre at most angles
 *
 * Now: one big centred image, two calm peeks at the sides, spring easing,
 * translate + scale + opacity only. All composited, nothing repaints.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

const IDLE_MS = 6000;
const AUTOPLAY_MS = 4200;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function setupGallery3D({ images = [], captions = [], reducedMotion = false } = {}) {
  const section = document.querySelector('[data-gallery3d]');
  const stage = document.querySelector('[data-gallery3d-stage]');
  const ring = document.querySelector('[data-gallery3d-ring]');
  const captionBox = document.querySelector('[data-gallery3d-caption]');
  if (!section || !stage || !ring) return null;

  const slides = images.filter(Boolean);
  if (slides.length < 2) {
    section.hidden = true;
    return null;
  }

  /* ----------------------------------------------------------------- build */

  ring.replaceChildren();
  /** The photo inside each card, kept for the parallax shift in render(). */
  const layers = [];
  const cards = slides.map((src, index) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'g3d__card';
    card.dataset.index = String(index);
    card.setAttribute('aria-label', captions[index] || `${index + 1}`);

    const media = document.createElement('span');
    media.className = 'g3d__media';
    const image = document.createElement('img');
    image.src = src;
    image.alt = captions[index] || '';
    image.loading = index < 2 ? 'eager' : 'lazy';
    image.decoding = 'async';
    image.draggable = false;
    media.appendChild(image);
    layers.push(image);

    card.appendChild(media);
    ring.appendChild(card);
    return card;
  });

  const count = cards.length;

  /* ----------------------------------------------------------------- state */

  const state = {
    index: 0,
    offset: 0,
    dragging: false,
    pointerId: null,
    startX: 0,
    moved: 0,
    captionFor: -1,
    autoplayTimer: 0,
    idleTimer: 0,
    settleTimer: 0
  };

  /** Signed distance from the centre, wrapping around the ends. */
  function relative(index) {
    const half = count / 2;
    let delta = index - state.index - state.offset;
    while (delta > half) delta -= count;
    while (delta < -half) delta += count;
    return delta;
  }

  const dotsHost = document.querySelector('[data-gallery3d-dots]');

  function paintDots() {
    if (!dotsHost) return;
    [...dotsHost.children].forEach((dot, index) => {
      dot.classList.toggle('is-active', index === state.index);
    });
  }

  /**
   * Remembers what the discrete properties were last set to, per card.
   *
   * `render()` runs on every frame of every tween and of every drag move.
   * `transform` and `opacity` have to be written that often — they are the
   * animation, and both are composited, so they cost almost nothing. The rest of
   * what used to be written here does not change between frames: z-index,
   * pointer-events, tabIndex, aria-hidden and a class. Each of those invalidates
   * style for the element, and two of them (tabIndex, aria-hidden) also touch the
   * accessibility tree — sixty times a second, for five cards, to set the value
   * they already had.
   *
   * Keeping the last value and writing only on a change leaves the movement
   * identical and takes the per-frame work down to the two properties that are
   * actually animating.
   */
  const cardState = cards.map(() => ({ z: -1, visible: null, front: null, exposed: null }));

  function render() {
    cards.forEach((card, index) => {
      const delta = relative(index);
      const distance = Math.abs(delta);
      const visible = distance < 2.6;

      // Cards fan out sideways with a gentle falloff, never mirrored. The offset
      // is a percentage of the card's own width, so 86 puts the neighbour just
      // clear of the centre card instead of half-swallowed by it. Neighbours stay
      // well above 0.5 opacity so all five read as a set at a glance.
      const x = delta * 86;
      const scale = clamp(1 - distance * 0.13, 0.62, 1);
      const opacity = distance < 0.5 ? 1 : clamp(1 - (distance - 0.5) * 0.42, 0, 1);

      // Side cards turn away from the viewer and lean back, which is what makes
      // the row read as a deck of photographs rather than a filmstrip. It is a
      // rotation on the same composited transform — no perspective container, no
      // blur, no filter, so the frame cost is identical to the flat version.
      const turn = clamp(-delta * 17, -34, 34);
      const lift = Math.min(distance, 2) * 9;
      const tilt = delta === 0 ? 0 : (delta > 0 ? 1.6 : -1.6);

      // Per frame: the two composited properties, and nothing else.
      card.style.transform =
        `translate3d(${x.toFixed(2)}%, ${lift.toFixed(1)}px, 0)`
        + ` rotateY(${turn.toFixed(2)}deg) rotate(${tilt}deg)`
        + ` scale(${scale.toFixed(3)})`;
      card.style.opacity = visible ? opacity.toFixed(3) : '0';

      /* Parallax: the photo slides the opposite way to its own card, so the card
         reads as a window with depth behind it rather than a flat picture being
         pushed around. The image is held slightly oversized in CSS purely so this
         shift has somewhere to go — without that headroom the edge of the photo
         would come into view as it moved.

         Only visible cards are written. The ones parked off the ends move too, and
         nobody can see them do it. */
      const layer = layers[index];
      if (layer && visible) {
        layer.style.transform = `translate3d(${(-delta * 5.5).toFixed(2)}%, 0, 0)`;
      }

      // On a change only: see the note on cardState.
      const memo = cardState[index];
      const z = 100 - Math.round(distance * 10);
      if (z !== memo.z) {
        card.style.zIndex = String(z);
        memo.z = z;
      }
      if (visible !== memo.visible) {
        card.style.pointerEvents = visible ? 'auto' : 'none';
        memo.visible = visible;
      }
      // Its own threshold, deliberately tighter than `visible`: a card can still be
      // painted at the edge of the fan while already being outside what a screen
      // reader should read out.
      const exposed = distance < 1.5;
      if (exposed !== memo.exposed) {
        card.setAttribute('aria-hidden', exposed ? 'false' : 'true');
        memo.exposed = exposed;
      }
      const front = distance < 0.5;
      if (front !== memo.front) {
        card.classList.toggle('is-front', front);
        card.tabIndex = front ? 0 : -1;
        memo.front = front;
      }
    });
    paintDots();

    // The caption belongs to whichever photo is in the middle. It used to appear
    // only after clicking the centred card, which no visitor would guess. It is
    // suppressed while a drag or a tween is in flight so the text does not swap
    // halfway through the movement.
    if (!state.dragging && Math.abs(state.offset) < 0.12 && state.captionFor !== state.index) {
      showCaption(state.index);
    }
  }

  /* -------------------------------------------------------------- movement */

  function settle() {
    // Safety net. If the tween is throttled or killed mid-flight, `offset` never
    // reaches 0 and every later `relative()` is wrong by that amount, which makes
    // the whole carousel drift and mis-route clicks. This guarantees convergence.
    window.clearTimeout(state.settleTimer);
    state.settleTimer = window.setTimeout(() => {
      if (state.dragging || state.offset === 0) return;
      state.offset = 0;
      render();
    }, 900);
  }

  function goTo(index, { immediate = false } = {}) {
    state.index = ((index % count) + count) % count;
    if (immediate || reducedMotion) {
      state.offset = 0;
      render();
      return;
    }
    gsap.killTweensOf(state);
    gsap.fromTo(state,
      { offset: state.offset },
      {
        offset: 0,
        duration: 0.72,
        ease: 'power3.out',
        onUpdate: render,
        onComplete: () => {
          state.offset = 0;
          render();
        }
      });
    settle();
  }

  function step(direction) {
    // Keep the visual position continuous while the index jumps.
    state.offset += direction;
    goTo(state.index + direction);
  }

  /* -------------------------------------------------------------- autoplay */

  function stopAutoplay() {
    window.clearInterval(state.autoplayTimer);
    state.autoplayTimer = 0;
  }

  function startAutoplay() {
    if (reducedMotion || state.autoplayTimer) return;
    state.autoplayTimer = window.setInterval(() => step(1), AUTOPLAY_MS);
  }

  function resetIdle() {
    window.clearTimeout(state.idleTimer);
    // The caption is no longer hidden here: it now tracks the centred photo, so
    // dropping it on idle would just make the text blink once every six seconds.
    state.idleTimer = window.setTimeout(startAutoplay, IDLE_MS);
  }

  function interrupt() {
    stopAutoplay();
    resetIdle();
  }

  /* --------------------------------------------------------------- caption */

  function showCaption(index) {
    if (!captionBox) return;
    captionBox.textContent = captions[index] || '';
    captionBox.classList.add('is-visible');
    state.captionFor = index;
  }

  function hideCaption() {
    captionBox?.classList.remove('is-visible');
    state.captionFor = -1;
  }

  /* ----------------------------------------------------------- interaction */

  cards.forEach((card, index) => {
    card.addEventListener('click', () => {
      if (state.moved > 6) return;
      interrupt();
      if (Math.abs(relative(index)) >= 0.5) {
        hideCaption();
        step(relative(index) > 0 ? 1 : -1);
        return;
      }
      // Already centred: toggle its caption.
      if (state.captionFor === index) hideCaption();
      else showCaption(index);
    });
  });

  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    state.dragging = true;
    state.pointerId = event.pointerId;
    state.startX = event.clientX;
    state.moved = 0;
    gsap.killTweensOf(state);
    stage.setPointerCapture?.(event.pointerId);
    stage.classList.add('is-dragging');
    interrupt();
  });

  stage.addEventListener('pointermove', (event) => {
    if (!state.dragging || event.pointerId !== state.pointerId) return;
    const dx = event.clientX - state.startX;
    state.moved = Math.abs(dx);
    // One card per ~38% of the stage width, rendered immediately so the drag
    // tracks the finger instead of waiting for the next frame.
    state.offset = -dx / (stage.clientWidth * 0.38);
    render();
  });

  const endDrag = () => {
    if (!state.dragging) return;
    state.dragging = false;
    state.pointerId = null;
    stage.classList.remove('is-dragging');
    const shift = Math.round(state.offset);
    if (shift !== 0) {
      state.offset -= shift;
      goTo(state.index + shift);
    } else {
      goTo(state.index);
    }
    resetIdle();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  stage.addEventListener('lostpointercapture', endDrag);

  stage.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') { interrupt(); step(1); }
    if (event.key === 'ArrowLeft') { interrupt(); step(-1); }
    if (event.key === 'Escape') { hideCaption(); }
  });

  document.querySelector('[data-gallery3d-prev]')?.addEventListener('click', () => { interrupt(); step(-1); });
  document.querySelector('[data-gallery3d-next]')?.addEventListener('click', () => { interrupt(); step(1); });

  /* ---------------------------------------------------------------- dots */

  if (dotsHost) {
    dotsHost.replaceChildren();
    cards.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'g3d__dot';
      dot.setAttribute('aria-label', String(index + 1));
      dot.addEventListener('click', () => {
        interrupt();
        hideCaption();
        state.offset += relative(index);
        goTo(index);
      });
      dotsHost.appendChild(dot);
    });
  }

  /* ------------------------------------------------------------- lifecycle */

  render();
  startAutoplay();
  resetIdle();

  if ('IntersectionObserver' in window) {
    const visibility = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) startAutoplay();
      else stopAutoplay();
    }, { threshold: 0.02 });
    visibility.observe(section);
  }

  window.addEventListener('resize', render, { passive: true });

  /* ------------------------------------------------------ pin + expand */

  if (reducedMotion || !gsap || !ScrollTrigger) {
    section.classList.add('is-static');
    return { render };
  }

  gsap.registerPlugin(ScrollTrigger);

  /* ============================================================
     `ignoreMobileResize` — pasek adresu nie jest zmianą rozmiaru okna.
     ============================================================
     ScrollTrigger domyślnie odświeża wszystkie swoje pomiary na zdarzeniu `resize`. Na telefonie
     `resize` przychodzi za każdym razem, gdy pasek adresu się chowa albo wraca, czyli w trakcie
     przewijania — a odświeżenie to przeliczenie pozycji wszystkich wyzwalaczy, z odczytami
     wymuszającymi układ. Ta strona ma czternaście przypiętych paneli i trzynaście tysięcy pikseli
     dokumentu, więc to nie jest tani przebieg, i wypada w najgorszym momencie.

     `ignoreMobileResize: true` każe pominąć odświeżenie, gdy zmieniła się TYLKO wysokość widoku na
     urządzeniu dotykowym. Obrót telefonu zmienia szerokość, więc jest nadal łapany.

     To jest dokładnie ta sama zasada, na której stoi `onResize` w setupPanels („width is the honest
     trigger") i pomiar `--screen-h` w site-bridge.js. Trzecie miejsce, więc warto to powiedzieć raz:
     na tej stronie ŻADEN pomiar nie ma prawa ruszyć z powodu samej zmiany wysokości widoku na
     ekranie dotykowym.

     CZEGO TU CELOWO NIE MA: `ScrollTrigger.normalizeScroll(true)`
       `normalizeScroll` przejmuje dotyk i przewija stronę z JavaScriptu, na wątku głównym, żeby
       ujednolicić zachowanie paska adresu. Na stronie, której cały układ stoi na `position: sticky`
       składanym przez kompozytor, to znaczy zamianę przewijania darmowego na przewijanie płacone z
       tego samego wątku, na którym stoi wszystko inne — czyli wprowadzenie tego konfliktu
       wirtualnego scrolla z natywnym, którego ta strona akurat nie ma (nie ma tu Lenisa ani
       Locomotive). Objawem byłoby dokładnie to, co jest naprawiane: szarpanie pod palcem.

       Poza tym nie miałoby czego naprawiać. ScrollTrigger prowadzi tu JEDNĄ animację wejścia z
       `once: true`. Nie ma tu ani jednego `scrub`, ani jednego `pin` — efekty sterowane
       przewijaniem robi własny kod w app.js, z pozycji przewijania.
     ============================================================ */
  ScrollTrigger.config({ ignoreMobileResize: true });

  const frame = section.querySelector('[data-gallery3d-frame]');
  const heading = section.querySelector('[data-gallery3d-heading]');

  /**
   * No pin, and no scrub.
   *
   * The pin made the gallery section 2.4 screens tall and translated its contents
   * while it was held, so measured mid-pin the heading sat 295 px down and the
   * caption and dots ended up 133 px below the fold. The section is now a plain
   * one-viewport panel like every other section on the page: the whole carousel,
   * its caption and its dots are on screen the moment it arrives, and the page's
   * own scroll snapping parks it.
   *
   * Only the entrance is animated, once, on its own clock.
   */
  const intro = gsap.timeline({
    scrollTrigger: { trigger: section, start: 'top 78%', once: true }
  });
  intro
    .fromTo(heading, { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'power2.out' })
    .fromTo(frame, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }, 0.08);

  window.addEventListener('load', () => ScrollTrigger.refresh());

  return { render, timeline: intro };
}
