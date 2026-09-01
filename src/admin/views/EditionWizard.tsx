import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Megaphone, X } from 'lucide-react';
import type { TranslateKey } from '../i18n';
import {
  ApiError,
  announceEdition,
  fetchEditions,
  fetchSubscribers,
  fetchVoting,
  saveSettings,
  uploadGalleryImage,
  type SiteSettings,
  type VotingEdition
} from '../api';
import {
  EDITION_YEAR_MAX,
  EDITION_YEAR_MIN,
  editionRefusalKey,
  editionYearInRome,
  editionYearSane,
  localInputToIso
} from '../lib/edition';
import { ActionButton } from './ActionButton';

/**
 * Kreator nowej edycji: pięć kroków zamiast jednego guzika „Ogłoś".
 * ============================================================================
 * DLACZEGO KREATOR, A NIE POLE Z PRZYCISKIEM
 *   Ogłoszenie nowej edycji robi cztery rzeczy naraz i żadnej z nich nie da się cofnąć:
 *   archiwizuje wynik trwającego rocznika, kasuje uczestników i oddane głosy z żywych tabel,
 *   przestawia termin, na który odlicza licznik na stronie głównej, i uzbraja wysyłkę listów
 *   do wszystkich zapisanych na newsletter. Do tej pory uruchamiał to jeden przycisk obok
 *   pola z datą, po jednym pytaniu „czy na pewno" — a widać przy nim było wyłącznie datę.
 *   Nazwa edycji, miejsce, zdjęcia i przełączniki sekcji były w innych kartach albo nigdzie,
 *   więc rocznik lądował w archiwum z nazwą z poprzedniego roku.
 *
 *   Kroki są tu po to, żeby PRZED nieodwracalnym kliknięciem zebrać wszystko, co ogłoszenie
 *   utrwala, i pokazać liczby tego, co zniknie. Nie po to, żeby podzielić formularz na
 *   ekrany — sam podział nikomu nic nie daje.
 *
 * KOLEJNOŚĆ NA KOŃCU: NAJPIERW ZAPIS, POTEM OGŁOSZENIE
 *   Worker ogłasza to, co jest ZAPISANE w `site_settings`, a nie to, co stoi w formularzu:
 *   gałąź `announce` czyta `event_date` z bazy i po niej liczy rocznik archiwum. Ogłoszenie
 *   przed zapisem zarchiwizowałoby rocznik pod starym rokiem i wysłało listy ze starą datą,
 *   a formularz wyglądałby na przyjęty. Dlatego ostatni krok woła `saveSettings`, sprawdza
 *   jego wynik i tylko wtedy woła `announceEdition`.
 *
 * COFANIE NIE GUBI DANYCH
 *   Wszystkie pola są w jednym stanie `draft` w tym komponencie, a kroki tylko przełączają to,
 *   co jest rysowane. Osobny stan na krok albo odmontowywanie kroków czyściłoby pola przy
 *   każdym „Wstecz" — a to jest ekran, po którym chodzi się w tę i we w tę, bo krok piąty
 *   pokazuje liczby, po których czasem trzeba wrócić do pierwszego.
 */

/** Pięć kroków. Jawny typ, żeby `step + 1` nie mogło wyjechać poza zakres bez błędu kompilacji. */
type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: readonly { step: Step; label: TranslateKey }[] = [
  { step: 1, label: 'wiz.step1' },
  { step: 2, label: 'wiz.step2' },
  { step: 3, label: 'wiz.step3' },
  { step: 4, label: 'wiz.step4' },
  { step: 5, label: 'wiz.step5' }
];

/** Przełączniki sekcji strony — pola, które `SiteSettings` już ma. Patrz krok czwarty. */
const SECTION_FLAGS: readonly { field: 'showGallery' | 'showWall' | 'showPrizes' | 'showCounters'; label: TranslateKey }[] = [
  { field: 'showGallery', label: 'set.showGallery' },
  { field: 'showWall', label: 'set.showWall' },
  { field: 'showPrizes', label: 'set.showPrizes' },
  { field: 'showCounters', label: 'set.showCounters' }
];

/** ISO w UTC → wartość dla `datetime-local`, czyli czas lokalny bez strefy. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Zdjęcie zmniejszone w przeglądarce, dokładnie tak jak w karcie galerii w Ustawieniach.
 *
 * Ta sama droga wgrywania (`uploadGalleryImage`) i ten sam rozmiar, bo to są TE SAME pięć
 * kadrów w tej samej kolumnie bazy. Druga droga wgrywania znaczyłaby dwa różne rozmiary
 * plików w jednej galerii i dwa miejsca do poprawienia, gdy limit ciała żądania się zmieni.
 */
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

/** Liczby, które zniknią po ogłoszeniu. `null` znaczy „nie udało się odczytać". */
interface Summary {
  activeEditionKey: string;
  participants: number;
  votes: number;
  mails: number;
}

export function EditionWizard({
  t,
  apiKey,
  settings,
  onSettings,
  onClose
}: {
  t: (key: TranslateKey) => string;
  apiKey: string;
  settings: SiteSettings;
  /** Świeże ustawienia z serwera wracają do karty wyżej — patrz `absorbSettings` tam. */
  onSettings: (next: SiteSettings) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>(1);

  /* Jeden stan na wszystkie kroki — patrz „COFANIE NIE GUBI DANYCH" w nagłówku pliku.
     Wartości startowe z zapisanych ustawień, bo nowa edycja jest zwykle poprawką poprzedniej:
     miejsce zostaje to samo, nazwa różni się rokiem. Puste pola kazałyby przepisywać rzeczy,
     które są już w bazie, a przepisywanie to okazja do literówki w nazwie, która pójdzie w
     listach do wszystkich zapisanych. */
  const [draft, setDraft] = useState({
    eventDate: toLocalInput(settings.eventDate),
    eventName: settings.eventName,
    eventLocation: settings.eventLocation
  });
  const [flags, setFlags] = useState({
    showGallery: settings.showGallery,
    showWall: settings.showWall,
    showPrizes: settings.showPrizes,
    showCounters: settings.showCounters
  });
  /**
   * Przestawia jeden przełącznik sekcji.
   *
   * Przypisanie do indeksu, a nie klucz wyliczany w literale obiektu. `{ ...current,
   * [field]: value }` przy `field` będącym unią nazw kolumn TypeScript rozszerza do typu z
   * indeksem napisowym i gubi wtedy pewność, że wszystkie cztery pola nadal istnieją — a to
   * jest obiekt, który zaraz leci do `saveSettings` jako fragment ustawień strony.
   */
  const setFlag = (field: (typeof SECTION_FLAGS)[number]['field'], value: boolean) =>
    setFlags((current) => {
      const next = { ...current };
      next[field] = value;
      return next;
    });

  const [images, setImages] = useState<string[]>(settings.galleryImages);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [tileBusy, setTileBusy] = useState<Set<number>>(new Set());
  const [uploadFailed, setUploadFailed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [stepSaved, setStepSaved] = useState(false);
  /* Klucz zdania o odmowie, nie kod z serwera. Kod potrafi rozwinąć tylko ktoś z dostępem do
     tego repozytorium, a nad tym przyciskiem stoi człowiek z telefonem w ręku. */
  const [problem, setProblem] = useState<TranslateKey | null>(null);

  const [editions, setEditions] = useState<VotingEdition[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [summaryFailed, setSummaryFailed] = useState(false);

  const [confirmYear, setConfirmYear] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [done, setDone] = useState<'queued' | 'already' | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);
  const pendingTile = useRef<number | null>(null);

  const iso = localInputToIso(draft.eventDate);
  const year = editionYearInRome(iso);
  const yearOk = iso !== '' && editionYearSane(iso);

  /* Roczniki czytane raz, przy otwarciu kreatora, a nie przy wejściu w krok pierwszy.
     Ostrzeżenie „ten rok już stoi w archiwum" ma być widoczne w chwili wpisywania daty, a nie
     dopiero na końcu — po czterech krokach wracanie do pierwszego jest karą za coś, o czym
     panel wiedział od początku.

     Nieudany odczyt NIE blokuje kroku: lista roczników służy tu do ostrzeżenia, a nie do
     zezwolenia. Ostatnie słowo ma i tak baza, która odmawia kodem EDITION_ALREADY_EXISTS. */
  useEffect(() => {
    let alive = true;
    fetchEditions(apiKey)
      .then((response) => {
        if (alive) setEditions(response.editions ?? []);
      })
      .catch(() => {
        if (alive) setEditions([]);
      });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  /**
   * Liczby do podsumowania, odczytane dopiero przy wejściu w piąty krok.
   *
   * Wtedy, a nie przy otwarciu: trzy żądania na wejście do kreatora to trzy żądania także dla
   * kogoś, kto wszedł poprawić nazwę i wyszedł. Odczytane też PONOWNIE przy każdym powrocie do
   * tego kroku, bo między krokami mogły dojść głosy — a to jest ekran, na którym liczba
   * kasowanych głosów jest jedyną informacją mającą wstrzymać rękę.
   */
  const loadSummary = useCallback(async () => {
    setSummaryFailed(false);
    setSummary(null);
    try {
      const [voting, editionList, subscribers] = await Promise.all([
        fetchVoting(apiKey),
        fetchEditions(apiKey),
        /* Limit wyżej niż domyślne 300, bo to liczba adresów, na które pójdzie ogłoszenie, a
           nie próbka. Worker i tak przycina do swojego sufitu — wtedy liczba jest dolnym
           oszacowaniem, co jest w porządku dla ostrzeżenia, ale nie byłoby dla rozliczenia. */
        fetchSubscribers(apiKey, 'newsletter', 1000)
      ]);
      const active = (editionList.editions ?? []).find((row) => row.status === 'active');
      setSummary({
        activeEditionKey: active?.key ?? '',
        participants: voting.participants.length,
        votes: voting.totalVotes ?? 0,
        mails: subscribers.rows.filter((row) => row.status === 'active').length
      });
    } catch (_) {
      /* Bez liczb ogłaszać nie wolno, więc to jest stan, nie milczenie — guzik ogłoszenia
         dostaje z tego powód wyłączenia. */
      setSummaryFailed(true);
    }
  }, [apiKey]);

  useEffect(() => {
    if (step !== 5) return;
    void loadSummary();
  }, [step, loadSummary]);

  /* Rocznik o tym roku: zamknięty w archiwum czy właśnie trwający. To dwa różne ostrzeżenia,
     bo pierwsze znaczy „baza odmówi", a drugie „nic nie zostanie skasowane". */
  const sameYear = (editions ?? []).filter((row) => row.key === year);
  const yearArchived = sameYear.some((row) => row.status === 'archived');
  const yearActive = sameYear.some((row) => row.status === 'active');

  /** Powód, dla którego z tego kroku nie da się przejść dalej. Puste = da się. */
  const stepReason = ((): string => {
    if (saving) return t('wiz.saving');
    if (step === 1) {
      if (iso === '') return t('wiz.errNoDate');
      if (!yearOk) return t('wiz.yearBad');
      return '';
    }
    if (step === 2) {
      return draft.eventName.trim() && draft.eventLocation.trim() ? '' : t('wiz.errIncomplete');
    }
    /* Kroki trzeci i czwarty są kompletne z definicji: zdjęcia i przełączniki mają wartości
       domyślne, których brak nie jest brakiem danych. Wymuszanie tu czegokolwiek zatrzymałoby
       kreator na polu, którego Worker nie wymaga. */
    return '';
  })();

  /** Wspólny zapis pól, które ta edycja utrwala. Jedno miejsce dla „dalej" i dla ogłoszenia. */
  const persist = useCallback(async (): Promise<boolean> => {
    try {
      const response = await saveSettings(apiKey, {
        eventName: draft.eventName.trim(),
        eventDate: iso,
        eventLocation: draft.eventLocation.trim(),
        galleryImages: images,
        showGallery: flags.showGallery,
        showWall: flags.showWall,
        showPrizes: flags.showPrizes,
        showCounters: flags.showCounters
      });
      onSettings(response.settings);
      return true;
    } catch (problemFromServer) {
      const code = problemFromServer instanceof ApiError ? problemFromServer.code : undefined;
      /* Nieznany kod schodzi na `wiz.errWrite`, a nie na zdanie o ogłoszeniu: to jest zapis,
         więc rada „sprawdź połączenie i spróbuj ponownie" jest tu prawdziwa. */
      setProblem(code === 'SETTINGS_EVENT_DATE' ? 'wiz.errEventDate' : 'wiz.errWrite');
      return false;
    }
  }, [apiKey, draft.eventName, draft.eventLocation, flags, images, iso, onSettings]);

  const goNext = async () => {
    if (stepReason !== '' || step === 5) return;
    setProblem(null);
    setStepSaved(false);
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (!ok) return;
    setStepSaved(true);
    /* Rzutowanie zawężone warunkiem wyżej: `step` nie jest tu 5, więc `step + 1` mieści się
       w zakresie. Bez tego TypeScript widzi `number`, a `as Step` bez sprawdzenia byłoby
       obietnicą na słowo — dokładnie tym, czego ten projekt nie dopuszcza. */
    const next: Step = step === 1 ? 2 : step === 2 ? 3 : step === 3 ? 4 : 5;
    setStep(next);
  };

  const goBack = () => {
    setProblem(null);
    setStepSaved(false);
    const previous: Step = step === 5 ? 4 : step === 4 ? 3 : step === 3 ? 2 : 1;
    setStep(previous);
  };

  const pickTile = (index: number) => {
    pendingTile.current = index;
    setUploadFailed(false);
    fileInput.current?.click();
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const index = pendingTile.current;
    // Pole czyszczone od razu, żeby wybranie tego samego pliku drugi raz też wywołało zmianę.
    event.target.value = '';
    pendingTile.current = null;
    if (!file || index === null) return;

    setTileBusy((current) => new Set(current).add(index));
    setUploadFailed(false);
    try {
      const uploaded = await uploadGalleryImage(apiKey, await downscaleGallery(file));
      setPreviews((current) => ({ ...current, [uploaded.imagePath]: uploaded.url }));
      const nextImages = images.map((image, at) => (at === index ? uploaded.imagePath : image));
      setImages(nextImages);
      /* Zapisywane od razu, a nie przy „dalej": wgranie już się stało po stronie serwera, więc
         zostawienie samej ścieżki w pamięci przeglądarki znaczyłoby plik w koszyku i galerię
         bez niego, gdyby ktoś zamknął kartę. */
      const response = await saveSettings(apiKey, { galleryImages: nextImages });
      onSettings(response.settings);
    } catch (_) {
      setUploadFailed(true);
    } finally {
      setTileBusy((current) => {
        const next = new Set(current);
        next.delete(index);
        return next;
      });
    }
  };

  const tileSrc = (image: string, index: number) =>
    previews[image]
    || settings.galleryPreviewUrls[index]
    || (image.startsWith('/') || image.startsWith('http') ? image : '');

  /** Powód, dla którego nie da się ogłosić. Puste = da się, i to jest jedyne kliknięcie bez cofnięcia. */
  const announceReason = ((): string => {
    if (saving) return t('wiz.announcing');
    if (iso === '' || !yearOk) return t('wiz.yearBad');
    if (!draft.eventName.trim() || !draft.eventLocation.trim()) return t('wiz.errIncomplete');
    if (summaryFailed) return t('wiz.sumFailed');
    if (summary === null) return t('wiz.sumLoading');
    if (confirmYear.trim() !== year) return t('wiz.confirmYearWrong');
    if (!understood) return t('wiz.confirmNeedTick');
    return '';
  })();

  const announceNow = async () => {
    if (announceReason !== '') return;
    setProblem(null);
    setStepSaved(false);
    setSaving(true);
    /* NAJPIERW ZAPIS. Patrz nagłówek pliku: Worker ogłasza zawartość bazy, nie formularza. */
    const ok = await persist();
    if (!ok) {
      setSaving(false);
      return;
    }
    try {
      const result = await announceEdition(apiKey);
      setDone(result.queued ? 'queued' : 'already');
      /* Liczby po ogłoszeniu są już inne — żywe tabele właśnie zostały wyczyszczone — więc
         podsumowanie schodzi z ekranu razem z guzikiem. Zostawione pokazywałoby, ile głosów
         „zniknie", po tym jak zniknęły. */
      setSummary(null);
    } catch (problemFromServer) {
      const code = problemFromServer instanceof ApiError ? problemFromServer.code : undefined;
      setProblem(editionRefusalKey(code));
    } finally {
      setSaving(false);
    }
  };

  const field =
    'w-full rounded-xl border border-white/15 bg-navy-950/55 px-3 py-2.5 text-sm text-white outline-none focus:border-yellow';
  const label = 'text-[11px] font-semibold uppercase tracking-wider text-white/45';

  return (
    <section className="mt-4 rounded-2xl border border-coral/30 bg-gradient-to-br from-coral/10 via-white/4 to-navy-900 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white">{t('wiz.title')}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">{t('wiz.lead')}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-3 py-1.5 text-[11px] font-bold text-white/70 hover:border-white/60 hover:text-white"
        >
          <X className="size-3.5" />
          {t('wiz.close')}
        </button>
      </div>

      {/* Pasek kroków. Nazwy, nie same numery: „Krok 3 z 5" nie mówi, co jest w trzecim, więc
          po powrocie z przerwy trzeba by go otwierać, żeby się dowiedzieć. Kroki są tu do
          czytania, nie do klikania — przeskok do przodu ominąłby zapis kroku, przez który się
          przeskakuje, a wtedy Worker ogłosiłby to, czego nie ma w bazie. */}
      <ol className="mt-4 flex flex-wrap gap-1.5">
        {STEP_LABELS.map((entry) => (
          <li
            key={entry.step}
            aria-current={entry.step === step ? 'step' : undefined}
            className={
              entry.step === step
                ? 'rounded-full bg-yellow px-3 py-1 text-[11px] font-extrabold text-navy-950'
                : entry.step < step
                  ? 'rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white/80'
                  : 'rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/40'
            }
          >
            {entry.step}. {t(entry.label)}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-[12px] font-semibold text-white/70">
        {t('wiz.step')} {step} {t('wiz.stepOf')} {STEP_LABELS.length}
      </p>

      {/* ---------------------------------------------------------- krok 1 */}
      {step === 1 ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[13px] leading-relaxed text-white/55">{t('wiz.step1Lead')}</p>
          <label className="grid gap-1.5">
            <span className={label}>{t('wiz.dateLabel')}</span>
            <input
              type="datetime-local"
              value={draft.eventDate}
              onChange={(event) =>
                setDraft((current) => ({ ...current, eventDate: event.target.value }))}
              className={field}
            />
          </label>

          {/* ROK WYLICZONY, NIE WPISANY DRUGI RAZ.
              Dwa pola na jedną informację to pierwsze miejsce na rozjazd: rok wpisany ręcznie
              jako 2027 przy dacie z października 2026 dałby rocznik archiwum inny niż termin
              na stronie, a oba wyglądałyby na wpisane świadomie. Tu rok jest ODCZYTEM z daty
              i liczy go ta sama strefa, w której liczy go baza — patrz `editionYearInRome`. */}
          <div className="rounded-xl border border-white/10 bg-navy-950/40 px-3 py-2.5">
            <span className={label}>{t('wiz.yearLabel')}</span>
            <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-yellow">
              {year || t('wiz.yearNone')}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/40">{t('wiz.yearNote')}</p>
          </div>

          {iso !== '' && !yearOk ? (
            <p className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] text-coral">
              {t('wiz.yearBad')} ({EDITION_YEAR_MIN}–{EDITION_YEAR_MAX})
            </p>
          ) : null}
          {yearArchived ? (
            <p className="rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] leading-relaxed text-coral">
              {t('wiz.yearTaken')}
            </p>
          ) : null}
          {yearActive ? (
            <p className="rounded-xl border border-blue-400/25 bg-blue-400/10 px-3 py-2 text-[12px] leading-relaxed text-blue-100">
              {t('wiz.yearActive')}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- krok 2 */}
      {step === 2 ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[13px] leading-relaxed text-white/55">{t('wiz.step2Lead')}</p>
          <label className="grid gap-1.5">
            <span className={label}>{t('set.eventName')}</span>
            <input
              value={draft.eventName}
              maxLength={80}
              onChange={(event) =>
                setDraft((current) => ({ ...current, eventName: event.target.value }))}
              className={field}
            />
          </label>
          <label className="grid gap-1.5">
            <span className={label}>{t('set.eventLocation')}</span>
            <input
              value={draft.eventLocation}
              maxLength={120}
              onChange={(event) =>
                setDraft((current) => ({ ...current, eventLocation: event.target.value }))}
              className={field}
            />
          </label>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- krok 3 */}
      {step === 3 ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[13px] leading-relaxed text-white/55">{t('wiz.step3Lead')}</p>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
            className="hidden"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                disabled={tileBusy.has(index)}
                onClick={() => pickTile(index)}
                aria-label={`${t('set.galleryPhoto')} ${index + 1}`}
                className="group relative aspect-[4/3] overflow-hidden rounded-2xl border-2 border-white/10 bg-navy-950/60 text-white/50 transition hover:border-yellow focus-visible:outline-2 focus-visible:outline-yellow"
              >
                {tileSrc(image, index) ? (
                  <img
                    src={tileSrc(image, index)}
                    alt=""
                    className={tileBusy.has(index) ? 'size-full object-cover opacity-30' : 'size-full object-cover'}
                  />
                ) : (
                  <ImagePlus className="absolute inset-0 m-auto size-6" />
                )}
                {tileBusy.has(index) ? (
                  <span className="absolute inset-0 grid place-items-center text-[10px] font-bold uppercase tracking-wider text-yellow">
                    {t('set.uploading')}
                  </span>
                ) : null}
                <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-navy-950/80 text-[11px] font-extrabold text-yellow">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
          {uploadFailed ? <p className="text-[12px] text-coral">{t('set.uploadFailed')}</p> : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- krok 4 */}
      {step === 4 ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[13px] leading-relaxed text-white/55">{t('wiz.step4Lead')}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {SECTION_FLAGS.map((entry) => (
              <label
                key={entry.field}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-navy-900/60 px-4 py-3"
              >
                <span className="text-[13px] font-medium text-white/85">{t(entry.label)}</span>
                <input
                  type="checkbox"
                  checked={flags[entry.field]}
                  onChange={(event) => setFlag(entry.field, event.target.checked)}
                  className="size-4 accent-yellow"
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- krok 5 */}
      {step === 5 ? (
        <div className="mt-4 grid gap-3">
          <p className="text-[13px] leading-relaxed text-white/55">{t('wiz.step5Lead')}</p>

          <div className="rounded-xl border border-coral/30 bg-coral/10 p-3">
            <p className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-coral">
              <AlertTriangle className="size-4" />
              {draft.eventName.trim()} · {year} · {draft.eventLocation.trim()}
            </p>

            {summaryFailed ? (
              <p className="mt-2 text-[12px] leading-relaxed text-coral">{t('wiz.sumFailed')}</p>
            ) : summary === null ? (
              <p className="mt-2 text-[12px] text-white/60">{t('wiz.sumLoading')}</p>
            ) : (
              <ul className="mt-2 grid gap-1.5 text-[12px] leading-relaxed text-white/80">
                <li>
                  {summary.activeEditionKey
                    ? `${t('wiz.sumArchive')}: ${summary.activeEditionKey}`
                    : t('wiz.sumArchiveNone')}
                </li>
                <li>
                  {t('wiz.sumParticipants')}: <b className="tabular-nums text-white">{summary.participants}</b>
                </li>
                <li>
                  {t('wiz.sumVotes')}: <b className="tabular-nums text-white">{summary.votes}</b>
                </li>
                <li>
                  {t('wiz.sumMails')}: <b className="tabular-nums text-white">{summary.mails}</b>{' '}
                  <span className="text-white/45">({t('wiz.sumMailsNote')})</span>
                </li>
              </ul>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-white/45">{t('wiz.sumFrozen')}</p>
          </div>

          {/* Dwa potwierdzenia, nie jedno okienko „czy na pewno".
              Okienko przeglądarki odklikuje się odruchem, a ta operacja kasuje oddane głosy.
              Przepisanie roku wymaga spojrzenia na to, co się ogłasza; zaznaczenie zgody
              wymaga przeczytania, czego nie da się odzyskać. */}
          <label className="grid gap-1.5">
            <span className={label}>{t('wiz.confirmYear')}</span>
            <input
              value={confirmYear}
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => setConfirmYear(event.target.value)}
              className={field}
            />
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-relaxed text-white/80">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-yellow"
            />
            {t('wiz.confirmUnderstand')}
          </label>
          <p className="text-[11px] leading-relaxed text-white/40">{t('wiz.confirmWhy')}</p>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- stopka */}
      <div className="mt-5 flex flex-wrap items-start gap-2.5">
        <ActionButton
          label={t('wiz.back')}
          reason={step === 1 ? t('wiz.backFirst') : saving ? t('wiz.saving') : ''}
          tone="border border-white/25 text-white/80 hover:border-white/60 hover:text-white"
          onPress={goBack}
        />
        {step === 5 ? (
          <ActionButton
            label={saving ? t('wiz.announcing') : t('wiz.announce')}
            /* Po udanym ogłoszeniu przycisk jest wyłączony NA STAŁE, z powodem obok. Drugie
               kliknięcie nie jest groźne (Worker rozpoznaje już ogłoszoną edycję po
               `announcementEventDate`), ale wygląda na potrzebne, gdy pierwszy raz nie dał
               widocznego skutku — a rocznik został właśnie zamknięty i tego się nie powtarza. */
            reason={done === null ? announceReason : t('wiz.doneLock')}
            tone="bg-coral text-white hover:bg-white hover:text-navy-950"
            icon={<Megaphone className="size-3.5" />}
            onPress={() => void announceNow()}
          />
        ) : (
          <ActionButton
            label={saving ? t('wiz.saving') : t('wiz.next')}
            reason={stepReason}
            tone="bg-yellow text-navy-950 hover:bg-white"
            onPress={() => void goNext()}
          />
        )}
        {stepSaved ? (
          <span role="status" className="self-center text-[12px] text-emerald-300">{t('wiz.stepSaved')}</span>
        ) : null}
      </div>

      {problem ? (
        <p className="mt-3 rounded-xl border border-coral/30 bg-coral/10 px-3 py-2 text-[12px] leading-relaxed text-coral">
          {t(problem)}
        </p>
      ) : null}
      {done === 'queued' ? (
        <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-[12px] leading-relaxed text-emerald-200">
          {t('wiz.doneQueued')}
        </p>
      ) : null}
      {done === 'already' ? (
        <p className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[12px] leading-relaxed text-white/60">
          {t('wiz.doneAlready')}
        </p>
      ) : null}
    </section>
  );
}
