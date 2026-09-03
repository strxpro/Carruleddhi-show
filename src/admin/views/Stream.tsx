import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, PlayCircle, RefreshCw, Square, Heart } from 'lucide-react';
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
export function Stream({ t, apiKey, pl }: {
  t: (key: TranslateKey) => string;
  apiKey: string;
  pl: boolean;
}) {
  const [state, setState] = useState<StreamState | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [provider, setProvider] = useState<'youtube' | 'twitch'>('youtube');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const absorb = useCallback((next: StreamState) => {
    setState(next);
    setProvider(next.provider === 'twitch' ? 'twitch' : 'youtube');
    setTitle(next.title);
    /* Pole adresu pokazuje IDENTYFIKATOR, nie to, co wklejono. Serwer i tak zapamiętał tylko
       jego (patrz `streamIdFrom` w Workerze), więc pokazanie tu poprzedniego wklejenia
       obiecywałoby, że przechowujemy coś, czego nie przechowujemy. */
    setUrl(next.videoId);
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
          {(['youtube', 'twitch'] as const).map((one) => (
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
        {state?.videoId ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('stream.savedId')} <span className="font-mono text-foreground">{state.videoId}</span>
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
          {pl ? 'Nie udało się: ' : 'Non è riuscito: '}<span className="font-mono opacity-70">{error}</span>
        </p>
      ) : null}
    </div>
  );
}
