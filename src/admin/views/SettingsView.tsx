import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Globe,
  ImagePlus,
  Lock,
  LogOut,
  Plus,
  Trash2,
  Unlock
} from 'lucide-react';
import type { PanelLocale, TranslateKey } from '../i18n';
import {
  fetchSettings,
  saveSettings,
  uploadSponsorLogo,
  type AiStatus,
  type SiteSettings,
  type Sponsor
} from '../api';
import { PurgePanel } from './PurgePanel';

/**
 * Settings, and the two things that used to need a developer.
 *
 * The password gate on the whole site and the sponsor list both lived in files: one in
 * a Vercel environment variable, the other in the repository. Both change at times when
 * nobody is at a laptop — the gate comes off on the morning of the event, and a sponsor
 * confirms by phone the week before. They are switches now, stored in Supabase and read
 * by the middleware and the public page.
 *
 * Nothing here saves as you type. Sponsors are edited locally and written on one press,
 * because a list you are halfway through reordering is not a list to publish; the
 * switches save immediately, because a switch has no halfway.
 */

const MAX_LOGO_EDGE = 480;
const MAX_LOGO_BYTES = 900_000;

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

const EMPTY: SiteSettings = {
  siteLocked: true,
  sponsors: [],
  showGallery: true,
  showWall: true,
  showPrizes: true,
  showCounters: true
};

export function SettingsView({
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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(false);

  /* The saved list, kept beside the edited one so the "unsaved changes" note is a fact
     rather than a flag somebody has to remember to set. */
  const [savedSponsors, setSavedSponsors] = useState<Sponsor[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingLogoFor = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetchSettings(apiKey)
      .then((response) => {
        if (!alive) return;
        setSettings(response.settings);
        setSavedSponsors(response.settings.sponsors);
        setLoaded(true);
      })
      .catch(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [apiKey]);

  const push = useCallback(
    async (patch: Partial<SiteSettings>) => {
      setStatus('saving');
      try {
        const response = await saveSettings(apiKey, patch);
        setSettings(response.settings);
        setSavedSponsors(response.settings.sponsors);
        setStatus('saved');
        window.setTimeout(() => setStatus('idle'), 2200);
      } catch (_) {
        setStatus('failed');
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

  if (!loaded) {
    return <div className="p-2 text-sm text-white/50">{t('common.loading')}</div>;
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
                <button
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      sponsors: current.sponsors.filter((_, i) => i !== index)
                    }))
                  }
                  title={t('set.sponsorRemove')}
                  aria-label={t('set.sponsorRemove')}
                  className="grid size-8 place-items-center rounded-lg text-coral/70 hover:bg-coral hover:text-white"
                >
                  <Trash2 className="size-4" />
                </button>
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
