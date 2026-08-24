import {
  DEFAULT_SITE_CONFIG,
  exportConfigRecord,
  importConfigRecord,
  isSafeAssetPath,
  isSafeProxyEndpoint,
  normalizeSiteConfig,
  readAdminDraft,
  removeAdminDraft,
  ROUTE_PATH_MAX_POINTS,
  saveAdminDraft,
  SPONSOR_MAX
} from './site-config.js';
import { ROUTE_VIEWBOX, buildRibbonPathData, buildRoutePathData } from './route-path.js';
import {
  approveWallComment,
  categoryLabel,
  deleteWallComment,
  fetchRoster,
  fetchWallComments,
  hideWallComment,
  formatDate,
  maskEmail,
  maskPhone,
  maskTaxCode,
  normaliseRow,
  parseCsv,
  rememberKey,
  sessionKey
} from './roster.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const form = $('[data-admin-form]');
const toast = $('[data-admin-toast]');
const preview = $('[data-preview]');
const importFile = $('[data-import-file]');

/**
 * Drives the whole integrations panel: the form fields, the validation, the
 * diagnostics counter and what gets written into the draft. `wall` belongs here
 * because without it the field would render but never be read or saved, and the
 * comment section would stay in demo mode no matter what was typed.
 */
const ENDPOINT_KEYS = ['registration', 'reminder', 'attendance', 'counts', 'contact', 'wall'];
const GALLERY_COUNT = DEFAULT_SITE_CONFIG.media.galleryImages.length;

/** Deep clone without structuredClone so old browsers on site laptops still work. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const state = {
  config: clone(DEFAULT_SITE_CONFIG),
  savedAt: null,
  dirty: false
};

function showToast(message, isError = false) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

function storageGet(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch (_) {
    return fallback;
  }
}

function formatTimestamp(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/* ------------------------------------------------------------------ *
 * Form <-> config mapping
 * ------------------------------------------------------------------ */

function fieldMap() {
  return {
    eventName: (config) => config.eventName,
    eventDate: (config) => config.eventDate,
    dateLabel: (config) => config.dateLabel,
    pilotsBase: (config) => config.pilotsBase,
    attendeesBase: (config) => config.attendeesBase,
    tagline: (config) => config.tagline,
    routeDistance: (config) => config.route.distance,
    routeRoad: (config) => config.route.road,
    routeMapUrl: (config) => config.route.mapUrl,
    contactEmail: (config) => config.contact.email,
    contactPhone: (config) => config.contact.phone,
    routeImage: (config) => config.media.routeImage
  };
}

function fillForm(config) {
  if (!form) return;
  Object.entries(fieldMap()).forEach(([name, read]) => {
    const control = form.elements.namedItem(name);
    if (control) control.value = String(read(config));
  });
  for (let index = 0; index < GALLERY_COUNT; index += 1) {
    const control = form.elements.namedItem(`galleryImage${index}`);
    if (control) control.value = config.media.galleryImages[index] || '';
  }
  const featureControls = {
    featureGallery: 'gallery',
    featureAttendance: 'attendance',
    featureRegistration: 'registration'
  };
  Object.entries(featureControls).forEach(([name, key]) => {
    const control = form.elements.namedItem(name);
    if (control) control.checked = Boolean(config.features[key]);
  });
  ENDPOINT_KEYS.forEach((key) => {
    const control = form.elements.namedItem(`endpoint${key[0].toUpperCase()}${key.slice(1)}`);
    if (control) control.value = config.endpoints[key] || '';
  });
}

/** Reads the raw form into a config object; normalisation happens on save. */
function readForm() {
  const value = (name) => {
    const control = form?.elements.namedItem(name);
    return control ? control.value : '';
  };
  const checked = (name) => Boolean(form?.elements.namedItem(name)?.checked);

  return {
    eventName: value('eventName'),
    eventDate: value('eventDate'),
    dateLabel: value('dateLabel'),
    tagline: value('tagline'),
    pilotsBase: value('pilotsBase'),
    attendeesBase: value('attendeesBase'),
    route: {
      distance: value('routeDistance'),
      road: value('routeRoad'),
      mapUrl: value('routeMapUrl'),
      path: clone(state.config.route.path),
      width: clone(state.config.route.width)
    },
    contact: {
      email: value('contactEmail'),
      phone: value('contactPhone')
    },
    media: {
      routeImage: value('routeImage'),
      galleryImages: Array.from({ length: GALLERY_COUNT }, (_, index) => value(`galleryImage${index}`))
    },
    sponsors: clone(state.config.sponsors),
    features: {
      gallery: checked('featureGallery'),
      attendance: checked('featureAttendance'),
      registration: checked('featureRegistration')
    },
    endpoints: Object.fromEntries(
      ENDPOINT_KEYS.map((key) => [key, value(`endpoint${key[0].toUpperCase()}${key.slice(1)}`)])
    )
  };
}

/* ------------------------------------------------------------------ *
 * Validation + live status
 * ------------------------------------------------------------------ */

function validateAssets() {
  let valid = true;
  $$('[data-asset-path]', form || document).forEach((input) => {
    const field = input.closest('.field');
    const ok = isSafeAssetPath(input.value.trim());
    field?.classList.toggle('is-invalid', !ok);
    if (!ok) valid = false;
  });
  return valid;
}

function validateEndpoints() {
  let valid = true;
  ENDPOINT_KEYS.forEach((key) => {
    const input = form?.elements.namedItem(`endpoint${key[0].toUpperCase()}${key.slice(1)}`);
    const status = $(`[data-endpoint-status="${key}"]`);
    if (!input) return;
    const raw = input.value.trim();
    const ok = isSafeProxyEndpoint(raw);
    const wrapper = input.closest('.endpoint');
    wrapper?.classList.toggle('is-invalid', !ok);
    if (status) {
      status.classList.toggle('is-live', ok && raw !== '');
      status.classList.toggle('is-error', !ok);
      status.textContent = !ok ? 'Tylko /api/carruleddhi/…' : raw === '' ? 'Tryb demo' : 'Proxy aktywne';
    }
    if (!ok) valid = false;
  });
  return valid;
}

function activeEndpointCount() {
  return ENDPOINT_KEYS.filter((key) => {
    const input = form?.elements.namedItem(`endpoint${key[0].toUpperCase()}${key.slice(1)}`);
    const raw = input ? input.value.trim() : '';
    return raw !== '' && isSafeProxyEndpoint(raw);
  }).length;
}

function paintStats() {
  const draftLabel = $('[data-stat-draft]');
  const updatedLabel = $('[data-stat-updated]');
  const draftCard = draftLabel?.closest('.stat-card');
  const saved = formatTimestamp(state.savedAt);

  if (draftLabel) draftLabel.textContent = state.dirty ? 'Niezapisany' : saved ? 'Zapisany' : 'Brak';
  if (updatedLabel) {
    updatedLabel.textContent = state.dirty
      ? 'Zmiany czekają na zapis'
      : saved ? `Zapisano ${saved}` : 'Nie zapisano zmian';
  }
  draftCard?.classList.toggle('is-dirty', state.dirty);

  const registrations = $('[data-stat-registrations]');
  if (registrations) registrations.textContent = String(Number.parseInt(storageGet('carruleddhi.registrations', '0'), 10) || 0);

  const attendance = $('[data-stat-attendance]');
  if (attendance) attendance.textContent = storageGet('carruleddhi.attended') === '1' ? 'Tak' : 'Nie';

  const endpoints = $('[data-stat-endpoints]');
  if (endpoints) endpoints.textContent = `${activeEndpointCount()}/${ENDPOINT_KEYS.length}`;

  const saveState = $('[data-save-state]');
  saveState?.closest('.save-bar')?.classList.toggle('is-dirty', state.dirty);
  if (saveState) saveState.textContent = state.dirty ? 'Niezapisane zmiany' : 'Wszystko zapisane';

  const language = $('[data-stat-language]');
  if (language) language.textContent = (storageGet('carruleddhi.lang') || 'auto').toUpperCase();

  const cookies = $('[data-stat-cookies]');
  if (cookies) {
    let consent = null;
    try { consent = JSON.parse(storageGet('carruleddhi.cookies', 'null')); } catch (_) { consent = null; }
    cookies.textContent = consent ? (consent.analytics ? 'Wszystkie' : 'Tylko niezbędne') : 'Brak';
    cookies.className = consent ? 'status-ok' : 'status-warn';
  }
}

function markDirty() {
  state.dirty = true;
  validateEndpoints();
  paintStats();
}

/* ------------------------------------------------------------------ *
 * Route path editor
 * ------------------------------------------------------------------ */

function setupRouteEditor() {
  const stage = $('[data-route-editor]');
  const image = $('[data-route-editor-image]');
  const svg = $('[data-route-editor-svg]');
  const geometry = $('[data-route-editor-line]');
  const ribbonCasing = $('[data-route-editor-ribbon="casing"]');
  const ribbonFill = $('[data-route-editor-ribbon="fill"]');
  const counter = $('[data-route-editor-count]');
  const empty = $('[data-route-editor-empty]');
  if (!stage || !image || !svg || !geometry) return { refreshImage() {}, render() {} };

  let dragIndex = -1;

  function points() {
    return state.config.route.path;
  }

  function viewHeight() {
    const box = stage.getBoundingClientRect();
    return box.width ? Math.round((box.height / box.width) * ROUTE_VIEWBOX) : 625;
  }

  /** Draws exactly what the public site draws, so the panel is a true preview. */
  function drawRibbon() {
    const height = viewHeight();
    svg.setAttribute('viewBox', `0 0 ${ROUTE_VIEWBOX} ${height}`);
    const data = buildRoutePathData(points(), ROUTE_VIEWBOX, height);
    geometry.setAttribute('d', data);
    if (!data) {
      ribbonCasing?.setAttribute('d', '');
      ribbonFill?.setAttribute('d', '');
      return;
    }
    const near = Number(state.config.route.width?.near) || 26;
    const far = Number(state.config.route.width?.far) || 5;
    ribbonCasing?.setAttribute('d', buildRibbonPathData(geometry, { near: near * 1.34, far: far * 1.5, height }));
    ribbonFill?.setAttribute('d', buildRibbonPathData(geometry, { near, far, height }));
  }

  function toUnit(event) {
    const rect = stage.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
    };
  }

  function render() {
    const list = points();
    drawRibbon();
    $$('.route-editor__handle', stage).forEach((handle) => handle.remove());
    list.forEach((point, index) => {
      const handle = document.createElement('button');
      handle.type = 'button';
      handle.className = 'route-editor__handle';
      if (index === list.length - 1) handle.classList.add('is-last');
      handle.dataset.pointIndex = String(index);
      handle.style.left = `${point.x * 100}%`;
      handle.style.top = `${point.y * 100}%`;
      handle.textContent = String(index + 1);
      handle.setAttribute('aria-label', `Punkt ${index + 1} — przeciągnij, aby przesunąć; Delete usuwa`);
      stage.appendChild(handle);
    });
    if (counter) counter.textContent = `${list.length} pkt · start żółty, meta czerwona`;
    if (empty) empty.hidden = list.length > 0;
  }

  function commit() {
    render();
    markDirty();
  }

  stage.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.route-editor__handle');
    if (handle) {
      dragIndex = Number(handle.dataset.pointIndex);
      handle.classList.add('is-dragging');
      handle.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (points().length >= ROUTE_PATH_MAX_POINTS) {
      showToast(`Maksymalnie ${ROUTE_PATH_MAX_POINTS} punktów trasy.`, true);
      return;
    }
    points().push(toUnit(event));
    commit();
  });

  stage.addEventListener('pointermove', (event) => {
    if (dragIndex < 0) return;
    const unit = toUnit(event);
    points()[dragIndex] = unit;
    const handle = $(`.route-editor__handle[data-point-index="${dragIndex}"]`, stage);
    if (handle) {
      handle.style.left = `${unit.x * 100}%`;
      handle.style.top = `${unit.y * 100}%`;
    }
    drawRibbon();
  });

  const endDrag = () => {
    if (dragIndex < 0) return;
    dragIndex = -1;
    commit();
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);

  stage.addEventListener('contextmenu', (event) => {
    const handle = event.target.closest('.route-editor__handle');
    if (!handle) return;
    event.preventDefault();
    points().splice(Number(handle.dataset.pointIndex), 1);
    commit();
  });

  stage.addEventListener('keydown', (event) => {
    const handle = document.activeElement?.closest?.('.route-editor__handle');
    if (!handle) return;
    const index = Number(handle.dataset.pointIndex);
    const step = event.shiftKey ? 0.02 : 0.005;
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
    if (nudge) {
      event.preventDefault();
      const point = points()[index];
      points()[index] = {
        x: Math.min(1, Math.max(0, point.x + nudge[0])),
        y: Math.min(1, Math.max(0, point.y + nudge[1]))
      };
      commit();
      $(`.route-editor__handle[data-point-index="${index}"]`, stage)?.focus();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      points().splice(index, 1);
      commit();
    }
  });

  $('[data-route-editor-undo]')?.addEventListener('click', () => {
    points().pop();
    commit();
  });
  $('[data-route-editor-clear]')?.addEventListener('click', () => {
    state.config.route.path = [];
    commit();
  });
  $('[data-route-editor-reset]')?.addEventListener('click', () => {
    state.config.route.path = clone(DEFAULT_SITE_CONFIG.route.path);
    commit();
    showToast('Przywrócono domyślną linię trasy.');
  });

  // Perspective sliders: live preview, no save needed to see the effect.
  $$('[data-route-width]').forEach((slider) => {
    slider.addEventListener('input', () => {
      const edge = slider.dataset.routeWidth;
      const value = Number(slider.value);
      state.config.route.width = { ...state.config.route.width, [edge]: value };
      const readout = $(`[data-route-width-${edge}-value]`);
      if (readout) readout.textContent = String(value);
      drawRibbon();
      markDirty();
    });
  });

  function syncWidths() {
    ['near', 'far'].forEach((edge) => {
      const slider = $(`[data-route-width="${edge}"]`);
      const readout = $(`[data-route-width-${edge}-value]`);
      const value = state.config.route.width?.[edge];
      if (slider && value !== undefined) slider.value = String(value);
      if (readout && value !== undefined) readout.textContent = String(value);
    });
  }

  function refreshImage() {
    const path = form?.elements.namedItem('routeImage')?.value.trim() || DEFAULT_SITE_CONFIG.media.routeImage;
    image.src = isSafeAssetPath(path) ? path : DEFAULT_SITE_CONFIG.media.routeImage;
    image.alt = 'Zdjęcie trasy używane na stronie';
  }

  image.addEventListener('load', drawRibbon);
  window.addEventListener('resize', drawRibbon, { passive: true });

  return {
    refreshImage,
    render() {
      syncWidths();
      render();
    }
  };
}

/* ------------------------------------------------------------------ *
 * Sponsors
 * ------------------------------------------------------------------ */

function setupSponsors() {
  const list = $('[data-sponsor-list]');
  const preview = $('[data-sponsor-preview]');
  if (!list) return { render() {} };

  const rows = () => state.config.sponsors;

  function renderPreview() {
    if (!preview) return;
    preview.replaceChildren();
    rows().forEach((sponsor) => {
      if (!isSafeAssetPath(sponsor.image)) return;
      const image = document.createElement('img');
      image.src = sponsor.image;
      image.alt = sponsor.name || 'Sponsor';
      preview.appendChild(image);
    });
    preview.closest('.sponsor-preview')?.classList.toggle('is-empty', preview.childElementCount === 0);
  }

  function render() {
    list.replaceChildren();
    rows().forEach((sponsor, index) => {
      const row = document.createElement('li');
      row.className = 'sponsor-row';
      row.innerHTML = `
        <span class="sponsor-row__thumb" data-thumb>${
          isSafeAssetPath(sponsor.image)
            ? `<img src="${sponsor.image}" alt="">`
            : '<span>logo</span>'
        }</span>
        <label class="field">
          <span>Nazwa</span>
          <input type="text" maxlength="80" data-sponsor-field="name" data-index="${index}" value="${sponsor.name.replace(/"/g, '&quot;')}" placeholder="np. Comune di Santa Teresa">
        </label>
        <label class="field">
          <span>Plik logo</span>
          <input type="text" data-sponsor-field="image" data-index="${index}" value="${sponsor.image}" placeholder="/assets/images/sponsor-1.png">
        </label>
        <label class="field">
          <span>Link (opcjonalnie)</span>
          <input type="url" data-sponsor-field="url" data-index="${index}" value="${sponsor.url}" placeholder="https://...">
        </label>
        <div class="sponsor-row__tools">
          <button class="icon-button" type="button" data-sponsor-move="${index}" data-dir="-1" aria-label="W górę">↑</button>
          <button class="icon-button" type="button" data-sponsor-move="${index}" data-dir="1" aria-label="W dół">↓</button>
          <button class="button button--danger" type="button" data-sponsor-remove="${index}">Usuń</button>
        </div>
      `;
      const imageInput = $('[data-sponsor-field="image"]', row);
      row.classList.toggle('is-invalid', !isSafeAssetPath(imageInput.value.trim()));
      list.appendChild(row);
    });

    if (!rows().length) {
      const empty = document.createElement('li');
      empty.className = 'sponsor-row sponsor-row--empty';
      empty.textContent = 'Brak sponsorów. Kliknij „Dodaj sponsora", aby zacząć.';
      list.appendChild(empty);
    }
    renderPreview();
  }

  list.addEventListener('input', (event) => {
    const input = event.target.closest('[data-sponsor-field]');
    if (!input) return;
    const index = Number(input.dataset.index);
    const key = input.dataset.sponsorField;
    if (!rows()[index]) return;
    rows()[index][key] = input.value;
    if (key === 'image') {
      const ok = isSafeAssetPath(input.value.trim());
      input.closest('.sponsor-row')?.classList.toggle('is-invalid', !ok);
      const thumb = $('[data-thumb]', input.closest('.sponsor-row'));
      if (thumb) thumb.innerHTML = ok ? `<img src="${input.value.trim()}" alt="">` : '<span>logo</span>';
      renderPreview();
    }
    markDirty();
  });

  list.addEventListener('click', (event) => {
    const remove = event.target.closest('[data-sponsor-remove]');
    if (remove) {
      rows().splice(Number(remove.dataset.sponsorRemove), 1);
      render();
      markDirty();
      return;
    }
    const move = event.target.closest('[data-sponsor-move]');
    if (!move) return;
    const from = Number(move.dataset.sponsorMove);
    const to = from + Number(move.dataset.dir);
    if (to < 0 || to >= rows().length) return;
    const [item] = rows().splice(from, 1);
    rows().splice(to, 0, item);
    render();
    markDirty();
  });

  $('[data-sponsor-add]')?.addEventListener('click', () => {
    if (rows().length >= SPONSOR_MAX) {
      showToast(`Maksymalnie ${SPONSOR_MAX} sponsorów.`, true);
      return;
    }
    rows().push({ name: '', image: '', url: '' });
    render();
    markDirty();
    $$('.sponsor-row [data-sponsor-field="name"]').at(-1)?.focus();
  });

  /**
   * The strip is hidden whenever the list is empty, which is correct but made it
   * look as though the feature was missing. These four neutral placeholder marks
   * ship with the project, so one click proves the band works and gives something
   * to replace file by file. No link is set: a placeholder must not point anywhere.
   */
  $('[data-sponsor-demo]')?.addEventListener('click', () => {
    const demos = [
      { name: 'Mare Gallura', image: '/assets/images/sponsors/demo-1.svg', url: '' },
      { name: 'Verdi', image: '/assets/images/sponsors/demo-2.svg', url: '' },
      { name: 'Teresa', image: '/assets/images/sponsors/demo-3.svg', url: '' },
      { name: 'Bianca Costruzioni', image: '/assets/images/sponsors/demo-4.svg', url: '' }
    ];
    const free = SPONSOR_MAX - rows().length;
    if (free <= 0) {
      showToast(`Maksymalnie ${SPONSOR_MAX} sponsorów.`, true);
      return;
    }
    rows().push(...demos.slice(0, free));
    render();
    markDirty();
    showToast('Wstawiono przykładowe logo. Zapisz i odśwież stronę.');
  });

  return { render };
}

/* ------------------------------------------------------------------ *
 * Participant roster
 * ------------------------------------------------------------------ */

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

function setupRoster() {
  const body = $('[data-roster-body]');
  const search = $('[data-roster-search]');
  const reveal = $('[data-roster-reveal]');
  const count = $('[data-roster-count]');
  const printAll = $('[data-roster-print-all]');
  const sheet = $('[data-print-sheet]');
  const keyInput = $('[data-roster-key]');
  const csvInput = $('[data-roster-csv-file]');
  if (!body) return;

  // In memory only. Reloading the tab drops every participant record.
  let rows = [];

  if (keyInput) keyInput.value = sessionKey();

  function visibleRows() {
    const term = (search?.value || '').trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [
      row.raceNumber, row.fullName, row.cartName, row.email, row.teamName, row.category
    ].join(' ').toLowerCase().includes(term));
  }

  function render() {
    const list = visibleRows();
    const show = Boolean(reveal?.checked);

    if (count) {
      count.textContent = rows.length
        ? `${list.length} z ${rows.length} ${rows.length === 1 ? 'zgłoszenia' : 'zgłoszeń'}`
        : 'Brak danych';
    }
    if (printAll) printAll.disabled = list.length === 0;

    if (!list.length) {
      body.innerHTML = `<tr class="roster__empty"><td colspan="8">${
        rows.length ? 'Nic nie pasuje do wyszukiwania.' : 'Wczytaj listę z Make albo z pliku CSV.'
      }</td></tr>`;
      return;
    }

    body.innerHTML = list.map((row, index) => `
      <tr>
        <td class="roster__num">${escapeHtml(row.raceNumber || '—')}</td>
        <td>
          <strong>${escapeHtml(row.fullName)}</strong>
          <small>${escapeHtml(formatDate(row.createdAt))}</small>
        </td>
        <td>
          ${escapeHtml(row.cartName || '—')}
          ${row.teamName ? `<small>${escapeHtml(row.teamName)}</small>` : ''}
        </td>
        <td><span class="roster__tag roster__tag--${escapeHtml(String(row.category).toLowerCase() || 'none')}">${escapeHtml(categoryLabel(row.category))}</span></td>
        <td class="roster__locale">${escapeHtml((row.locale || 'it').toUpperCase())}</td>
        <td class="roster__contact">
          <span>${escapeHtml(show ? (row.email || '—') : maskEmail(row.email))}</span>
          <small>${escapeHtml(show ? (row.phone || '—') : maskPhone(row.phone))}</small>
        </td>
        <td><span class="roster__status">${escapeHtml(row.status || 'pending')}</span></td>
        <td><button class="button button--ghost roster__print" type="button" data-print-row="${index}">Drukuj kartę</button></td>
      </tr>
    `).join('');
  }

  /** Start-list card. No signature block: only the Italian PDF is ever signed. */
  function cardMarkup(row) {
    const fields = [
      ['Numer startowy', row.raceNumber || '—'],
      ['Uczestnik', row.fullName],
      ['Data urodzenia', formatDate(row.birthDate)],
      ['Codice fiscale', maskTaxCode(row.taxCode)],
      ['E-mail', row.email || '—'],
      ['Telefon', row.phone || '—'],
      ['Adres', row.address || '—'],
      ['Pojazd', row.cartName || '—'],
      ['Kategoria', categoryLabel(row.category)],
      ['Zespół', row.teamName || '—'],
      ['Język korespondencji', (row.locale || 'it').toUpperCase()],
      ['Zgłoszenie', formatDate(row.createdAt)]
    ];
    return `
      <article class="print-card">
        <header class="print-card__head">
          <div>
            <span class="print-card__event">Carruleddhi Show 2026</span>
            <strong class="print-card__title">Karta uczestnika</strong>
            <span class="print-card__meta">17.10.2026 · Santa Teresa Gallura (SS)</span>
          </div>
          <div class="print-card__number">
            <small>NR</small>
            <b>${escapeHtml(row.raceNumber || '—')}</b>
          </div>
        </header>
        <dl class="print-card__grid">
          ${fields.map(([label, value]) => `
            <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>
          `).join('')}
        </dl>
        ${row.cartNotes ? `<p class="print-card__notes"><strong>Uwagi:</strong> ${escapeHtml(row.cartNotes)}</p>` : ''}
        <footer class="print-card__foot">
          Karta organizacyjna — bez podpisu. Podpisywany jest wyłącznie włoski PDF przesłany uczestnikowi mailem.
        </footer>
      </article>
    `;
  }

  function print(list) {
    if (!sheet || !list.length) return;
    sheet.innerHTML = list.map(cardMarkup).join('');
    document.body.classList.add('is-printing');
    const cleanup = () => {
      document.body.classList.remove('is-printing');
      sheet.innerHTML = '';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    // Let the browser lay the cards out before opening the dialog.
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  }

  function adopt(list, origin) {
    rows = list;
    render();
    showToast(`Wczytano ${list.length} ${list.length === 1 ? 'zgłoszenie' : 'zgłoszeń'} (${origin}).`);
  }

  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-print-row]');
    if (!button) return;
    const row = visibleRows()[Number(button.dataset.printRow)];
    if (row) print([row]);
  });

  printAll?.addEventListener('click', () => print(visibleRows()));
  search?.addEventListener('input', render);
  reveal?.addEventListener('change', render);

  keyInput?.addEventListener('change', () => rememberKey(keyInput.value.trim()));

  $('[data-roster-load]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const key = (keyInput?.value || '').trim();
    if (!key) {
      showToast('Najpierw wpisz hasło dostępu.', true);
      keyInput?.focus();
      return;
    }
    rememberKey(key);
    button.disabled = true;
    const original = button.textContent;
    button.textContent = 'Wczytuję…';
    try {
      adopt(await fetchRoster(key), 'Make');
    } catch (error) {
      console.error('Roster fetch failed:', error);
      showToast(error.message || 'Nie udało się wczytać listy.', true);
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });

  $('[data-roster-csv]')?.addEventListener('click', () => csvInput?.click());
  csvInput?.addEventListener('change', async () => {
    const file = csvInput.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCsv(await file.text()).map(normaliseRow);
      if (!parsed.length) throw new Error('Plik nie zawiera wierszy z danymi.');
      adopt(parsed, file.name);
    } catch (error) {
      console.error('CSV import failed:', error);
      showToast(error.message || 'Nie udało się odczytać pliku CSV.', true);
    } finally {
      csvInput.value = '';
    }
  });

  render();
}

/* ------------------------------------------------------------------ *
 * Wall moderation
 * ------------------------------------------------------------------ */

/**
 * Approve, hide or delete the messages visitors leave on the site.
 *
 * Rows are held in memory only, like the roster. After every action the local copy
 * is patched rather than the whole list refetched: a moderator working through
 * twenty messages should not wait for a round trip and lose their scroll position
 * each time, and the Worker has already confirmed the change before we get here.
 */
function setupModeration() {
  const list = $('[data-wall-mod-list]');
  if (!list) return;
  const keyInput = $('[data-roster-key]');
  const count = $('[data-wall-count]');
  const loadButton = $('[data-wall-load]');
  const filters = $$('[data-wall-filter]');

  let rows = [];
  let filter = 'pending';
  let loaded = false;

  const tallies = {
    pending: $('[data-wall-tally-pending]'),
    approved: $('[data-wall-tally-approved]'),
    all: $('[data-wall-tally-all]')
  };

  const visible = () => {
    if (filter === 'pending') return rows.filter((row) => !row.approved);
    if (filter === 'approved') return rows.filter((row) => row.approved);
    return rows;
  };

  function stars(value) {
    if (!value) return '';
    // Filled then empty, as text: this list is also read on a phone and printed
    // occasionally, and a masked icon would survive neither.
    return `<span class="moderation__stars" aria-label="Ocena ${value} z 5">${'★'.repeat(value)}${'☆'.repeat(5 - value)}</span>`;
  }

  function render() {
    if (tallies.pending) tallies.pending.textContent = String(rows.filter((row) => !row.approved).length);
    if (tallies.approved) tallies.approved.textContent = String(rows.filter((row) => row.approved).length);
    if (tallies.all) tallies.all.textContent = String(rows.length);

    const shown = visible();
    if (count) {
      count.textContent = loaded
        ? `${shown.length} z ${rows.length} ${rows.length === 1 ? 'wiadomości' : 'wiadomości'}`
        : 'Brak danych';
    }

    if (!shown.length) {
      list.innerHTML = `<li class="moderation__empty">${
        loaded
          ? (filter === 'pending' ? 'Nic nie czeka na zatwierdzenie. Wszystko przejrzane.' : 'Brak wiadomości w tym filtrze.')
          : 'Kliknij „Wczytaj wiadomości”, żeby zobaczyć, co czeka na zatwierdzenie.'
      }</li>`;
      return;
    }

    list.innerHTML = shown.map((row) => `
      <li class="moderation__item${row.approved ? ' is-approved' : ''}" data-wall-id="${escapeHtml(row.id)}">
        <div class="moderation__head">
          <strong>${escapeHtml(row.name || '—')}</strong>
          ${row.place ? `<span>${escapeHtml(row.place)}</span>` : ''}
          <span class="moderation__locale">${escapeHtml((row.locale || 'it').toUpperCase())}</span>
          ${stars(row.rating)}
          <time>${escapeHtml(formatDate(row.createdAt))}</time>
          <span class="moderation__state">${row.approved ? 'na stronie' : 'oczekuje'}</span>
        </div>
        <p class="moderation__text">${escapeHtml(row.message)}</p>
        ${row.photo ? `<a class="moderation__photo" href="${escapeHtml(row.photo)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(row.photo)}" alt="Zdjęcie od ${escapeHtml(row.name || 'uczestnika')}" loading="lazy"></a>` : ''}
        <div class="moderation__actions">
          ${row.approved
            ? '<button class="button button--ghost" type="button" data-wall-act="hide">Ukryj</button>'
            : '<button class="button button--primary" type="button" data-wall-act="approve">Zatwierdź</button>'}
          <button class="button button--danger" type="button" data-wall-act="delete">Usuń</button>
        </div>
      </li>
    `).join('');
  }

  function currentKey() {
    const key = (keyInput?.value || sessionKey() || '').trim();
    if (!key) {
      showToast('Najpierw wpisz hasło dostępu w sekcji 08.', true);
      keyInput?.focus();
      return '';
    }
    rememberKey(key);
    return key;
  }

  async function load() {
    const key = currentKey();
    if (!key) return;
    loadButton.disabled = true;
    const original = loadButton.textContent;
    loadButton.textContent = 'Wczytuję…';
    try {
      rows = await fetchWallComments(key);
      loaded = true;
      render();
      const waiting = rows.filter((row) => !row.approved).length;
      showToast(waiting
        ? `${waiting} ${waiting === 1 ? 'wiadomość czeka' : 'wiadomości czeka'} na zatwierdzenie.`
        : 'Wczytano. Nic nie czeka na zatwierdzenie.');
    } catch (error) {
      console.error('Wall fetch failed:', error);
      showToast(error.message || 'Nie udało się wczytać wiadomości.', true);
    } finally {
      loadButton.disabled = false;
      loadButton.textContent = original;
    }
  }

  loadButton?.addEventListener('click', load);

  filters.forEach((button) => {
    button.addEventListener('click', () => {
      filter = button.dataset.wallFilter;
      filters.forEach((other) => other.classList.toggle('is-active', other === button));
      render();
    });
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-wall-act]');
    if (!button) return;
    const item = button.closest('[data-wall-id]');
    const id = item?.dataset.wallId;
    const row = rows.find((entry) => entry.id === id);
    if (!row) return;

    const action = button.dataset.wallAct;
    // Deleting also removes the photo from storage and cannot be undone, so it is
    // the one action that asks first.
    if (action === 'delete' && !window.confirm(`Usunąć wiadomość od ${row.name}? Tego nie da się cofnąć.`)) return;

    const key = currentKey();
    if (!key) return;

    item.dataset.busy = 'true';
    try {
      if (action === 'approve') {
        await approveWallComment(key, id);
        row.approved = true;
        showToast('Zatwierdzone. Wiadomość jest już na stronie.');
      } else if (action === 'hide') {
        await hideWallComment(key, id);
        row.approved = false;
        showToast('Ukryte. Wiadomość zniknęła ze strony.');
      } else if (action === 'delete') {
        await deleteWallComment(key, id);
        rows = rows.filter((entry) => entry.id !== id);
        showToast('Usunięte razem ze zdjęciem.');
      }
      render();
    } catch (error) {
      console.error('Wall action failed:', error);
      showToast(error.message || 'Nie udało się wykonać akcji.', true);
      delete item.dataset.busy;
    }
  });

  render();
}

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */

function refreshPreview() {
  if (!preview) return;
  preview.src = `index.html?configPreview=1&skipIntro=1&t=${Date.now()}`;
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function loadState() {
  const draft = readAdminDraft();
  state.config = normalizeSiteConfig(draft?.config || DEFAULT_SITE_CONFIG);
  state.savedAt = draft?.updatedAt || null;
  state.dirty = false;
}

function applyState(editor, sponsors) {
  fillForm(state.config);
  validateAssets();
  validateEndpoints();
  editor.refreshImage();
  editor.render();
  sponsors.render();
  paintStats();
}

function initialize() {
  if (!form) return;
  const editor = setupRouteEditor();
  const sponsors = setupSponsors();

  loadState();
  applyState(editor, sponsors);
  setupRoster();
  setupModeration();
  refreshPreview();

  form.addEventListener('input', (event) => {
    if (event.target.matches('[data-asset-path]')) {
      validateAssets();
      if (event.target.name === 'routeImage') editor.refreshImage();
    }
    markDirty();
  });
  form.addEventListener('change', markDirty);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateAssets()) {
      showToast('Ścieżki obrazów muszą wskazywać na assets/images/…', true);
      return;
    }
    if (!validateEndpoints()) {
      showToast('Endpointy muszą być puste albo zaczynać się od /api/carruleddhi/', true);
      return;
    }
    const record = saveAdminDraft(readForm());
    state.config = record.config;
    state.savedAt = record.updatedAt;
    state.dirty = false;
    applyState(editor, sponsors);
    refreshPreview();
    showToast('Draft zapisany. Podgląd odświeżony.');
  });

  $('[data-refresh-preview]')?.addEventListener('click', refreshPreview);

  $('[data-export]')?.addEventListener('click', () => {
    const blob = new Blob([exportConfigRecord(readForm())], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carruleddhi-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Wyeksportowano konfigurację do pliku JSON.');
  });

  $('[data-import]')?.addEventListener('click', () => importFile?.click());
  importFile?.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    try {
      state.config = importConfigRecord(await file.text());
      state.dirty = true;
      applyState(editor, sponsors);
      showToast('Zaimportowano plik. Kliknij „Zapisz draft”, aby utrwalić.');
    } catch (error) {
      console.error('Import failed:', error);
      showToast('Nie udało się odczytać pliku JSON.', true);
    } finally {
      importFile.value = '';
    }
  });

  $('[data-reset]')?.addEventListener('click', () => {
    if (!window.confirm('Usunąć lokalny draft i wrócić do wartości domyślnych?')) return;
    removeAdminDraft();
    loadState();
    applyState(editor, sponsors);
    refreshPreview();
    showToast('Draft usunięty. Wróciły wartości domyślne.');
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
    event.returnValue = '';
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
else initialize();
