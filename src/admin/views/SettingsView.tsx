import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  ExternalLink,
  Globe,
  Images,
  ImagePlus,
  Lock,
  LogOut,
  Megaphone,
  Plus,
  Trash2,
  Unlock
} from 'lucide-react';
import type { PanelLocale, TranslateKey } from '../i18n';
import {
  fetchSettings,
  saveSettings,
  uploadGalleryImage,
  uploadSponsorLogo,
  type AiStatus,
  type SiteSettings,
  type Sponsor
} from '../api';
import { PurgePanel } from './PurgePanel';
import { EditionWizard } from './EditionWizard';
import { SponsorLeads } from './SponsorLeads';

function ArmedDeleteButton({ onConfirm, title }: { onConfirm: () => void, title: string }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>(0);

  const disarm = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    setArmed(false);
  }, []);

  useEffect(() => disarm, [disarm]);

  return (
    <button
      type="button"
      onClick={() => {
        if (armed) {
          disarm();
          onConfirm();
        } else {
          setArmed(true);
          timer.current = window.setTimeout(disarm, 5000);
        }
      }}
      title={title}
      aria-label={title}
      className={
        armed
          ? 'grid size-8 place-items-center rounded-lg bg-coral text-white'
          : 'grid size-8 place-items-center rounded-lg text-coral/70 hover:bg-coral hover:text-white'
      }
    >
      <Trash2 className="size-4" />
    </button>
  );
}

/**
 * Settings, and the two things that used to need a developer.
 *
 * The password gate on the whole site and the sponsor list both lived in files: one in
 * a Vercel environment variable, the other in the repository. Both change at times when
 * nobody is at a laptop — the gate comes off on the morning of the event, and a sponsor
 * confirms by phone the week before. They are switches now, stored in Supabase and read
 * by the middleware and the public page.
 *
 * Sponsors are edited locally and written on one press, because a list you are halfway
 * through reordering is not a list to publish; the switches save immediately, because a
 * switch has no halfway.
 *
 * Karta wydarzenia jest trzecim przypadkiem i zachowuje się jak przełączniki, tylko z
 * odczekaniem. Trzy pola — nazwa, termin, miejsce — zapisują się same po EVENT_AUTOSAVE_MS
 * od ostatniego uderzenia w klawiaturę. Powód jest ze zgłoszenia: guzik zapisu był wyłączony
 * dopóki nic nie zmieniono i wyblakły po zapisie, więc wyglądał jak ozdoba, a nie jak
 * przycisk — data zmieniona i porzucona bez kliknięcia po prostu nie trafiała do bazy.
 * Guzik został, bo pozwala nie czekać na odliczanie, ale nie jest już jedyną drogą.
 */

const MAX_LOGO_EDGE = 480;
const MAX_LOGO_BYTES = 900_000;

/*
 * SUFIT GALERII: DWANAŚCIE KADRÓW — DZIŚ TYLKO JAKO NOTATKA, BEZ STAŁEJ.
 * ============================================================================
 * Liczba żyje w `worker/index.js` (`GALLERY_MAX`, tam pełne uzasadnienie) i w
 * `assets/js/site-config.js`. Trzecia kopia stała tutaj, żeby guzik „Dodaj zdjęcie" gasł PRZED
 * wgraniem trzynastego pliku — ale tego guzika w tej karcie NIE MA: kafelki są stałej liczby i
 * da się je tylko podmieniać. Stała bez ani jednego odczytu nie przechodzi `noUnusedLocals`,
 * więc została z niej ta notatka: wiedza zostaje, martwy kod nie.
 *
 * Gdy dodawanie i usuwanie kadrów wróci na tę kartę, sufit wraca tu jako `const GALLERY_MAX`
 * i gasi guzik po dwunastym kadrze. Bez niego panel zmniejszy zdjęcie, wyśle je do bucketa,
 * dostanie odmowę `SETTINGS_GALLERY_SIZE` i pokaże „nie udało się zapisać" — z plikiem, który
 * już leży na serwerze i nikt go nie użyje.
 */

/**
 * Ile czekać od ostatniego uderzenia w klawiaturę w polu podpisu, zanim poleci zapis.
 *
 * Tyle samo co wcześniej. Krócej i dwudziestoznakowy podpis to dwadzieścia zapisów, z
 * których dziewiętnaście zapisuje ucięty tekst; dłużej i ktoś zdąży zamknąć kartę przed
 * zapisem. Dodanie, usunięcie i przestawienie kadru NIE korzystają z odczekania — to są
 * pojedyncze decyzje, nie pisanie, więc zapisują się od razu.
 */
const GALLERY_AUTOSAVE_MS = 800;

/**
 * Podpisy dociągnięte do liczby zdjęć.
 *
 * Ten sam warunek co `alignGalleryCaptions` w workerze i `cleanGalleryCaptions` na stronie
 * publicznej. Tutaj jest potrzebny, bo wiersz w bazie mógł być zapisany starszą wersją
 * (pięć podpisów na sztywno), a wtedy `settings.galleryCaptions[7]` jest `undefined` —
 * czyli pole tekstowe bez wartości, które React uznaje za niekontrolowane i zaczyna
 * wypisywać ostrzeżenia, a wpisany w nie podpis nie ma gdzie trafić.
 */
function alignCaptions(images: string[], captions: string[]): string[] {
  return images.map((_image, index) => captions[index] ?? '');
}

/**
 * Shrinks a picked file to something sensible before it is uploaded.
 *
 * A logo taken from a phone's gallery is three thousand pixels wide and four megabytes,
 * for a tile that renders at 160. Done in the browser rather than server-side because
 * the browser already has the pixels and the alternative is pushing four megabytes
 * through a serverless function to throw most of it away.
 */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('decode'));
      image.onload = () => {
        const scale = Math.min(1, MAX_LOGO_EDGE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d');
        if (!context) return reject(new Error('canvas'));
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        /* PNG, not JPEG. A logo is flat colour on a background that is often meant to
           be white, and JPEG puts a halo around every edge of it. Falls back to JPEG
           only if the PNG comes out too big to be worth sending. */
        let out = canvas.toDataURL('image/png');
        if (out.length > MAX_LOGO_BYTES) out = canvas.toDataURL('image/jpeg', 0.86);
        resolve(out);
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

async function downscaleGallery(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > 1600 ? 1600 / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.84);
}

const EMPTY: SiteSettings = {
  siteLocked: true,
  sponsors: [],
  showGallery: true,
  showWall: true,
  showPrizes: true,
  showCounters: true,
  eventName: 'Carruleddhi Show 2026',
  eventDate: '2026-10-17T12:30:00.000Z',
  eventLocation: 'Santa Teresa Gallura',
  galleryImages: [
    '/assets/images/gallery-start.svg',
    '/assets/images/gallery-race.svg',
    '/assets/images/gallery-craft.svg',
    '/assets/images/gallery-crowd.svg',
    '/assets/images/gallery-finish.svg'
  ],
  galleryCaptions: ['', '', '', '', ''],
  galleryPreviewUrls: [
    '/assets/images/gallery-start.svg',
    '/assets/images/gallery-race.svg',
    '/assets/images/gallery-craft.svg',
    '/assets/images/gallery-crowd.svg',
    '/assets/images/gallery-finish.svg'
  ],
  announcementEventDate: ''
};

/**
 * Podpisane adresy podglądu, ułożone WEDŁUG ŚCIEŻKI, nie według pozycji.
 *
 * JAKI BŁĄD TO ZAPOBIEGA
 *   Wcześniej kafelek szukał swojego podglądu przez `settings.galleryPreviewUrls[index]`.
 *   Dopóki kolejności nie dało się zmienić, indeks był tym samym co ścieżka. Od teraz da
 *   się przestawiać i usuwać kadry, a wtedy indeks znaczy coś innego niż w chwili odczytu:
 *   po przesunięciu kadru z pozycji trzeciej na pierwszą kafelek pierwszy pokazywałby
 *   podpisany adres zdjęcia, które stoi teraz na trzeciej pozycji. Dwa kafelki z tym samym
 *   obrazkiem i żaden z tym, który naprawdę mają.
 *
 *   Klucz ze ścieżki nie zależy od kolejności, więc przestawianie kafelków jest wtedy
 *   przestawianiem kafelków, a nie także przestawianiem obrazków między nimi.
 */
function galleryPreviewMap(settings: SiteSettings): Record<string, string> {
  const map: Record<string, string> = {};
  settings.galleryImages.forEach((path, index) => {
    const url = settings.galleryPreviewUrls[index];
    if (url) map[path] = url;
  });
  return map;
}

function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* ------------------------------------------------ autozapis karty wydarzenia */

/**
 * Ile czekać od ostatniej zmiany, zanim poleci zapis.
 *
 * Sekunda z małym zapasem. Krócej i pole „Nazwa edycji" wysyłałoby po żądaniu na literę —
 * przy dwudziestoznakowej nazwie to dwadzieścia zapisów do Supabase, z których dziewiętnaście
 * zapisuje ucięty tekst. Dłużej i ktoś zdąży zamknąć kartę przed zapisem, czyli wracamy do
 * błędu, który to naprawia.
 */
const EVENT_AUTOSAVE_MS = 1100;

/* Rozsądny przedział roku. Natywny wybierak `datetime-local` w Chrome oddaje wartość po
   każdym wpisanym znaku, więc w drodze do „2027" przechodzi przez „0002" i „0202" —
   a `new Date('0002-10-17T12:30')` jest poprawną datą, nie błędem. Bez tego zakresu
   autozapis wysłałby rok 0002, Worker by go przyjął (waliduje tylko parsowalność) i licznik
   na stronie głównej stanąłby na zerach, bo termin wypadłby dwa tysiące lat temu. */
const EVENT_YEAR_MIN = 2020;
const EVENT_YEAR_MAX = 2100;

/**
 * ISO obcięte do minuty, do porównywania wersji roboczej z zapisaną.
 *
 * `input[type="datetime-local"]` bez atrybutu `step` nie ma pola sekund, więc `toLocalInput`
 * je gubi, a droga powrotna wstawia zera: zapisane `12:30:45.000Z` wraca jako `12:30:00.000Z`.
 * Przy porównaniu pełnych ISO obieg nie jest wierny i `eventDirty` byłby prawdziwy od razu po
 * `fetchSettings`, bez niczyjej zmiany. Autozapis wystrzeliłby wtedy przy każdym wejściu na
 * ekran ustawień i po cichu wyzerował sekundy — a to nie jest kosmetyka: Worker uznaje edycję
 * za ogłoszoną przez `announcementEventDate === eventDate`, porównując napisy dokładnie, więc
 * przepisanie terminu o 45 sekund kasuje ślad ogłoszenia i „Ogłoś…" znów staje się klikalne
 * dla tej samej edycji.
 *
 * Dlatego równość liczona jest do minuty — dokładnie tyle, ile potrafi wyrazić to pole.
 * Sekundy niezerowe (mogły trafić do bazy z EVENT_DATE albo z SQL-a) zostają w spokoju,
 * dopóki ktoś naprawdę nie zmieni terminu.
 */
function toMinuteKey(iso: string): string {
  /* `toISOString()` daje stałe `YYYY-MM-DDTHH:mm:ss.sssZ`, więc szesnaście znaków to data
     z godziną i minutą. Puste wejście (data nieparsowalna) zostaje puste i nadal różni się
     od każdej prawdziwej daty. */
  return iso.slice(0, 16);
}

export function SettingsView({
  highlightQuery,
  t,
  locale,
  setLocale,
  onForget,
  apiKey,
  ai
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  setLocale: (locale: PanelLocale) => void;
  onForget: () => void;
  apiKey: string;
  highlightQuery?: string; // highlightQuery may be unused in SettingsView because SponsorLeads consumes it and it suppresses TS6133
  /* Comes from the inbox poll, which the panel already runs every ten seconds — rather than a
     call of its own. Undefined until the first poll lands, and the section simply is not drawn
     until then; a settings screen that flashes "the key is missing" while it finds out would be
     worse than one that appears a moment late. */
  ai?: AiStatus;
}) {
  const pl = locale === 'pl';

  const [settings, setSettings] = useState<SiteSettings>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  /**
   * Stan zapisu KARTY WYDARZENIA, osobny od `status` wyżej.
   * ==========================================================================
   * JAKI BŁĄD TO ZAPOBIEGA
   *   `status` obsługuje wszystko inne na tym ekranie: kłódkę całej strony, cztery
   *   przełączniki sekcji i listę sponsorów. Karta wydarzenia korzystała z tego samego stanu,
   *   więc przełączenie „Galeria zdjęć" — zapis niemający z terminem nic wspólnego —
   *   przestawiało `status` na 'saving', a guzik zapisu daty stawał się w tej chwili
   *   wyłączonym „Zapisywanie…". Przy zerwanym łączu `push` kończy się na 'failed' i już z
   *   niego nie wraca; przy zawieszonym żądaniu 'saving' zostaje na zawsze — i wtedy guzik
   *   „Zapisz wydarzenie" jest wyłączony do końca życia karty, mimo że nikt nie próbował
   *   zapisać wydarzenia. Zgłoszone jako „nie mogę kliknąć zapisz daty".
   *
   *   Dwa stany, bo to są dwa niezależne zapisy do dwóch różnych zestawów pól. Jeden stan na
   *   oba znaczył, że powodzenie jednego opisuje drugi.
   */
  const [eventStatus, setEventStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  /**
   * Czy pierwszy odczyt ustawień się nie udał.
   *
   * Bez tego nieudany `fetchSettings` kończył się ekranem, który wygląda na wypełniony:
   * w polach stoją wartości z `EMPTY`, czyli z KODU, a nie z bazy. `eventDirty` wychodzi
   * wtedy fałszywe (wersja robocza równa się „zapisanej"), więc guzik zapisu jest wyłączony
   * z podpisem „wszystko jest już zapisane" — panel twierdzi coś, czego nie sprawdził, i to
   * o polu, którego zapis nadpisałby prawdziwy termin zawodów datą z kodu.
   */
  const [loadFailed, setLoadFailed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);
  const [galleryBusy, setGalleryBusy] = useState<Set<number>>(new Set());

  /**
   * Zapisana wersja galerii, trzymana obok edytowanej.
   *
   * TYLKO SETTER, I TO JEST STAN PRZEJŚCIOWY, NIE DECYZJA
   *   Ta sama sztuczka co `savedSponsors`: „masz niezapisane zmiany" ma być FAKTEM policzonym
   *   z dwóch tablic, a nie flagą, którą ktoś musi pamiętać ustawić i skasować. Karta galerii
   *   nie ma jeszcze guzika „Zapisz teraz" ani przestawiania kadrów, więc nikt tej kopii nie
   *   czyta — a odczyt zapisany „na przyszłość" nie przechodzi `noUnusedLocals` i wywraca
   *   `tsc --noEmit` całego panelu.
   *
   *   Zapis został, bo jest już wołany po odczycie ustawień i kosztuje jedno przypisanie:
   *   gdy tamte guziki wrócą, mają z czym porównywać od pierwszego renderu, zamiast
   *   pokazywać „niezapisane zmiany" do pierwszego zapisu.
   */
  const [, setSavedGallery] = useState<{ images: string[]; captions: string[] }>({
    images: EMPTY.galleryImages,
    captions: EMPTY.galleryCaptions
  });
  /* Czy kreator nowej edycji jest otwarty. Ogłaszanie wyprowadzone z tej karty do osobnego
     ekranu — patrz komentarz przy guziku, który go otwiera. */
  const [wizardOpen, setWizardOpen] = useState(false);
  const [eventDraft, setEventDraft] = useState({
    eventName: EMPTY.eventName,
    eventDate: toLocalInput(EMPTY.eventDate),
    eventLocation: EMPTY.eventLocation
  });
  /* Odcisk wersji roboczej, na której autozapis się wywrócił. Trzymany, żeby nie ponawiać tej
     samej nieudanej próby w kółko — pełne uzasadnienie przy `eventAutosavePending`. */
  const [eventAutosaveFailedFor, setEventAutosaveFailedFor] = useState<string | null>(null);

  /* The saved list, kept beside the edited one so the "unsaved changes" note is a fact
     rather than a flag somebody has to remember to set. */
  const [savedSponsors, setSavedSponsors] = useState<Sponsor[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const pendingLogoFor = useRef<number | null>(null);
  /* `'append'` zamiast liczby znaczy „wgrywam nowy kadr na koniec", a nie „podmieniam
     istniejący". Jedno pole `<input type="file">` obsługuje oba przypadki, bo to ten sam
     wybierak plików i ta sama droga wgrywania — druga kopia znaczyłaby dwa miejsca do
     poprawienia, gdy zmieni się dozwolony format albo rozmiar. */
  const pendingGalleryFor = useRef<number | 'append' | null>(null);
  const galleryImagesRef = useRef(EMPTY.galleryImages);
  const galleryCaptionsRef = useRef(EMPTY.galleryCaptions);
  const captionsTimerRef = useRef<number>(0);
  const gallerySaveChain = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let alive = true;
    fetchSettings(apiKey)
      .then((response) => {
        if (!alive) return;
        const captions = alignCaptions(response.settings.galleryImages, response.settings.galleryCaptions);
        setSettings({ ...response.settings, galleryCaptions: captions });
        setSavedSponsors(response.settings.sponsors);
        galleryImagesRef.current = response.settings.galleryImages;
        galleryCaptionsRef.current = captions;
        setSavedGallery({ images: response.settings.galleryImages, captions });
        /* Podpisane adresy zapamiętane pod ŚCIEŻKĄ, nie pod pozycją — powód przy
           `galleryPreviewMap`. Bez tego pierwsze przestawienie kadrów pokazałoby obrazki
           przesunięte względem kafelków. */
        setPreview((current) => ({ ...current, ...galleryPreviewMap(response.settings) }));
        setEventDraft({
          eventName: response.settings.eventName,
          eventDate: toLocalInput(response.settings.eventDate),
          eventLocation: response.settings.eventLocation
        });
        setLoadFailed(false);
        setLoaded(true);
      })
      .catch(() => {
        if (!alive) return;
        /* Zapamiętane, a nie przemilczane — patrz `loadFailed`. Ekran rysuje się dalej, bo
           kłódka strony i przełączniki sekcji nadal działają na zapis; blokuje się tylko to,
           czego nie wolno zapisać w niewiedzy. */
        setLoadFailed(true);
        setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  /**
   * Przyjmuje świeże ustawienia z serwera i przepisuje nimi WSZYSTKIE kopie na tym ekranie.
   *
   * Kopii jest cztery: `settings`, `savedSponsors`, `eventDraft` i `galleryImagesRef`. Kreator
   * zapisuje te same pola, co ta karta, więc bez jednego miejsca, które je wszystkie odświeża,
   * po wyjściu z kreatora karta wydarzenia pokazywałaby starą datę i uznawałaby się za
   * „brudną" — a wtedy autozapis wysłałby poprzedni termin z powrotem i cofnął to, co kreator
   * właśnie ustawił.
   */
  const absorbSettings = useCallback((next: SiteSettings) => {
    setSettings(next);
    setSavedSponsors(next.sponsors);
    galleryImagesRef.current = next.galleryImages;
    setEventDraft({
      eventName: next.eventName,
      eventDate: toLocalInput(next.eventDate),
      eventLocation: next.eventLocation
    });
    setLoadFailed(false);
  }, []);

  const push = useCallback(
    async (patch: Partial<SiteSettings>) => {
      setStatus('saving');
      try {
        const response = await saveSettings(apiKey, patch);
        setSettings(response.settings);
        setSavedSponsors(response.settings.sponsors);
        setStatus('saved');
        window.setTimeout(() => setStatus('idle'), 2200);
        return true;
      } catch (_) {
        setStatus('failed');
        return false;
      }
    },
    [apiKey]
  );

  const sponsorsDirty = JSON.stringify(settings.sponsors) !== JSON.stringify(savedSponsors);

  const editSponsor = (index: number, patch: Partial<Sponsor>) =>
    setSettings((current) => ({
      ...current,
      sponsors: current.sponsors.map((sponsor, i) => (i === index ? { ...sponsor, ...patch } : sponsor))
    }));

  const move = (index: number, by: number) =>
    setSettings((current) => {
      const next = [...current.sponsors];
      const target = index + by;
      const moving = next[index];
      const displaced = next[target];
      // Both reads are checked rather than trusted: `noUncheckedIndexedAccess` is on,
      // and an out-of-range press on the first or last row is exactly what the buttons
      // are disabled for and exactly what a keyboard can still reach.
      if (!moving || !displaced) return current;
      next[index] = displaced;
      next[target] = moving;
      return { ...current, sponsors: next };
    });

  const pickLogo = (index: number) => {
    pendingLogoFor.current = index;
    setUploadError(false);
    fileInput.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const index = pendingLogoFor.current;
    // The input is reset immediately so picking the same file twice still fires a change.
    event.target.value = '';
    if (!file || index === null) return;

    setUploading(true);
    setUploadError(false);
    try {
      const response = await uploadSponsorLogo(apiKey, await downscale(file));
      /* Two values from one upload: the bucket path, which is what gets saved, and a
         signed URL, which is what can be shown. Storing the signed URL would save a
         link that stops working in an hour. */
      editSponsor(index, { logo: response.logo });
      setPreview((current) => ({ ...current, [response.logo]: response.url }));
    } catch (_) {
      setUploadError(true);
    } finally {
      setUploading(false);
      pendingLogoFor.current = null;
    }
  };

  /* Signed URLs for logos uploaded in this session. The ones that came with the initial
     read are already signed; a freshly uploaded path has no URL until the next read, and
     waiting for a save to see the logo you just picked is not a review. */
  const [preview, setPreview] = useState<Record<string, string>>({});
  const logoSrc = (logo: string) =>
    !logo ? '' : logo.startsWith('/') || logo.startsWith('http') ? logo : preview[logo] || '';
  const gallerySrc = (image: string, index: number) =>
    preview[image]
    || settings.galleryPreviewUrls[index]
    || (image.startsWith('/') || image.startsWith('http') ? image : '');

  /**
   * Przyjmuje listę sponsorów po zatwierdzeniu zgłoszenia. Bez zapisu — zapis zrobił Worker.
   * ==========================================================================
   * DLACZEGO TU NIE MA `push()`
   *   Bo końcówka `sponsor-approve` sama dopisuje wpis do `site_settings.sponsors`, przepuszcza
   *   całą listę przez `cleanSettings` i tylko wtedy stawia zgłoszeniu status `approved` —
   *   sprawdzone w `worker/index.js`. Wywołanie `push({ sponsors: [...] })` obok tego byłoby
   *   DRUGIM dopisaniem tej samej firmy: dwa kafelki na stronie, jeden od Workera, jeden od
   *   panelu. Skutek dla patrzącego jest ten sam, o który chodziło — sponsor pojawia się na
   *   liście niżej i jest zapisany bez klikania „Zapisz" — tylko zapisującym jest serwer.
   *
   * DLACZEGO NIE `absorbSettings`, KTÓRE JUŻ ISTNIEJE
   *   Tamta funkcja przepisuje także `eventDraft`, bo służy kreatorowi nowej edycji, który
   *   nazwę, termin i miejsce właśnie ustawił. Tutaj byłoby to szkodliwe: decyzja o sponsorze
   *   skasowałaby wpisywany w tej chwili termin zawodów, zanim autozapis karty wydarzenia
   *   zdąży wystrzelić. Ta wersja rusza dokładnie to, co zmieniła odpowiedź — listę sponsorów
   *   i to, z czym porównuje ją `sponsorsDirty`.
   *
   * `undefined` znaczy „końcówka nie przysłała ustawień" (starsze wdrożenie Workera). Wtedy
   * doczytujemy je osobno, bo alternatywą jest lista sponsorów bez właśnie zatwierdzonej firmy
   * — czyli ekran mówiący, że zatwierdzenie nic nie zrobiło.
   */
  const absorbApproved = useCallback(
    (next: SiteSettings | undefined) => {
      if (next) {
        setSettings(next);
        setSavedSponsors(next.sponsors);
        galleryImagesRef.current = next.galleryImages;
        setLoadFailed(false);
        return;
      }
      void fetchSettings(apiKey)
        .then((response) => {
          setSettings(response.settings);
          setSavedSponsors(response.settings.sponsors);
          galleryImagesRef.current = response.settings.galleryImages;
          setPreview((current) => ({ ...current, ...galleryPreviewMap(response.settings) }));
          setLoadFailed(false);
        })
        .catch(() => {
          /* Zatwierdzenie SIĘ UDAŁO — mówi o tym karta zgłoszeń — a nie udało się doczytanie
             listy. Zaznaczone jako nieudany odczyt, żeby guzik „Zapisz" przy sponsorach nie
             wysłał zaraz listy sprzed zatwierdzenia i nie skasował świeżo dopisanej firmy. */
          setLoadFailed(true);
        });
    },
    [apiKey]
  );

  const pickGallery = (index: number) => {
    pendingGalleryFor.current = index;
    setUploadError(false);
    galleryInput.current?.click();
  };

  const onGalleryFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const index = pendingGalleryFor.current;
    event.target.value = '';
    /* `typeof index === 'number'` zamiast `index !== null`, i to nie jest kosmetyka: typ tego
       uchwytu dopuszcza `'append'` („wgraj nowy kadr na koniec"), a cała droga niżej numeruje
       kafelki — `galleryBusy` jest zbiorem liczb, a podmiana kadru szuka pozycji przez
       `at === index`. Napis w tych miejscach oznacza kółko, które nie kręci się przy żadnym
       kafelku, i zdjęcie wgrane w nikąd. Dopisywania na koniec ta karta jeszcze nie ma, więc
       póki co jest to warunek, który po prostu nie ma jak nie być spełniony. */
    if (!file || typeof index !== 'number') return;
    pendingGalleryFor.current = null;

    setGalleryBusy((prev) => new Set(prev).add(index));
    setUploadError(false);
    try {
      const uploaded = await uploadGalleryImage(apiKey, await downscaleGallery(file));
      setPreview((current) => ({ ...current, [uploaded.imagePath]: uploaded.url }));

      /* Update the ref and local state together so the tile shows the new image
         immediately while the save runs in the background. */
      galleryImagesRef.current = galleryImagesRef.current.map((img, at) =>
        at === index ? uploaded.imagePath : img
      );
      setSettings((current) => ({
        ...current,
        galleryImages: current.galleryImages.map((img, at) =>
          at === index ? uploaded.imagePath : img
        )
      }));

      /* Saves are serialised: each one reads the ref, which by then includes every
         upload that finished before it. Two saves in a row with the same array are
         harmless — the server merges, so the second is a no-op. */
      gallerySaveChain.current = gallerySaveChain.current.catch(() => {}).then(async () => {
        try {
          await saveSettings(apiKey, { galleryImages: galleryImagesRef.current });
        } catch (_) {
          setUploadError(true);
        }
      });
    } catch (_) {
      setUploadError(true);
    } finally {
      setGalleryBusy((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const draftDate = new Date(eventDraft.eventDate);
  const draftIso = Number.isNaN(draftDate.getTime()) ? '' : draftDate.toISOString();
  const savedDate = new Date(settings.eventDate);
  const savedIso = Number.isNaN(savedDate.getTime()) ? '' : savedDate.toISOString();
  const eventReady = Boolean(eventDraft.eventName.trim() && eventDraft.eventLocation.trim() && draftIso);

  /* Rok czytany z wersji roboczej, nie z ISO — `getFullYear()` jest lokalny, tak samo jak
     wartość w polu, więc nie ma tu przesunięcia strefowego, które o północy przenosi datę
     na sąsiedni rok. Sprawdzane osobno od `eventReady`, bo to nie brak danych, tylko dane
     w połowie wpisywania: pole jest wypełnione i wygląda poprawnie, a rok ma dwie cyfry. */
  const draftYear = Number.isNaN(draftDate.getTime()) ? 0 : draftDate.getFullYear();
  const eventYearSane = draftYear >= EVENT_YEAR_MIN && draftYear <= EVENT_YEAR_MAX;

  const eventDirty = eventDraft.eventName.trim() !== settings.eventName
    || eventDraft.eventLocation.trim() !== settings.eventLocation
    /* Do minuty, nie do milisekundy — patrz `toMinuteKey`. Inaczej sam wejście na ten ekran
       byłoby „zmianą" i autozapis strzelałby bez powodu. */
    || toMinuteKey(draftIso) !== toMinuteKey(savedIso);
  const alreadyAnnounced = settings.announcementEventDate === settings.eventDate;

  /* Odcisk wersji roboczej: trzy pola sprowadzone do jednego napisu. Służy tylko do tego, by
     autozapis nie ponawiał w pętli tej samej nieudanej próby — patrz `eventAutosaveFailedFor`. */
  const eventSignature = `${eventDraft.eventName.trim()}|${draftIso}|${eventDraft.eventLocation.trim()}`;

  const saveEvent = useCallback(async () => {
    if (!eventReady || !eventYearSane || loadFailed) {
      setEventStatus('failed');
      return;
    }
    setEventStatus('saving');
    try {
      const response = await saveSettings(apiKey, {
        eventName: eventDraft.eventName.trim(),
        eventDate: draftIso,
        eventLocation: eventDraft.eventLocation.trim()
      });
      setSettings(response.settings);
      setSavedSponsors(response.settings.sponsors);
      /* Wersja robocza przepisana z odpowiedzi, a nie zostawiona taka, jaka była. Worker
         przycina i normalizuje nazwę oraz miejsce, więc bez tego pole pokazywałoby tekst
         z podwójną spacją, którego w bazie nie ma — i karta zostałaby „brudna" na zawsze,
         a przy autozapisie oznaczałoby to pętlę zapisów co sekundę. */
      setEventDraft({
        eventName: response.settings.eventName,
        eventDate: toLocalInput(response.settings.eventDate),
        eventLocation: response.settings.eventLocation
      });
      setEventAutosaveFailedFor(null);
      setEventStatus('saved');
      window.setTimeout(() => setEventStatus('idle'), 2200);
    } catch (_) {
      setEventAutosaveFailedFor(eventSignature);
      setEventStatus('failed');
    }
  }, [
    apiKey,
    draftIso,
    eventDraft.eventLocation,
    eventDraft.eventName,
    eventReady,
    eventSignature,
    eventYearSane,
    loadFailed
  ]);

  /**
   * Czy w tej chwili jest zaplanowany autozapis.
   *
   * Cztery warunki naraz, każdy przed innym błędem:
   *   `loaded`        — przed pierwszym `fetchSettings` wersją roboczą jest EMPTY, czyli data
   *                     z kodu; zapis w tym momencie nadpisałby prawdziwy termin atrapą,
   *                     zanim ktokolwiek zobaczy ekran.
   *   `eventDirty`    — bez tego wejście na ustawienia wysyłałoby żądanie za każdym razem.
   *   `eventReady`    — `datetime-local` w trakcie edycji oddaje pusty łańcuch, a pusta nazwa
   *                     albo miejsce to i tak odmowa po stronie Workera.
   *   `eventYearSane` — rok w drodze do „2027" przechodzi przez „0002"; zapis takiej daty
   *                     zatrzymuje licznik na stronie głównej.
   * Do tego `eventStatus !== 'saving'`: gdy zapis jest w locie, nie planujemy drugiego. Po
   * jego końcu `eventStatus` się zmienia, efekt liczy się od nowa i jeśli w międzyczasie ktoś
   * dopisał literę, autozapis planuje się ponownie. Świadomie WŁASNY stan karty, a nie wspólny
   * `status`: na wspólnym przełącznik sekcji wstrzymywał autozapis terminu, a zawieszony zapis
   * przełącznika wstrzymywał go na zawsze.
   *
   * `!loadFailed`, bo bez udanego odczytu w polach stoją wartości z kodu — autozapis wysłałby
   * je jako termin zawodów, zanim ktokolwiek cokolwiek napisał.
   *
   * I ostatni warunek, najmniej oczywisty: ta sama wersja robocza nie jest wysyłana drugi raz
   * po nieudanym zapisie. Bez tego przy zerwanym łączu robi się pętla — `eventStatus` idzie
   * 'failed' → 'saving' → 'failed', każda zmiana przelicza efekt, efekt planuje kolejną próbę
   * i panel dobija Workera co sekundę, dopóki ekran jest otwarty. Zmiana któregokolwiek pola
   * daje nowy odcisk i próba rusza od nowa; kto chce ponowić bez zmiany, ma guzik, który
   * pozostaje aktywny właśnie na ten wypadek.
   */
  const eventAutosavePending = loaded
    && !loadFailed
    && eventDirty
    && eventReady
    && eventYearSane
    && eventStatus !== 'saving'
    && eventAutosaveFailedFor !== eventSignature;

  useEffect(() => {
    if (!eventAutosavePending) return;
    const timer = window.setTimeout(() => {
      void saveEvent();
    }, EVENT_AUTOSAVE_MS);
    /* Sprzątanie robi tu obie rzeczy naraz: kasuje odliczanie przy odmontowaniu widoku i
       kasuje je przy kolejnym uderzeniu w klawiaturę, bo zmiana któregokolwiek z pól zmienia
       zależności i efekt startuje od zera. To jest cały mechanizm odczekania — nie ma osobnego
       `useRef` na uchwyt timera, bo byłby drugą kopią tego samego stanu. Bez tego zamknięcie
       ustawień w trakcie odliczania wysłałoby zapis do ekranu, którego już nie ma. */
    return () => window.clearTimeout(timer);
  }, [eventAutosavePending, eventDraft.eventName, eventDraft.eventDate, eventDraft.eventLocation, saveEvent]);

  /* Guzik zapisu: wyłączony tylko wtedy, gdy naprawdę nie ma czego zapisać albo zapis trwa —
     i wtedy z podpisem, który mówi, co jest nie tak. Wcześniej jedynym sygnałem była
     przezroczystość, a wyblakły przycisk czyta się jak brak przycisku.

     Kolejność w podpisie idzie od najcięższego powodu: nieudany odczyt bije wszystko, bo przy
     nim nie wiemy nawet, z czym porównujemy. Bez tego pierwszeństwa panel mówił „wszystko jest
     już zapisane" o polach, których nigdy nie przeczytał. */
  const eventSaveDisabled =
    eventStatus === 'saving' || loadFailed || !eventDirty || !eventReady || !eventYearSane;
  const eventSaveLabel = eventStatus === 'saving'
    ? t('set.eventSaving')
    : eventStatus === 'saved' && !eventDirty
      ? t('set.eventSaved')
      : t('set.eventSave');
  const eventSaveHint = eventStatus === 'saving' || eventStatus === 'saved'
    ? ''
    : loadFailed
      ? t('set.eventSaveUnread')
      : !eventReady
        ? t('set.eventSaveIncomplete')
        : !eventYearSane
          ? t('set.eventSaveBadYear')
          : !eventDirty
            ? t('set.eventSaveNothing')
            : '';

  if (!loaded) {
    /* The heading and lead are real, not placeholders — they are the same two lines whether
       the settings have arrived or not, so drawing them straight away means only the panels
       below them appear, instead of the whole screen materialising at once. */
    return (
      <div className="mx-auto max-w-3xl pb-10" role="status" aria-busy="true" aria-label={t('common.loading')}>
        <h2 className="text-2xl font-bold tracking-tight text-white">{t('set.title')}</h2>
        <p className="mt-1.5 text-sm text-white/55">{t('set.lead')}</p>
        {Array.from({ length: 3 }).map((_, card) => (
          <section key={card} className="mt-6 rounded-2xl border border-white/10 bg-white/4 p-5">
            <div className="flex items-center gap-3">
              <span className="block size-9 shrink-0 animate-skeleton rounded-full bg-white/10" />
              <span className="block h-4 w-40 animate-skeleton rounded bg-white/10" />
            </div>
            <span className="mt-3.5 block h-3.5 w-full animate-skeleton rounded bg-white/10" />
            <span className="mt-1.5 block h-3.5 w-2/3 animate-skeleton rounded bg-white/10" />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <h2 className="text-2xl font-bold tracking-tight text-white">{t('set.title')}</h2>
      <p className="mt-1.5 text-sm text-white/55">{t('set.lead')}</p>

      {/* ---------------------------------------------------- the site gate */}
      <section className="mt-6 rounded-2xl border border-white/10 bg-white/4 p-5">
        <div className="flex items-start gap-3">
          <span
            className={
              settings.siteLocked
                ? 'grid size-10 shrink-0 place-items-center rounded-xl bg-coral/15 text-coral'
                : 'grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300'
            }
          >
            {settings.siteLocked ? <Lock className="size-5" /> : <Unlock className="size-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">{t('set.gate')}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t('set.gateLead')}</p>
          </div>
        </div>

        <p
          className={
            settings.siteLocked
              ? 'mt-4 text-sm font-semibold text-coral'
              : 'mt-4 text-sm font-semibold text-emerald-300'
          }
        >
          {settings.siteLocked ? t('set.gateOn') : t('set.gateOff')}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={status === 'saving'}
            onClick={() => push({ siteLocked: !settings.siteLocked })}
            className={
              settings.siteLocked
                ? 'rounded-full bg-yellow px-4 py-2 text-xs font-bold text-navy-950 disabled:opacity-50'
                : 'rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/60 hover:text-white disabled:opacity-50'
            }
          >
            {settings.siteLocked ? t('set.gateOpen') : t('set.gateClose')}
          </button>
          <span className="text-[12px] text-white/40">{t('set.gateDelay')}</span>
        </div>
      </section>

      {/* ------------------------------------------------ section switches */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">{t('set.sections')}</h3>
        <p className="mt-1 text-[13px] text-white/55">{t('set.sectionsLead')}</p>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {(
            [
              ['showGallery', 'set.showGallery'],
              ['showWall', 'set.showWall'],
              ['showPrizes', 'set.showPrizes'],
              ['showCounters', 'set.showCounters']
            ] as const
          ).map(([field, label]) => (
            <label
              key={field}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3"
            >
              <span className="text-[13px] font-medium text-white/85">{t(label)}</span>
              <input
                type="checkbox"
                checked={settings[field]}
                onChange={(event) => push({ [field]: event.target.checked } as Partial<SiteSettings>)}
                className="size-4 accent-yellow"
              />
            </label>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------ event and announcement */}
      <section className="mt-4 rounded-2xl border border-yellow/25 bg-gradient-to-br from-yellow/10 via-white/4 to-blue-500/10 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-yellow text-navy-950">
            <CalendarDays className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">{t('set.event')}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t('set.eventLead')}</p>
          </div>
        </div>

        {/* Nieudany odczyt powiedziany wprost, na samej górze karty. Wcześniej przemilczany:
            pola pokazywały wartości z kodu, a podpis pod guzikiem twierdził, że wszystko jest
            już zapisane — czyli panel opisywał stan bazy, którego nie znał. */}
        {loadFailed ? (
          <p className="mt-3 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] leading-relaxed text-coral">
            {t('set.loadFailed')}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{t('set.eventName')}</span>
            <input
              value={eventDraft.eventName}
              maxLength={80}
              onChange={(event) => setEventDraft((current) => ({ ...current, eventName: event.target.value }))}
              className="rounded-xl border border-white/15 bg-navy-950/55 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{t('set.eventDate')}</span>
            <input
              type="datetime-local"
              value={eventDraft.eventDate}
              onChange={(event) => setEventDraft((current) => ({ ...current, eventDate: event.target.value }))}
              className="rounded-xl border border-white/15 bg-navy-950/55 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{t('set.eventLocation')}</span>
            <input
              value={eventDraft.eventLocation}
              maxLength={120}
              onChange={(event) => setEventDraft((current) => ({ ...current, eventLocation: event.target.value }))}
              className="rounded-xl border border-white/15 bg-navy-950/55 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow"
            />
          </label>
        </div>

        {/* Powiedziane wprost, bo autozapisu nie widać. Bez tej linijki jedynym sygnałem, że
            zmiana została zapisana, jest zielony napis, który gaśnie po dwóch sekundach — i
            ktoś, kto w tym momencie patrzył na pole daty, znów nie ma pewności. */}
        <p className="mt-3 text-[12px] leading-relaxed text-white/45">{t('set.eventAutosaveNote')}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={eventSaveDisabled}
            onClick={() => void saveEvent()}
            /* Bez `disabled:opacity-40`. Stan wyłączony ma własne, widoczne tło i pełny napis —
               tak przycisk dalej wygląda jak przycisk, a powód jest w podpisie obok. */
            className={
              eventSaveDisabled
                ? 'rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white/75'
                : 'rounded-full bg-yellow px-4 py-2 text-xs font-bold text-navy-950 hover:bg-white'
            }
          >
            {eventSaveLabel}
          </button>
          {/* OGŁOSZENIE PRZENIESIONE DO KREATORA.
              Stał tu jeden guzik „Ogłoś i rozpocznij nową edycję", który po jednym pytaniu
              „czy na pewno" archiwizował rocznik, kasował głosy i uczestników oraz uzbrajał
              wysyłkę listów — na podstawie trzech pól obok, z których widać było tylko datę.
              Nowa edycja to nie jedno pole, więc jest teraz kreatorem: pięć kroków, każdy
              zapisywany osobno, i liczby tego, co zniknie, pokazane PRZED potwierdzeniem.
              Ta karta zostaje do samej poprawki terminu, bez ogłaszania. */}
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-coral px-4 py-2 text-xs font-bold text-white hover:bg-white hover:text-navy-950"
          >
            <Megaphone className="size-3.5" />
            {t('wiz.open')}
          </button>
          {/* Wzajemnie się wykluczają: gdy autozapis odlicza, guzik jest aktywny i podpowiedzi
              nie ma; gdy guzik jest wyłączony, nie ma czego odliczać. */}
          {eventAutosavePending ? (
            <span role="status" className="text-[12px] text-yellow">{t('set.eventAutosavePending')}</span>
          ) : null}
          {eventSaveHint ? <span className="text-[12px] text-white/50">{eventSaveHint}</span> : null}
          {eventStatus === 'saved' ? (
            <span className="text-[12px] text-emerald-300">{t('set.saved')}</span>
          ) : null}
          {eventStatus === 'failed' ? (
            <span className="text-[12px] text-coral">{t('set.saveFailed')}</span>
          ) : null}
        </div>

        <p className="mt-2.5 text-[12px] leading-relaxed text-white/45">{t('wiz.openLead')}</p>

        {/* Ślad ogłoszenia zostaje w karcie, choć samo ogłaszanie już nie: to jest odpowiedź na
            pytanie „czy ta edycja była już ogłaszana", zadawane przy patrzeniu na termin, a nie
            przy zakładaniu nowej edycji. Reszta komunikatów — kolejka wysyłki, zarchiwizowany
            rocznik, odmowy — przeniosła się do kreatora, bo tam zapadają decyzje, których
            dotyczą. */}
        {alreadyAnnounced ? (
          <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/60">{t('set.alreadyAnnounced')}</p>
        ) : null}
      </section>

      {/* Kreator pod kartą, a nie w okienku na wierzchu.
          Pięć kroków z polami, listą kadrów i podsumowaniem nie mieści się w okienku na
          telefonie, a okienko z własnym przewijaniem w środku przewijanej strony to dwa
          przewijania na jednym ekranie — na dotyku nie da się przewidzieć, które z nich
          złapie palec. */}
      {wizardOpen ? (
        <EditionWizard
          t={t}
          apiKey={apiKey}
          settings={settings}
          onSettings={absorbSettings}
          onClose={() => setWizardOpen(false)}
        />
      ) : null}

      {/* ---------------------------------------------------------- gallery */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-500/15 text-blue-200">
            <Images className="size-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-white">{t('set.gallery')}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t('set.galleryLead')}</p>
          </div>
        </div>

        <input
          ref={galleryInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onGalleryFile}
          className="hidden"
        />
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {settings.galleryImages.map((image, index) => (
            <div key={`${image}-${index}`} className="flex flex-col">
            <button
              key={`${image}-${index}`}
              type="button"
              disabled={galleryBusy.has(index)}
              onClick={() => pickGallery(index)}
              aria-label={`${t('set.galleryPhoto')} ${index + 1}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-white/10 bg-navy-950/60 text-white/50 transition hover:-translate-y-1 hover:border-yellow focus-visible:outline-2 focus-visible:outline-yellow disabled:opacity-55"
            >
              {galleryBusy.has(index) ? (
                <>
                  {gallerySrc(image, index) ? (
                    <img src={gallerySrc(image, index)} alt="" className="size-full object-cover opacity-30" />
                  ) : null}
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div className="absolute inset-0 animate-skeleton bg-white/5" />
                    <div className="relative size-7 animate-spin rounded-full border-2 border-white/20 border-t-yellow" />
                    <span className="relative text-[10px] font-bold uppercase tracking-wider text-yellow">{t('set.uploading')}</span>
                  </div>
                </>
              ) : gallerySrc(image, index) ? (
                <img src={gallerySrc(image, index)} alt="" className="size-full object-cover transition duration-300 group-hover:scale-105" />
              ) : (
                <ImagePlus className="absolute inset-0 m-auto size-6" />
              )}
              <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-navy-950/80 text-[11px] font-extrabold text-yellow">{index + 1}</span>
              {!galleryBusy.has(index) && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy-950/90 to-transparent px-2 pb-2 pt-6 text-[10px] font-bold uppercase tracking-wider text-white">
                  {t('set.galleryPhoto')}
                </span>
              )}
            </button>
            <input
              type="text"
              placeholder={t('set.galleryCaptionPlaceholder')}
              className="mt-1 w-full rounded-md border border-white/10 bg-navy-950/40 px-2 py-1.5 text-xs text-white placeholder-white/30 focus:border-yellow focus:outline-none"
              value={settings.galleryCaptions?.[index] || ''}
              onChange={(e) => {
                const newCaptions = [...(settings.galleryCaptions || ['', '', '', '', ''])];
                newCaptions[index] = e.target.value;
                setSettings({ ...settings, galleryCaptions: newCaptions });

                window.clearTimeout(captionsTimerRef.current);
                captionsTimerRef.current = window.setTimeout(async () => {
                  try {
                    await saveSettings(apiKey, { galleryCaptions: newCaptions });
                  } catch (err) {
                    console.error('Failed to save caption', err);
                  }
                  /* Stała zamiast wpisanego tu wcześniej `800`. Ta sama liczba, ale opisana:
                     uzasadnienie długości odczekania stoi przy `GALLERY_AUTOSAVE_MS`, a liczba
                     wpisana w wywołanie znaczyła, że komentarz opisywał wartość, której nikt
                     nie używał. */
                }, GALLERY_AUTOSAVE_MS);
              }}
            />
          </div>
          ))}
        </div>
        {uploadError ? <p className="mt-3 text-[12px] text-coral">{t('set.uploadFailed')}</p> : null}
      </section>

      {/* ------------------------------------------------- zgłoszenia sponsorów
          NAD listą sponsorów, nie pod nią: to jest skrzynka wejściowa, a lista poniżej jest
          jej skutkiem. Pod listą trzydziestu sponsorów nowe zgłoszenie leżałoby poza pierwszym
          ekranem telefonu — a pytanie, z którym się tu wchodzi, brzmi „czy ktoś się zgłosił",
          nie „kto już jest".

          Zatwierdzenie zapisuje się samo, po stronie Workera; `onApproved` wnosi oddane przez
          niego ustawienia do stanu tego ekranu, żeby lista niżej odrysowała się od razu i nie
          mogła się rozjechać z bazą — uzasadnienie przy `absorbApproved`. */}
      <SponsorLeads t={t} apiKey={apiKey} onApproved={absorbApproved} highlightQuery={highlightQuery} />

      {/* ---------------------------------------------------------- sponsors */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-white">{t('set.sponsors')}</h3>
            <p className="mt-1 text-[13px] text-white/55">{t('set.sponsorsLead')}</p>
          </div>
          <span className="text-[12px] font-semibold text-white/40">{settings.sponsors.length}</span>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={onFile}
          className="hidden"
        />

        <ul className="mt-4 flex flex-col gap-3">
          {settings.sponsors.map((sponsor, index) => (
            <li
              key={index}
              className="rounded-xl border border-white/10 bg-navy-900/60 p-3 sm:flex sm:items-start sm:gap-3"
            >
              <button
                type="button"
                onClick={() => pickLogo(index)}
                title={t('set.sponsorLogo')}
                className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-white/20 bg-white/5 text-white/40 hover:border-yellow hover:text-yellow"
              >
                {logoSrc(sponsor.logo) ? (
                  <img
                    src={logoSrc(sponsor.logo)}
                    alt={sponsor.name || t('set.sponsorLogo')}
                    className="size-full object-contain"
                  />
                ) : (
                  <ImagePlus className="size-5" />
                )}
              </button>

              <div className="mt-3 flex min-w-0 flex-1 flex-col gap-2 sm:mt-0">
                <input
                  value={sponsor.name}
                  onChange={(event) => editSponsor(index, { name: event.target.value })}
                  placeholder={t('set.sponsorName')}
                  aria-label={t('set.sponsorName')}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-yellow focus:outline-none"
                />
                <input
                  value={sponsor.url}
                  onChange={(event) => editSponsor(index, { url: event.target.value })}
                  onBlur={(event) => {
                    let val = event.target.value.trim();
                    if (!val) return;
                    if (val.startsWith('http://') || val.startsWith('https://')) {
                      // zostawiamy jak jest
                    } else if (val.startsWith('www.')) {
                      val = 'https://' + val;
                    } else {
                      val = 'https://www.' + val;
                    }
                    if (val !== sponsor.url) {
                      editSponsor(index, { url: val });
                    }
                  }}
                  placeholder="https://…"
                  aria-label={t('set.sponsorUrl')}
                  inputMode="url"
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/30 focus:border-yellow focus:outline-none"
                />
              </div>

              <div className="mt-3 flex shrink-0 gap-1 sm:mt-0 sm:flex-col">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  title={t('set.sponsorUp')}
                  aria-label={t('set.sponsorUp')}
                  className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-25"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === settings.sponsors.length - 1}
                  title={t('set.sponsorDown')}
                  aria-label={t('set.sponsorDown')}
                  className="grid size-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white disabled:opacity-25"
                >
                  <ArrowDown className="size-4" />
                </button>
                <ArmedDeleteButton
                  onConfirm={() =>
                    setSettings((current) => ({
                      ...current,
                      sponsors: current.sponsors.filter((_, i) => i !== index)
                    }))
                  }
                  title={t('set.sponsorRemove')}
                />
              </div>
            </li>
          ))}
        </ul>

        {/* Says why the strip is not on the site, not just that the list is empty.
            "Nobody added yet" is a fact about this screen; "that is why the band is invisible
            on the page" is the answer to the question somebody actually has — and it is the
            question that came back four times, because an empty list and a hidden strip look
            the same from the front page. */}
        {settings.sponsors.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-white/15 p-3.5">
            <p className="text-[13px] text-white/55">{t('set.sponsorsEmpty')}</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">
              {pl
                ? 'Dopóki lista jest pusta, pasek nad nagłówkiem trasy jest ukryty — pusty pas logotypów wygląda na zepsuty, więc strona go nie pokazuje. Wystarczy nazwa: plik z logo jest opcjonalny, a bez niego pokazujemy nazwę napisem.'
                : 'Finché l’elenco è vuoto, la striscia sopra il titolo del percorso resta nascosta: una fascia di logo vuota sembra un errore, quindi il sito non la mostra. Basta il nome: il file del logo è opzionale e senza di esso mostriamo il nome scritto.'}
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() =>
              setSettings((current) => ({
                ...current,
                sponsors: [...current.sponsors, { name: '', url: '', logo: '' }]
              }))
            }
            className="flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/80 hover:border-white/60 hover:text-white"
          >
            <Plus className="size-3.5" />
            {t('set.sponsorAdd')}
          </button>

          <button
            type="button"
            disabled={!sponsorsDirty || status === 'saving'}
            onClick={() =>
              push({
                // A row with no name is a row somebody started and abandoned; it would
                // render as an empty tile on the public page.
                sponsors: settings.sponsors.filter((sponsor) => sponsor.name.trim())
              })
            }
            className="rounded-full bg-yellow px-4 py-2 text-xs font-bold text-navy-950 disabled:opacity-40"
          >
            {status === 'saving' ? t('set.saving') : t('set.save')}
          </button>

          {uploading ? <span className="text-[12px] text-white/50">{t('set.uploading')}</span> : null}
          {uploadError ? <span className="text-[12px] text-coral">{t('set.uploadFailed')}</span> : null}
          {sponsorsDirty && status !== 'saving' ? (
            <span className="text-[12px] text-yellow">{t('set.dirty')}</span>
          ) : null}
          {status === 'saved' ? (
            <span className="text-[12px] text-emerald-300">{t('set.saved')}</span>
          ) : null}
          {status === 'failed' ? (
            <span className="text-[12px] text-coral">{t('set.saveFailed')}</span>
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------- language */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">{t('set.language')}</h3>
        <div className="mt-3 flex gap-2">
          {(['pl', 'it'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={
                locale === code
                  ? 'rounded-full bg-yellow px-4 py-2 text-xs font-bold text-navy-950'
                  : 'rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white/70 hover:border-white/50 hover:text-white'
              }
            >
              {code === 'pl' ? 'Polski' : 'Italiano'}
            </button>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- session */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">{t('set.session')}</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-white/55">
          {pl
            ? 'Hasło jest sprawdzane po stronie serwera i nigdy nie trafia do Supabase — funkcja trzyma klucz bazy i wymienia je na niego. Jeśli oddajesz to urządzenie komuś, wyloguj się.'
            : 'La password è verificata sul server e non arriva mai a Supabase: la funzione tiene la chiave del database e la scambia con questa. Se passi il dispositivo a qualcuno, esci.'}
        </p>
        <button
          type="button"
          onClick={onForget}
          className="mt-4 flex items-center gap-2 rounded-full border border-coral/40 px-4 py-2 text-xs font-semibold text-coral hover:bg-coral hover:text-white"
        >
          <LogOut className="size-3.5" />
          {t('set.forget')}
        </button>
      </section>

      {/* Last on the page, and the only red section. Nothing below it, so nobody scrolls
          past it on the way to something else. */}
      <PurgePanel t={t} apiKey={apiKey} />

      {/* ------------------------------------------------------------- AI status */}
      {ai ? (
        <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
          <h3 className="text-sm font-bold text-white">
            {pl ? 'Model na czacie' : 'Modello nella chat'}
          </h3>

          {ai.configured ? (
            <p className="mt-2 text-[13px] leading-relaxed text-white/55">
              {pl
                ? 'Klucz jest ustawiony. Automat odpowiada na sześć pytań ze słownika bez modelu, a wszystko inne wysyła do niego.'
                : 'La chiave è impostata. Le sei domande frequenti hanno risposte dal dizionario, tutto il resto va al modello.'}
            </p>
          ) : (
            /* Powiedziane wprost, bo bez tego jedyny sposób sprawdzenia to zadanie czatowi
               pytania poza słownikiem — a odpowiedź „przekazuję organizatorom" wygląda tak
               samo, gdy klucza nie ma i gdy model celowo eskalował. */
            <p className="mt-2 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-[13px] leading-relaxed text-white/80">
              {pl
                ? 'Klucza nie ma. Czat odpowiada tylko na sześć pytań ze słownika, a wszystko inne od razu przekazuje Wam — to nie awaria, tylko brak konfiguracji. Dodaj AI_API_KEY, AI_API_URL i AI_MODEL w Vercel → Environment Variables i zrób Redeploy.'
                : 'La chiave manca. La chat risponde solo alle sei domande del dizionario e passa tutto il resto a voi: non è un guasto, è configurazione mancante. Aggiungi AI_API_KEY, AI_API_URL e AI_MODEL in Vercel → Environment Variables e fai Redeploy.'}
            </p>
          )}

          <dl className="mt-3 grid gap-2 text-[12px]">
            <div className="flex flex-wrap gap-x-2 border-b border-white/8 pb-2">
              <dt className="text-white/50">AI_API_KEY</dt>
              <dd className={`ml-auto font-mono ${ai.configured ? 'text-green' : 'text-coral'}`}>
                {ai.configured ? (pl ? 'jest' : 'presente') : (pl ? 'brak' : 'assente')}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2 border-b border-white/8 pb-2">
              <dt className="text-white/50">AI_API_URL</dt>
              <dd className="ml-auto break-all font-mono text-white/80">{ai.url}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-white/50">AI_MODEL</dt>
              <dd className="ml-auto font-mono text-white/80">{ai.model}</dd>
            </div>
          </dl>

          {/* Najczęstsza pomyłka, i taka, której nie widać po samym „klucz jest": klucz Groqa
              wysyłany pod domyślny adres OpenAI. Wtedy wszystko wygląda na ustawione. */}
          {ai.configured && ai.url.includes('openai.com') ? (
            <p className="mt-3 rounded-lg border border-yellow/40 bg-yellow/10 px-3 py-2 text-[12px] leading-relaxed text-white/80">
              {pl
                ? 'Adres to domyślny OpenAI. Jeśli Twój klucz jest z Groqa, ustaw AI_API_URL na https://api.groq.com/openai/v1/chat/completions — inaczej klucz jest, a żądanie jest odrzucane.'
                : 'L’indirizzo è quello predefinito di OpenAI. Se la chiave è di Groq, imposta AI_API_URL su https://api.groq.com/openai/v1/chat/completions, altrimenti la chiave c’è ma la richiesta viene rifiutata.'}
            </p>
          ) : null}
        </section>
      ) : null}

      {/* ------------------------------------------------------ where things live */}
      <section className="mt-4 rounded-2xl border border-white/10 bg-white/4 p-5">
        <h3 className="text-sm font-bold text-white">
          {pl ? 'Gdzie co zmienić' : 'Dove si cambia cosa'}
        </h3>
        <dl className="mt-3 grid gap-2.5 text-[13px]">
          {/* Two of these used to be wrong, which is worse than missing: somebody following
              them would have gone looking in the right-sounding wrong place.
                - "entry data → Table Editor" was true when nothing in the panel could read the
                  entries. The list works now and has an edit dialog, so it says so.
                - "reminders → Make scenario 2" describes a scenario that was deleted. The clock
                  is a GitHub Action; Make only has the one scenario left. */}
          {[
            [pl ? 'Hasła i klucze' : 'Password e chiavi', 'Vercel → Settings → Environment Variables'],
            [pl ? 'Dane zgłoszeń' : 'Dati delle iscrizioni', pl ? 'Panel → Zgłoszenia → ołówek' : 'Pannello → Iscrizioni → matita'],
            [pl ? 'Treść maili' : 'Testo delle e-mail', 'emails/copy.json'],
            [pl ? 'Treść formularzy PDF' : 'Testo dei moduli PDF', 'emails/pdf-copy.json'],
            [pl ? 'Wysyłka maili' : 'Invio delle e-mail', pl ? 'Make → jeden scenariusz' : 'Make → un solo scenario'],
            [pl ? 'Zegar przypomnień' : 'Orologio dei promemoria', '.github/workflows/reminders.yml']
          ].map(([label, where]) => (
            <div key={label} className="flex flex-wrap gap-x-2 border-b border-white/8 pb-2">
              <dt className="text-white/50">{label}</dt>
              <dd className="ml-auto font-mono text-[12px] text-white/80">{where}</dd>
            </div>
          ))}
        </dl>

        <a
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-yellow hover:underline"
        >
          <Globe className="size-3.5" />
          {pl ? 'Otwórz stronę' : 'Apri il sito'}
          <ExternalLink className="size-3.5" />
        </a>
      </section>
    </div>
  );
}
