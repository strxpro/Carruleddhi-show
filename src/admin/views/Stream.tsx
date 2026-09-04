import { useCallback, useEffect, useRef, useState } from 'react';
import { Link2, Loader2, PlayCircle, RefreshCw, Square, Heart, ExternalLink, Mail, X, Plus } from 'lucide-react';
import type { TranslateKey } from '../i18n';
import {
  fetchStreamAdmin, saveStream, setStreamLive, resetStreamHearts,
  fetchStreamAudience, addStreamRecipient, removeStreamRecipient, notifyStreamStart,
  type StreamState, type StreamRecipient
} from '../api';
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
  const [audience, setAudience] = useState<StreamRecipient[] | null>(null);
  const [newEmail, setNewEmail] = useState('');

  /* POLE NALEZY DO CZLOWIEKA, KTORY W NIM PISZE.
     ---------------------------------------------------------------------------
     `absorb` wpisuje do pola to, co przyszlo z serwera — i to jest wlasciwe po zapisie
     albo po nacisnieciu „Odswiez". Ale ta sama funkcja biegnie przy kazdym odczycie stanu,
     takze przy wejsciu w zakladke i przy odpytywaniu w trakcie transmisji. Jesli ktos ma
     wtedy wklejony adres i jeszcze go nie zapisal, tekst znika mu spod palca.
     Zglaszane wielokrotnie jako „wklejam link i sie usuwa".

     Znacznik jest podnoszony przy pierwszej zmianie w polu i opuszczany dopiero wtedy, gdy
     to CZLOWIEK poprosil o wartosc z serwera: po udanym zapisie albo po „Odswiez". Odczyt
     w tle nie ma prawa nadpisac niezapisanej pracy — nawet gdyby serwer mial racje. */
  const touched = useRef(false);

  const absorb = useCallback((next: StreamState, fromUser = false) => {
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
    /* Jedyne miejsce, w ktorym pole adresu jest nadpisywane z zewnatrz. */
    if (fromUser || !touched.current) {
      setUrl(watchUrl(next.provider, next.videoId));
      touched.current = false;
    }
  }, []);

  /* WYSCIG, KTORY KASOWAL WKLEJONY ADRES.
     =========================================================================
     Odczyt stanu przy wejsciu w zakladke wolal `absorb(..., true)` — czyli „to jest
     prosba czlowieka, wpisz wartosc z serwera do pola". Przy szybkim laczu odpowiedz
     wracala, zanim ktokolwiek zdazyl cokolwiek wkleic, wiec nie bylo tego widac.

     Przy wolnym laczu — a zgloszenie przyszlo z przegladarki na VPN-ie — kolejnosc jest
     odwrotna: czlowiek zdazy wkleic adres, DOPIERO POTEM wraca odpowiedz z mountu i
     nadpisuje pole tym, co serwer ma zapisane. A serwer nie ma nic, wiec wpisuje pustke.
     Pole samo sie czysci sekunde po wklejeniu, przycisk „Zapisz zrodlo" gasnie (bo pole
     jest puste) i nie da sie nic zapisac. Dokladnie to bylo zglaszane.

     `fromUser` znaczy teraz to, co powinno bylo znaczyc od poczatku: ODPOWIEDZ NA
     KLIKNIECIE. Wejscie w zakladke nie jest kliknieciem w „Odswiez" — pole jest wtedy
     i tak puste, wiec brak nadpisania niczego nie kosztuje, a chroni przed wyscigiem. */
  const load = useCallback(async (fromUser = false) => {
    setError(null);
    try {
      absorb(await fetchStreamAdmin(apiKey), fromUser);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  }, [apiKey, absorb]);

  useEffect(() => { void load(); }, [load]);

  /* Lista odbiorcow czytana raz, przy wejsciu w zakladke. Odczyt zasiewa ja adresami
     z przypomnien, wiec nie jest darmowy — nie ma powodu powtarzac go co odswiezenie
     stanu transmisji. Po kazdej zmianie (dopisz, usun, wyslij) serwer i tak oddaje
     cala liste w odpowiedzi. */
  useEffect(() => {
    let cancelled = false;
    fetchStreamAudience(apiKey)
      .then((next) => { if (!cancelled) setAudience(next.recipients); })
      .catch(() => { /* sekcja pokaze pusto; blad zapisu i tak wypisze sie nizej */ });
    return () => { cancelled = true; };
  }, [apiKey]);

  /* Odpytywanie co trzydzieści sekund TYLKO gdy transmisja trwa: licznik serc rośnie wtedy
     naprawdę, a przy zamkniętej zakładce nie ma czego odświeżać. */
  useEffect(() => {
    if (!state?.live) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      /* Bez `true`: to jest odczyt w tle, a nie prosba czlowieka o wartosc z serwera. */
      fetchStreamAdmin(apiKey).then((next) => absorb(next)).catch(() => { /* zostaje jak było */ });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [apiKey, state?.live, absorb]);

  const run = async (action: () => Promise<StreamState>, message: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      absorb(await action(), true);
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
    if (code.includes('STREAM_NOT_LIVE')) return t('stream.errNotLive');
    if (code.includes('STREAM_BAD_EMAIL')) return t('stream.errBadEmail');
    if (code.includes('STREAM_BAD_URL')) return t('stream.errBadUrl');
    if (code.includes('STREAM_NO_URL')) return t('stream.errNoUrl');
    if (code.includes('STREAM_WRITE_FAILED')) return t('stream.errWriteFailed');
    /* Dwa rozne niepowodzenia, dwa rozne zdania: baza odmowila, albo baza przyjela
       i nic nie zmienila. Drugie jest gorsze, bo wyglada jak sukces. */
    if (code.includes('STREAM_NOT_STORED') || code.includes('STREAM_ROW_MISSING')) return t('stream.errNotStored');
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
          onChange={(event) => { touched.current = true; setUrl(event.target.value); }}
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
            onPress={() => void load(true)}
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

      {/* ------------------------------------------------ powiadomienie */}
      {/* RECZNIE, NIE NA ZEGARZE.
          List do kilkuset ludzi jest nieodwracalny, a "otworz transmisje" naciska sie
          takze na probe. Dlatego wysylka jest osobnym przyciskiem, POD lista odbiorcow:
          widac, do kogo pojdzie, zanim pojdzie. */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Mail className="size-4" /> {t('stream.notifyTitle')}
        </h3>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{t('stream.notifyHint')}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder={t('stream.notifyAddPlaceholder')}
            className="min-w-[14rem] flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <ActionButton
            label={t('stream.notifyAdd')}
            reason={busy ? t('vote.whyBusy') : newEmail.trim() ? '' : t('stream.errBadEmail')}
            tone="bg-muted text-muted-foreground hover:text-foreground"
            icon={<Plus size={13} />}
            onPress={() => void run(async () => {
              const next = await addStreamRecipient(apiKey, newEmail.trim(), pl ? 'pl' : 'it');
              setAudience(next.recipients);
              setNewEmail('');
              return state as StreamState;
            }, t('stream.notifyAdd'))}
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {t('stream.notifyPending')}{' '}
          <span className="font-mono text-foreground">{(audience || []).filter((one) => !one.sentAt).length}</span>
        </p>

        {audience && audience.length ? (
          <ul className="mt-2 max-h-60 space-y-1 overflow-auto">
            {audience.map((one) => (
              <li key={one.email} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1 text-xs hover:bg-muted/40">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-foreground">{one.email}</span>
                  {one.sentAt ? <span className="ml-2 text-emerald-400">{t('stream.notifyDone')}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => void run(async () => {
                    const next = await removeStreamRecipient(apiKey, one.email);
                    setAudience(next.recipients);
                    return state as StreamState;
                  }, t('stream.notifyRemove'))}
                  aria-label={`${t('stream.notifyRemove')} ${one.email}`}
                  className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t('stream.notifyEmpty')}</p>
        )}

        <div className="mt-4">
          <ActionButton
            label={t('stream.notifySend')}
            reason={
              busy ? t('vote.whyBusy')
                : !live ? t('stream.whyNotLive')
                : (audience || []).some((one) => !one.sentAt) ? '' : t('stream.whyNobody')
            }
            tone="bg-primary text-primary-foreground hover:opacity-90"
            icon={<Mail size={13} />}
            confirmLabel={t('stream.notifyConfirm')}
            onPress={() => void run(async () => {
              const result = await notifyStreamStart(apiKey);
              const next = await fetchStreamAudience(apiKey);
              setAudience(next.recipients);
              setNote(t('stream.notifySent').replace('{sent}', String(result.sent)).replace('{failed}', String(result.failed)));
              return state as StreamState;
            }, '')}
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

      {/* SKAD WIADOMO, CZY TO NOWA WERSJA I CZY SERWER ODPOWIADA.
          Data budowania paczki oraz adres, pod ktory ida zadania. Dwie linijki, ktore
          zastepuja pytanie „czy na pewno odswiezyles" — widac je na zrzucie ekranu. */}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/70">
        <span className="font-mono">{new Date(__BUILD_STAMP__).toLocaleString()}</span>
        {' · '}
        <span className="font-mono">{window.location.origin}</span>
        {' · '}
        <span className="font-mono">{state ? (state.videoId ? `id: ${state.videoId}` : 'serwer: brak adresu') : 'serwer nie odpowiedzial'}</span>
      </p>

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
