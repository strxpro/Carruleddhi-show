import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, PlayCircle, RefreshCw, Square, Heart, ExternalLink } from 'lucide-react';
import type { TranslateKey } from '../i18n';
import { fetchStreamAdmin, saveStream, setStreamLive, resetStreamHearts, type StreamState } from '../api';
import { ActionButton } from './ActionButton';

/**
 * Transmisja na żywo — jeden ekran, dwie decyzje.
 * ===========================================================================
 * PIERWSZA: czym leci. Adres wkleja się raz, zwykle na długo przed startem, i nic się po
 * nim nie dzieje — zakładka na stronie nadal nie istnieje. To jest przygotowanie.
 *
 * DRUGA: czy trwa. Osobny przycisk, naciskany w chwili, w której naprawdę zaczynasz.
 * Dopiero on pokazuje przycisk w hero i zakładkę z odtwarzaczem WSZYSTKIM odwiedzającym
 * naraz — dlatego jest osobno od zapisu adresu, a nie schowany w tym samym „Zapisz".
 *
 * Rozdzielenie tych dwóch decyzji jest tu całą treścią ekranu. Gdyby zapis adresu otwierał
 * transmisję, zakładka pojawiałaby się na stronie w połowie ustawiania — a to jest ten
 * rodzaj pomyłki, którego nie da się cofnąć przed publicznością, bo ona już to zobaczyła.
 */
/**
 * Adres do OBEJRZENIA, złożony z identyfikatora — nigdy z tego, co wklejono.
 * ---------------------------------------------------------------------------
 * Ta sama zasada, co przy `embedUrl` w Workerze, i z tego samego powodu: serwer zapamiętuje
 * wyłącznie identyfikator, więc wszystko, co pokazujemy, ma być z niego wyliczone. Różnica
 * jest w przeznaczeniu — `embedUrl` robi adres dla ramki odtwarzacza, ten robi adres, który
 * człowiek może kliknąć i zobaczyć, czy zapisał to, co chciał.
 *
 * Round-trip jest tu warunkiem, a nie miłym dodatkiem: ten napis wraca do pola i przy
 * następnym „Zapisz" jedzie z powrotem do Workera. `streamIdFrom` rozbiera oba kształty —
 * `?v=` dla YouTube i pierwszy człon ścieżki dla Twitcha — więc zapisanie drugi raz daje ten
 * sam identyfikator, a nie pusty.
 */
function watchUrl(provider: StreamState['provider'], id: string) {
  if (!id) return '';
  /* Facebook trzyma CALY adres, nie identyfikator — wtyczka wideo innego nie przyjmuje.
     Doklejenie go po `?v=` dawaloby napis w rodzaju
     `https://www.youtube.com/watch?v=https://www.facebook.com/...`, czyli dokladnie to,
     co zglaszano jako "zapisuje sie jakies dziwne id". */
  if (provider === 'facebook') return id.startsWith('http') ? id : `https://${id}`;
  if (provider === 'twitch') return `https://www.twitch.tv/${id}`;
  return `https://www.youtube.com/watch?v=${id}`;
}

export function Stream({ t, apiKey, pl }: {
  t: (key: TranslateKey) => string;
  apiKey: string;
  pl: boolean;
}) {
  const [state, setState] = useState<StreamState | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<StreamState['provider']>('youtube');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const absorb = useCallback((next: StreamState) => {
    setState(next);
    /* Trzy wartosci, nie dwie: przy `=== 'twitch' ? ... : 'youtube'` transmisja z Facebooka
       wracala z serwera jako YouTube i pierwszy zapis po odswiezeniu ja gubil. */
    setProvider(next.provider === 'twitch' || next.provider === 'facebook' ? next.provider : 'youtube');
    setTitle(next.title);
    /* Pole pokazuje PEŁNY ADRES, złożony z zapamiętanego identyfikatora.
       ---------------------------------------------------------------------------
       Stał tu sam identyfikator — `dQw4w9WgXcQ` — z uzasadnieniem, że serwer i tak nie
       przechowuje wklejenia, więc pokazanie go obiecywałoby coś, czego nie robimy. Powód był
       dobry, wniosek zły: po zapisaniu w polu zostawał napis, który nie wygląda na adres, nie
       da się go kliknąć i nie da się na oko sprawdzić, czy to ta transmisja. Zgłoszone jako
       „wpisuję link, a pokazuje mi się jakieś id".

       Adres jest WYLICZANY z identyfikatora, więc nie obiecuje niczego ponad to, co naprawdę
       zapamiętaliśmy — a przy następnym zapisie wraca do Workera i rozbiera się z powrotem na
       ten sam identyfikator. Samo id nadal widać niżej, przy „Zapisany identyfikator". */
    setUrl(watchUrl(next.provider, next.videoId));
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      absorb(await fetchStreamAdmin(apiKey));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [apiKey, absorb]);

  useEffect(() => { void load(); }, [load]);

  /* Odpytywanie co trzydzieści sekund TYLKO gdy transmisja trwa: licznik serc rośnie wtedy
     naprawdę, a przy zamkniętej zakładce nie ma czego odświeżać. */
  useEffect(() => {
    if (!state?.live) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      fetchStreamAdmin(apiKey).then(absorb).catch(() => { /* zostaje jak było */ });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [apiKey, state?.live, absorb]);

  const run = async (action: () => Promise<StreamState>, message: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      absorb(await action());
      setNote(message);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Kod bledu zamieniony na zdanie, ktore mowi CO ZROBIC.
   * ---------------------------------------------------------------------------
   * Panel wypisywal sam kod — `STREAM_BAD_URL` — i to jest komunikat dla programisty, nie
   * dla organizatora stojacego na zboczu. Zgloszenie brzmialo "podaje link i nie chce sie
   * zapisac", bo ekran nie mowil ani co jest nie tak, ani czy to wina adresu, bazy, czy
   * panelu. Kod zostaje pod spodem, mniejsza czcionka: gdy zdanie nie wystarczy, jest po
   * czym szukac.
   */
  const errorSentence = (code: string | null) => {
    if (!code) return null;
    if (code.includes('STREAM_YT_CHANNEL_LINK')) return t('stream.errChannelLink');
    if (code.includes('STREAM_BAD_URL')) return t('stream.errBadUrl');
    if (code.includes('STREAM_NO_URL')) return t('stream.errNoUrl');
    if (code.includes('STREAM_WRITE_FAILED')) return t('stream.errWriteFailed');
    return null;
  };

  const live = Boolean(state?.live);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">{t('stream.title')}</h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{t('stream.lead')}</p>
        </div>
        <span
          className={[
            'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider',
            live ? 'bg-destructive/20 text-destructive' : 'bg-muted text-muted-foreground'
          ].join(' ')}
        >
          {live ? t('stream.onAir') : t('stream.offAir')}
        </span>
      </div>

      {/* --------------------------------------------------------- adres */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Link2 className="size-4" /> {t('stream.sourceTitle')}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('stream.sourceHint')}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(['youtube', 'twitch', 'facebook'] as const).map((one) => (
            <button
              key={one}
              type="button"
              onClick={() => setProvider(one)}
              className={[
                'rounded-full px-4 py-1.5 text-xs font-semibold capitalize transition-colors',
                provider === one
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border text-muted-foreground hover:text-foreground'
              ].join(' ')}
            >
              {one}
            </button>
          ))}
        </div>

        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder={provider === 'twitch' ? t('stream.placeholderTwitch') : t('stream.placeholderYouTube')}
          className="mt-3 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t('stream.titlePlaceholder')}
          className="mt-2 w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            label={t('stream.save')}
            reason={busy ? t('vote.whyBusy') : url.trim() ? '' : t('stream.whyNoUrl')}
            tone="bg-yellow text-navy-950 hover:bg-white"
            onPress={() => void run(() => saveStream(apiKey, provider, url, title), t('stream.saved'))}
          />
          <ActionButton
            label={t('stream.refresh')}
            reason={busy ? t('vote.whyBusy') : ''}
            tone="bg-muted text-muted-foreground hover:text-foreground"
            icon={<RefreshCw size={13} />}
            onPress={() => void load()}
          />
        </div>
        {/* Identyfikator ORAZ odsyłacz. Jedno mówi, co dokładnie zapamiętał serwer, drugie
            pozwala to sprawdzić bez przepisywania — a sprawdzenie „czy to na pewno ta
            transmisja" przed naciśnięciem włącznika jest jedyną rzeczą, której z samego
            ciągu znaków zrobić się nie da. */}
        {state?.videoId ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{t('stream.savedId')}</span>
            <span className="font-mono text-foreground">{state.videoId}</span>
            <a
              href={watchUrl(state.provider, state.videoId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-foreground underline underline-offset-2 hover:text-primary"
            >
              {t('stream.openLink')} <ExternalLink size={12} />
            </a>
          </p>
        ) : null}
      </section>

      {/* ------------------------------------------------------ włącznik */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground">{t('stream.switchTitle')}</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('stream.switchHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            label={t('stream.open')}
            reason={busy ? t('vote.whyBusy') : state?.videoId ? (live ? t('stream.whyAlreadyOpen') : '') : url.trim() ? t('stream.whyNotSaved') : t('stream.whyNoUrl')}
            tone="bg-blue-600 text-white hover:bg-blue-500"
            icon={busy ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
            onPress={() => void run(() => setStreamLive(apiKey, true), t('stream.opened'))}
          />
          <ActionButton
            label={t('stream.close')}
            reason={busy ? t('vote.whyBusy') : live ? '' : t('stream.whyAlreadyClosed')}
            tone="bg-destructive/15 text-destructive hover:bg-destructive/25"
            icon={<Square size={13} />}
            confirmLabel={t('stream.closeConfirm')}
            onPress={() => void run(() => setStreamLive(apiKey, false), t('stream.closed'))}
          />
        </div>
      </section>

      {/* --------------------------------------------------------- serca */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Heart className="size-4" /> {t('stream.heartsTitle')}
        </h3>
        <p className="mt-2 font-mono text-3xl font-bold text-foreground">{state?.hearts ?? 0}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('stream.heartsHint')}</p>
        <div className="mt-4">
          <ActionButton
            label={t('stream.resetHearts')}
            reason={busy ? t('vote.whyBusy') : (state?.hearts ?? 0) > 0 ? '' : t('stream.whyNoHearts')}
            tone="bg-muted text-muted-foreground hover:text-foreground"
            confirmLabel={t('stream.resetConfirm')}
            onPress={() => void run(() => resetStreamHearts(apiKey), t('stream.heartsReset'))}
          />
        </div>
      </section>

      {note ? (
        <p className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-200">{note}</p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
          {errorSentence(error) ?? (pl ? 'Nie udało się.' : 'Non è riuscito.')}
          <span className="mt-1 block font-mono text-[10px] opacity-60">{error}</span>
        </p>
      ) : null}
    </div>
  );
}
