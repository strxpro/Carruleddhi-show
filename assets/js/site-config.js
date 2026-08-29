export const ADMIN_STORAGE_KEY = 'carruleddhi.adminDraft.v1';
export const SITE_CONFIG_VERSION = 1;

export const DEFAULT_SITE_CONFIG = Object.freeze({
  eventName: 'Carruleddhi Show 2026',
  eventDate: '2026-10-17T14:30:00+02:00',
  dateLabel: '17 ottobre 2026 · Santa Teresa Gallura',
  tagline: 'Nessun motore. Solo la discesa.',
  pilotsBase: 0,
  attendeesBase: 0,
  route: {
    distance: 'circa 250 m',
    road: 'Via Giuseppe Verdi',
    mapUrl: 'https://maps.app.goo.gl/MZLJyzTH3tC93Pm86',
    // Normalised 0..1 coordinates over the route photo, from start to finish.
    // Editable point by point in admin.html → "Trasa na zdjęciu".
    // Traced over assets/images/zjazd.png in the admin route editor.
    path: [
      { x: 1, y: 0.5892 },
      { x: 0.7176, y: 0.8178 },
      { x: 0.5044, y: 0.9532 },
      { x: 0.4308, y: 0.7809 },
      { x: 0.4099, y: 0.5998 }
    ],
    // Perspective: half-width of the ribbon near the camera and at the horizon.
    width: { near: 10, far: 2 }
  },
  contact: {
    email: 'info@carruleddhishow.com',
    phone: '+39 328 498 1574'
  },
  media: {
    routeImage: '/assets/images/zjazd.png',
    galleryImages: [
      '/assets/images/gallery-start.svg',
      '/assets/images/gallery-race.svg',
      '/assets/images/gallery-craft.svg',
      '/assets/images/gallery-crowd.svg',
      '/assets/images/gallery-finish.svg'
    ]
  },
  // Logo strip at the bottom of the hero. Empty list hides the whole band.
  sponsors: [],
  features: {
    gallery: true,
    attendance: true,
    registration: true,
    wall: true,
    // Prizes and the two counters at the top. Both were always on the page; they became
    // switches when the panel got the ability to turn a section off without a deploy,
    // for the weeks when the photos or the numbers are not ready to be shown.
    prizes: true,
    counters: true
  },
  endpoints: {
    registration: '',
    reminder: '',
    attendance: '',
    counts: '',
    contact: '',
    // Public wall. Both reading and writing go through this one path; the request
    // body carries `type: 'wall'` or `type: 'wall-post'`.
    wall: '',
    /* Live chat, visitor side. Defaulted like `settings` rather than left blank: the
       endpoint takes no configuration, and a blank one would mean the chat tab exists on
       the page and answers nothing. */
    chat: '/api/carruleddhi/chat',
    /* Read-only, and read once on load. Carries the sponsor list and the section
       switches the organiser set in the admin panel. Defaulted rather than left blank
       because unlike the others it takes no input and returns nothing private, so
       there is no configuration step for it to wait on. */
    settings: '/api/carruleddhi/settings',

    /* Somebody who is already on the list, typing their address into the form again.
       Defaulted for the same reason as `chat` and `settings`: there is nothing to
       configure, and a blank value would mean the form silently loses the ability to
       recognise a returning rider — which looks exactly like the old behaviour and so
       would never be reported as broken.
         entryLookup   is this address entered? (nothing is sent)
         entryCode     e-mail a six-digit code to it
         entryManage   with the code: show, correct, or withdraw */
    entryLookup: '/api/carruleddhi/entry-lookup',
    entryCode: '/api/carruleddhi/entry-code',
    entryManage: '/api/carruleddhi/entry-manage',

    /* Głosowanie publiczności. Jedna ścieżka na odczyt stanu, oddanie głosu i zmianę
       decyzji — `action` w ciele mówi, o którą z tych trzech rzeczy chodzi.

       Domyślne, jak `chat` i `settings`, i z tego samego powodu: nie ma tu czego
       konfigurować, a puste znaczyłoby stronę, która w dniu wyścigu nie otwiera
       głosowania i wygląda przy tym dokładnie tak, jak wyglądała zawsze. */
    voting: '/api/carruleddhi/voting'
  }
});

const endpointNames = Object.keys(DEFAULT_SITE_CONFIG.endpoints);
const featureNames = Object.keys(DEFAULT_SITE_CONFIG.features);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, fallback, maxLength = 180) {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : fallback;
}

function cleanCount(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) ? Math.min(1_000_000, Math.max(0, number)) : fallback;
}

function cleanDate(value, fallback) {
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(new Date(value).getTime())) return fallback;
  return value.trim().slice(0, 40);
}

export function isSafeProxyEndpoint(value) {
  if (value === '') return true;
  return typeof value === 'string'
    && /^\/api\/carruleddhi(?:\/[a-z0-9_-]+)*\/?$/i.test(value.trim());
}

function cleanEndpoint(value) {
  if (typeof value !== 'string') return '';
  const endpoint = value.trim();
  return isSafeProxyEndpoint(endpoint) ? endpoint : '';
}

export function isSafeAssetPath(value) {
  if (typeof value !== 'string') return false;
  const path = value.trim().replace(/\\/g, '/');
  return !path.includes('..')
    && !path.includes('://')
    && !path.startsWith('data:')
    && /^\/?assets\/images\/[a-z0-9_./-]+\.(?:svg|webp|avif|png|jpe?g)$/i.test(path);
}

function cleanAsset(value, fallback) {
  if (!isSafeAssetPath(value)) return fallback;
  const path = value.trim().replace(/\\/g, '/');
  // Images live in public/, so they must be root-absolute to survive the build.
  return path.startsWith('/') ? path : `/${path}`;
}

export const ROUTE_PATH_MAX_POINTS = 24;

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

/** Route points are plain 0..1 pairs so they survive JSON export and stay resolution independent. */
export function cleanRoutePath(value, fallback) {
  if (!Array.isArray(value)) return fallback;
  const points = [];
  for (const entry of value) {
    if (points.length >= ROUTE_PATH_MAX_POINTS) break;
    const source = Array.isArray(entry) ? { x: entry[0], y: entry[1] } : entry;
    if (!isRecord(source)) continue;
    const x = Number(source.x);
    const y = Number(source.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x: Math.round(clampUnit(x) * 1e4) / 1e4, y: Math.round(clampUnit(y) * 1e4) / 1e4 });
  }
  // An explicitly empty array means "draw no line"; a single point cannot form one.
  if (points.length === 0) return [];
  return points.length >= 2 ? points : fallback.map((point) => ({ ...point }));
}

export const SPONSOR_MAX = 20;

/**
 * Sponsor logos. Each entry needs a local image; the link is optional.
 * External URLs are limited to https so a sponsor cannot inject a javascript:
 * or data: target into the page.
 */
export function cleanSponsors(value) {
  if (!Array.isArray(value)) return [];
  const list = [];
  for (const entry of value) {
    if (list.length >= SPONSOR_MAX) break;
    if (!isRecord(entry)) continue;
    const image = isSafeAssetPath(entry.image) ? entry.image.trim().replace(/\\/g, '/') : '';
    if (!image) continue;
    let url = '';
    if (typeof entry.url === 'string' && entry.url.trim()) {
      try {
        const parsed = new URL(entry.url.trim());
        if (parsed.protocol === 'https:') url = parsed.href.slice(0, 500);
      } catch (_) { url = ''; }
    }
    list.push({
      name: cleanText(entry.name, '', 80),
      image: image.startsWith('/') ? image : `/${image}`,
      url
    });
  }
  return list;
}

export const ROUTE_WIDTH_RANGE = Object.freeze({ near: [8, 60], far: [1, 24] });

function cleanRouteWidth(value, fallback) {
  const source = isRecord(value) ? value : {};
  const pick = (raw, [min, max], defaultValue) => {
    const number = Number(raw);
    if (!Number.isFinite(number)) return defaultValue;
    return Math.round(Math.min(max, Math.max(min, number)));
  };
  const near = pick(source.near, ROUTE_WIDTH_RANGE.near, fallback.near);
  const far = pick(source.far, ROUTE_WIDTH_RANGE.far, fallback.far);
  // The horizon end can never be wider than the near end, or the taper inverts.
  return { near, far: Math.min(far, near - 2) };
}

function cleanMapUrl(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href.slice(0, 500) : fallback;
  } catch (_) {
    return fallback;
  }
}

export function normalizeSiteConfig(input = {}) {
  const source = isRecord(input) ? input : {};
  const route = isRecord(source.route) ? source.route : {};
  const contact = isRecord(source.contact) ? source.contact : {};
  const media = isRecord(source.media) ? source.media : {};
  const features = isRecord(source.features) ? source.features : {};
  const endpoints = isRecord(source.endpoints) ? source.endpoints : {};
  const gallerySource = Array.isArray(media.galleryImages) ? media.galleryImages : [];

  return {
    eventName: cleanText(source.eventName, DEFAULT_SITE_CONFIG.eventName, 80),
    eventDate: cleanDate(source.eventDate, DEFAULT_SITE_CONFIG.eventDate),
    dateLabel: cleanText(source.dateLabel, DEFAULT_SITE_CONFIG.dateLabel, 100),
    tagline: cleanText(source.tagline, DEFAULT_SITE_CONFIG.tagline, 150),
    pilotsBase: cleanCount(source.pilotsBase, DEFAULT_SITE_CONFIG.pilotsBase),
    attendeesBase: cleanCount(source.attendeesBase, DEFAULT_SITE_CONFIG.attendeesBase),
    route: {
      distance: cleanText(route.distance, DEFAULT_SITE_CONFIG.route.distance, 60),
      road: cleanText(route.road, DEFAULT_SITE_CONFIG.route.road, 100),
      mapUrl: cleanMapUrl(route.mapUrl, DEFAULT_SITE_CONFIG.route.mapUrl),
      path: cleanRoutePath(route.path, DEFAULT_SITE_CONFIG.route.path),
      width: cleanRouteWidth(route.width, DEFAULT_SITE_CONFIG.route.width)
    },
    contact: {
      email: cleanText(contact.email, DEFAULT_SITE_CONFIG.contact.email, 120),
      phone: cleanText(contact.phone, DEFAULT_SITE_CONFIG.contact.phone, 60)
    },
    media: {
      routeImage: cleanAsset(media.routeImage, DEFAULT_SITE_CONFIG.media.routeImage),
      galleryImages: DEFAULT_SITE_CONFIG.media.galleryImages.map((fallback, index) => cleanAsset(gallerySource[index], fallback))
    },
    sponsors: cleanSponsors(source.sponsors),
    features: Object.fromEntries(featureNames.map((name) => [name, typeof features[name] === 'boolean' ? features[name] : DEFAULT_SITE_CONFIG.features[name]])),
    /* Falls back to the built-in default rather than to an empty string.
       Every other endpoint is blank until somebody configures it, and blank means
       "this feature is off". `settings` is different: it has a working default, so an
       absent or malformed override must land back on that default and not switch the
       sponsor band off. */
    endpoints: Object.fromEntries(endpointNames.map((name) => [
      name,
      cleanEndpoint(endpoints[name]) || DEFAULT_SITE_CONFIG.endpoints[name]
    ]))
  };
}

function mergeConfig(base, overlay) {
  const first = isRecord(base) ? base : {};
  const second = isRecord(overlay) ? overlay : {};
  return {
    ...first,
    ...second,
    route: { ...(isRecord(first.route) ? first.route : {}), ...(isRecord(second.route) ? second.route : {}) },
    contact: { ...(isRecord(first.contact) ? first.contact : {}), ...(isRecord(second.contact) ? second.contact : {}) },
    media: { ...(isRecord(first.media) ? first.media : {}), ...(isRecord(second.media) ? second.media : {}) },
    sponsors: Array.isArray(second.sponsors) ? second.sponsors : first.sponsors,
    features: { ...(isRecord(first.features) ? first.features : {}), ...(isRecord(second.features) ? second.features : {}) },
    endpoints: { ...(isRecord(first.endpoints) ? first.endpoints : {}), ...(isRecord(second.endpoints) ? second.endpoints : {}) }
  };
}

function storageGet() {
  try { return localStorage.getItem(ADMIN_STORAGE_KEY); } catch (_) { return null; }
}

export function readAdminDraft() {
  const raw = storageGet();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const source = isRecord(parsed?.config) ? parsed.config : parsed;
    return {
      config: normalizeSiteConfig(source),
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
      version: Number(parsed?.version) || SITE_CONFIG_VERSION
    };
  } catch (_) {
    return null;
  }
}

export function saveAdminDraft(input) {
  const config = normalizeSiteConfig(input);
  const record = {
    version: SITE_CONFIG_VERSION,
    updatedAt: new Date().toISOString(),
    config
  };
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(record));
  return record;
}

export function removeAdminDraft() {
  try { localStorage.removeItem(ADMIN_STORAGE_KEY); } catch (_) { /* Storage can be unavailable. */ }
}

export function getPublicSiteConfig() {
  const inline = isRecord(window.CARRULEDDHI_CONFIG) ? window.CARRULEDDHI_CONFIG : {};
  const preview = new URLSearchParams(window.location.search).get('configPreview') === '1';
  const draft = preview ? readAdminDraft() : null;
  const config = normalizeSiteConfig(mergeConfig(inline, draft?.config));
  return { ...config, preview, previewUpdatedAt: draft?.updatedAt || null };
}

export function exportConfigRecord(config) {
  return JSON.stringify({
    version: SITE_CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    config: normalizeSiteConfig(config)
  }, null, 2);
}

export function importConfigRecord(raw) {
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!isRecord(parsed)) throw new Error('Nieprawidłowy format pliku JSON.');
  return normalizeSiteConfig(isRecord(parsed.config) ? parsed.config : parsed);
}
