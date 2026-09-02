import { useCallback, useEffect, useState } from 'react';
import { Handshake, ImageOff, RefreshCw } from 'lucide-react';
import { formatMoment } from '@/lib/utils';
import { Highlighter } from './Highlighter';
import type { TranslateKey } from '../i18n';
import {
  ApiError,
  approveSponsorLead,
  fetchSponsorLeads,
  rejectSponsorLead,
  type SiteSettings
} from '../api';
import {
  leadLink,
  leadPersonName,
  leadSponsorName,
  normalisePendingCount,
  normaliseSponsorLeads,
  type SponsorLeadRow
} from '../lib/sponsorLeads';
import { ActionButton } from './ActionButton';

/**
 * Skrzynka zgłoszeń sponsorów: przeczytać, zatwierdzić albo odrzucić.
 * ============================================================================
 * DLACZEGO TA KARTA STOI NAD LISTĄ SPONSORÓW, A NIE POD NIĄ
 *   Bo to jest wejście, a lista sponsorów jest jego skutkiem. Kolejność na ekranie odpowiada
 *   na pytanie, z którym się tu wchodzi — „czy ktoś się zgłosił" — zanim postawi przed oczami
 *   odpowiedź na pytanie zadawane rzadziej: „kto już jest". Pod listą trzydziestu sponsorów
 *   nowe zgłoszenie leżałoby poza pierwszym ekranem telefonu.
 *
 * DLACZEGO OSOBNY PLIK, A KARTA I TAK JEST W `SettingsView.tsx`
 *   Widok ustawień ma już tysiąc trzysta wierszy i pięć niezależnych stanów zapisu. Ta karta
 *   ma własny odczyt, własny stan zajętości wiersza i własne komunikaty, więc wpisana w tamten
 *   plik dołożyłaby szóstą maszynę stanu do funkcji, w której i tak trudno wskazać, gdzie
 *   kończy się jedna, a zaczyna druga. Osadzona jest dokładnie tam, gdzie ma być: nad sekcją
 *   sponsorów.
 *
 * DLACZEGO PANEL NIE DOPISUJE SPONSORA SAM
 *   Bo robi to Worker, w jednym żądaniu: `sponsor-approve` czyta ustawienia, dopisuje wpis,
 *   przepuszcza CAŁĄ listę przez `cleanSettings` i tylko wtedy stawia status `approved`.
 *   Dopisanie także z panelu — przez `push()` na karcie sponsorów — dałoby DWA kafelki tej
 *   samej firmy na stronie: raz od Workera, raz od panelu. Zamiast tego karta oddaje rodzicowi
 *   `settings` z odpowiedzi, a rodzic wchłania je do stanu ekranu. Skutek dla patrzącego jest
 *   ten, o który chodziło: sponsor pojawia się na liście niżej i jest zapisany, bez klikania
 *   „Zapisz".
 *
 * DWA PUSTE STANY, KTÓRE NIE MAJĄ PRAWA WYGLĄDAĆ TAK SAMO
 *   „Brak nowych zgłoszeń" to stan normalny i tak jest napisane. „Nie udało się odczytać" to
 *   niewiedza i jest osobnym zdaniem w innym kolorze. Zwinięcie ich w jedno znaczy przemilczaną
 *   rozmowę z firmą, która czeka na odpowiedź — bo cisza w tym miejscu wygląda dokładnie jak
 *   brak zgłoszeń.
 */

/** Komunikat pod kartą. `tone` rozdziela „zrobione" od „nie zrobione" — tekst czyta się po kolorze. */
interface Note {
  text: string;
  tone: 'good' | 'bad';
}

export function SponsorLeads({
  t,
  apiKey,
  onApproved,
  highlightQuery
}: {
  t: (key: TranslateKey) => string;
  apiKey: string;
  highlightQuery?: string;
  /**
   * Wywoływane po udanym zatwierdzeniu, z ustawieniami oddanymi przez Workera.
   *
   * `undefined` znaczy „końcówka nie przysłała ustawień" (starsze wdrożenie) — rodzic ma wtedy
   * doczytać je sam. Bez tego rozróżnienia panel po zatwierdzeniu pokazywałby listę sponsorów
   * bez właśnie dopisanej firmy i wyglądałoby to jak zatwierdzenie, które nic nie zrobiło.
   */
  onApproved: (settings: SiteSettings | undefined) => void;
}) {
  /** `null` znaczy „nie wiem", pusta tablica znaczy „nikt nie czeka". Patrz nagłówek pliku. */
  const [leads, setLeads] = useState<SponsorLeadRow[] | null>(null);
  /** Liczba z `counts` w odpowiedzi — z całej tabeli, nie z przyciętej stronicy. */
  const [pending, setPending] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  /**
   * Identyfikator zgłoszenia, którego decyzja właśnie leci. Nie jedna flaga na całą kartę:
   * zgłoszeń bywa kilka, a zajęty jest jeden wiersz — i tylko przy nim ma się kręcić kółko.
   */
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * Ostatni komunikat, jeden na kartę.
   *
   * Świadomie nie przy wierszu: po udanej decyzji wiersz znika z listy, więc komunikat
   * przypięty do niego zniknąłby razem z nim — czyli dokładnie w chwili, w której jest po co
   * go czytać.
   */
  const [note, setNote] = useState<Note | null>(null);

  const load = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      const response = await fetchSponsorLeads(apiKey);
      setLeads(normaliseSponsorLeads(response.submissions));
      setPending(normalisePendingCount(response.counts));
    } catch (_) {
      /* Odmowa końcówki i odpowiedź nieczytelna to dla tego ekranu to samo: nie wiemy, czy
         ktoś czeka. Jedno `null` i jedno zdanie, zamiast dwóch komunikatów opisujących tę
         samą niewiedzę różnymi słowami. */
      setLeads(null);
      setPending(null);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Kod odmowy → zdanie, które da się przeczytać przy stoliku.
   *
   * Trzy odmowy tej końcówki opisują trzy różne sytuacje i tylko jedna z nich znaczy „spróbuj
   * ponownie". Wspólne „nie udało się" kazałoby klikać w kółko przycisk, który nigdy nie
   * przejdzie — bo lista sponsorów jest pełna albo bo zgłoszenie rozstrzygnął ktoś inny z
   * drugiego telefonu minutę wcześniej.
   */
  const failureNote = (error: unknown): Note => {
    const code = error instanceof ApiError ? error.code : undefined;
    if (code === 'SETTINGS_TOO_MANY_SPONSORS') return { text: t('set.leadListFull'), tone: 'bad' };
    if (code === 'SETTINGS_SPONSOR_NAME') return { text: t('set.leadNoName'), tone: 'bad' };
    if (code === 'SPONSOR_LEAD_NOT_FOUND') return { text: t('set.leadGone'), tone: 'bad' };
    return { text: t('set.leadFailed'), tone: 'bad' };
  };

  /**
   * Zatwierdzenie: jedno żądanie, dwa skutki po stronie serwera.
   *
   * `added === false` znaczy, że Worker rozpoznał powtórkę i tylko przestawił status. To
   * normalna odpowiedź na drugie kliknięcie, nie awaria, więc dostaje własne zdanie — bez
   * niego „zatwierdzono" po drugim kliknięciu brzmiałoby jak potwierdzenie dopisania sponsora
   * po raz drugi i ktoś poszedłby szukać na stronie duplikatu, którego nie ma.
   */
  const approve = async (lead: SponsorLeadRow) => {
    setBusyId(lead.id);
    setNote(null);
    try {
      const response = await approveSponsorLead(apiKey, lead.id);
      onApproved(response.settings);
      setNote({
        text: response.added === false ? t('set.leadAlreadyThere') : t('set.leadApproved'),
        tone: 'good'
      });
      /* Odczyt po decyzji, a nie wykreślenie wiersza z tablicy w pamięci. Skrzynkę mogą mieć
         otwartą dwie osoby na dwóch telefonach, więc lista po decyzji ma pokazywać to, co
         serwer ma teraz, a nie to, co ten ekran pamięta z poprzedniej minuty. */
      await load();
    } catch (error) {
      setNote(failureNote(error));
    } finally {
      setBusyId(null);
    }
  };

  /** Odrzucenie: tylko status, bez cofnięcia — dlatego pytanie z potwierdzeniem. */
  const reject = async (lead: SponsorLeadRow) => {
    /* `window.confirm`, tak samo jak przy zamykaniu głosowania i czyszczeniu głosów
       (`vote.winnersConfirm` i sąsiednie w `Voting.tsx`). Pytanie jest ze słownika, więc jest
       w obu językach panelu i mówi, czego dotyczy oraz że nie ma cofnięcia — „czy na pewno?"
       bez tego zdania jest pytaniem, na które odpowiada się odruchowo. */
    if (!window.confirm(t('set.leadRejectConfirm'))) return;
    setBusyId(lead.id);
    setNote(null);
    try {
      await rejectSponsorLead(apiKey, lead.id);
      setNote({ text: t('set.leadRejected'), tone: 'good' });
      await load();
    } catch (error) {
      setNote(failureNote(error));
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Powód, dla którego oba guziki w tym wierszu są wyłączone — albo pusty napis.
   *
   * DWA RÓŻNE ZDANIA, BO TO DWIE RÓŻNE SYTUACJE
   *   Przy wierszu, którego decyzja właśnie leci, guzik ma powiedzieć „zapisuję". Przy
   *   POZOSTAŁYCH wierszach — „poczekaj, trwa inna decyzja". Jedno zdanie na oba przypadki
   *   znaczyłoby, że przy trzech zgłoszeniach dwa guziki mówią o zapisie, którego nikt na nich
   *   nie zlecił.
   *
   * DLACZEGO POZOSTAŁE WIERSZE SĄ W TYM CZASIE ZABLOKOWANE
   *   Bo `sponsor-approve` w Workerze czyta ustawienia, dopisuje wpis i zapisuje całość. Dwa
   *   takie żądania w locie naraz czytają tę samą listę i zapisują dwie różne — wygrywa to,
   *   które dotarło później, więc jeden z zatwierdzonych sponsorów po cichu nie trafia na
   *   stronę, a jego zgłoszenie i tak dostaje status `approved`. Zablokowanie na czas jednej
   *   decyzji kosztuje sekundę i usuwa cały ten przypadek.
   */
  const decisionReason = (lead: SponsorLeadRow): string => {
    if (!busyId) return '';
    return busyId === lead.id ? t('set.leadBusy') : t('set.leadWait');
  };

  /**
   * Liczba oczekujących: z `counts` gdy jest, z długości listy gdy nie ma.
   *
   * Formatowana przez `Intl.NumberFormat` z językiem panelu, jak każda liczba w statystykach
   * i w podsumowaniu sezonu. Przy nieudanym odczycie nie pokazujemy jej wcale — „0 oczekuje"
   * byłoby zdaniem o stanie, którego nie znamy.
   */
  const waiting = pending ?? leads?.length ?? 0;
  const count = new Intl.NumberFormat(t('locale.intl')).format(waiting);

  return (
    <section className="mt-4 rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-400/10 via-white/4 to-yellow/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-emerald-300">
            <Handshake className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white">{t('set.leads')}</h3>
            <p className="mt-1 max-w-xl text-[13px] leading-relaxed text-white/55">{t('set.leadsLead')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {leads ? (
            <span className="text-[11px] uppercase tracking-wider text-white/45">
              <b className="text-sm tabular-nums text-emerald-300">{count}</b> {t('set.leadsWaiting')}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || busyId !== null}
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:bg-white/[0.08] disabled:text-white/50"
          >
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
            {t('set.leadsReload')}
          </button>
        </div>
      </div>

      {/* Nieudany odczyt: osobne zdanie i osobny kolor od pustego stanu niżej. */}
      {!loading && leads === null ? (
        <p className="mt-4 rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-coral">
          {t('set.leadsFailed')}
        </p>
      ) : null}

      {/* Pusty stan jest treścią, nie brakiem treści — patrz słownik. */}
      {!loading && leads !== null && leads.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/15 p-3.5">
          <p className="text-[13px] leading-relaxed text-white/55">{t('set.leadsEmpty')}</p>
        </div>
      ) : null}

      {leads && leads.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-3">
          {leads.map((lead) => {
            const href = leadLink(lead.siteUrl);
            const person = leadPersonName(lead);
            return (
              <li
                key={lead.id}
                className="rounded-xl border border-white/10 bg-navy-900/60 p-3.5 sm:flex sm:items-start sm:gap-3.5"
              >
                {/* Podgląd logo z podpisanego adresu. Brak logo jest stanem normalnym — czat
                    pyta o nie jako o rzecz opcjonalną, a wgranie mogło się nie udać bez winy
                    zgłaszającego — więc pusta ramka MÓWI „bez logo", zamiast wyglądać jak
                    obrazek, który się nie wczytał. */}
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/15 bg-white/5 text-white/35">
                  {lead.logoUrl ? (
                    <img src={lead.logoUrl} alt={t('set.leadLogoAlt')} className="size-full object-contain" />
                  ) : (
                    <span className="flex flex-col items-center gap-1">
                      <ImageOff className="size-4" />
                      <span className="text-[9px] uppercase tracking-wide">{t('set.leadNoLogo')}</span>
                    </span>
                  )}
                </div>

                <div className="mt-3 min-w-0 flex-1 sm:mt-0">
                  <p className="truncate text-sm font-bold text-white">
                    <Highlighter text={leadSponsorName(lead)} query={highlightQuery} />
                  </p>

                  <dl className="mt-2 grid gap-1.5 text-[12px] sm:grid-cols-2">
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadCart')}</dt>
                      <dd className="min-w-0 break-words text-white/80">{lead.cartName || '—'}</dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadPerson')}</dt>
                      <dd className="min-w-0 break-words text-white/80">
                        <Highlighter text={person || '—'} query={highlightQuery} />
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadEmail')}</dt>
                      {/* Adres do zaznaczenia myszką, bez `mailto:` — organizator odpisuje z
                          tej samej skrzynki, do której zgłoszenie i tak przyszło mailem, a
                          `mailto:` na telefonie otwiera aplikację, której nikt w tym momencie
                          nie chciał. `select-all` robi z jednego kliknięcia całe zaznaczenie. */}
                      <dd className="min-w-0 select-all break-all font-mono text-white/80">
                        {lead.email || '—'}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadPhone')}</dt>
                      <dd className="min-w-0 break-all text-white/80">
                        {lead.phone || <span className="text-white/40">{t('set.leadNoPhone')}</span>}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5 sm:col-span-2">
                      <dt className="shrink-0 text-white/40">{t('set.leadUrl')}</dt>
                      <dd className="min-w-0">
                        {/* Klikalny TYLKO wtedy, gdy naprawdę jest adresem `https` — patrz
                            `leadLink`. `rel="noopener noreferrer"` przy `target="_blank"`, bo
                            bez tego otwierana strona dostaje `window.opener` i może przestawić
                            adres TEJ karty; to jest panel z hasłem w pamięci przeglądarki, więc
                            podmieniona karta jest podmienioną stroną logowania. `noreferrer`
                            dokłada drugą rzecz: obcy serwer nie dowiaduje się nawet, że
                            przyszliśmy z panelu administracyjnego. */}
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all font-medium text-yellow hover:underline"
                          >
                            {href}
                          </a>
                        ) : lead.siteUrl ? (
                          <span className="break-all text-white/60">
                            {lead.siteUrl}
                            <span className="mt-0.5 block text-[11px] leading-relaxed text-coral">
                              {t('set.leadBadUrl')}
                            </span>
                          </span>
                        ) : (
                          <span className="text-white/40">{t('set.leadNoUrl')}</span>
                        )}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadWhen')}</dt>
                      {/* Data przez `formatMoment`, czyli w strefie Europe/Rome i w języku
                          panelu — tak samo jak każda inna data w panelu. Zegar przeglądarki
                          organizatora nie ma tu nic do rzeczy: zawody są we Włoszech. */}
                      <dd className="min-w-0 tabular-nums text-white/80">
                        {formatMoment(lead.createdAt, t('locale.intl'))}
                      </dd>
                    </div>
                    <div className="flex min-w-0 gap-1.5">
                      <dt className="shrink-0 text-white/40">{t('set.leadLocale')}</dt>
                      {/* Język ROZMOWY, nie panelu: mówi, w jakim języku odpisać. */}
                      <dd className="min-w-0 uppercase text-white/80">{lead.locale || '—'}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 flex flex-wrap items-start gap-2.5">
                    {/* `ActionButton`, bo w stanie wyłączonym wypisuje POWÓD obok siebie.
                        Wyblakły przycisk bez powodu czyta się jak awaria panelu — zgłoszone
                        wcześniej jako „nie mogę klikać guzików", patrz nagłówek tamtego pliku.
                        Tu jedynym powodem jest trwająca decyzja: dwa żądania naraz o dwóch
                        zgłoszeniach zapisywałyby listę sponsorów z dwóch odczytów tej samej
                        chwili, a wygrywałby ten, który dotarł później. */}
                    <ActionButton
                      label={t('set.leadApprove')}
                      reason={decisionReason(lead)}
                      tone="bg-emerald-400 text-navy-950 hover:bg-white"
                      onPress={() => void approve(lead)}
                    />
                    <ActionButton
                      label={t('set.leadReject')}
                      reason={decisionReason(lead)}
                      tone="border border-coral/50 text-coral hover:bg-coral hover:text-white"
                      onPress={() => void reject(lead)}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {note ? (
        <p
          role="status"
          className={
            note.tone === 'good'
              ? 'mt-3.5 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-emerald-200'
              : 'mt-3.5 rounded-xl border border-coral/30 bg-coral/10 px-3.5 py-2.5 text-[12px] leading-relaxed text-coral'
          }
        >
          {note.text}
        </p>
      ) : null}
    </section>
  );
}
