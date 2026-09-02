import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  // `Bell` is still here as the sidebar icon for the reminders tab. The bell in the header
  // and its `BellRing` variant moved into NotificationBell together with the dropdown.
  Bell,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Medal,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  Settings,
  StickyNote,
  Trophy
} from 'lucide-react';
import {
  CommandPalette,
  DashboardSidebar,
  flattenNav,
  useMediaQuery,
  type NavGroupData,
  type NavItemData
} from '@/components/ui/dashboard-sidebar';
import { dictionaries, type PanelLocale, type TranslateKey } from './i18n';
import { fetchInbox, type Inbox, fetchRoster, fetchSponsorLeads, fetchThreads } from './api';
import { useSession } from './useSession';
import { Gate } from './Gate';
import { Dashboard } from './views/Dashboard';
import { Registrations } from './views/Registrations';
import { Voting } from './views/Voting';
import { Prizes } from './views/Prizes';
import { Stats } from './views/Stats';
import { Season } from './views/Season';
import { Chat } from './views/Chat';
import { Wall } from './views/Wall';
import { Subscribers } from './views/Subscribers';
import { NotificationBell } from './views/NotificationBell';
import { SettingsView } from './views/SettingsView';

const LOCALE_KEY = 'carruleddhi.admin.locale';
const TAB_KEY = 'carruleddhi.admin.tab';

/** How often the bell asks. Ten seconds is invisible to a person and free to the API:
 *  it is one indexed count per table, no rows returned. */
const INBOX_INTERVAL_MS = 10_000;

type TabId =
  | 'dashboard'
  | 'stats'
  | 'season'
  | 'registrations'
  | 'voting'
  | 'awards'
  | 'chat'
  | 'wall'
  | 'reminders'
  | 'newsletter'
  | 'settings';

export default function App() {
  const { state, unlock, lock } = useSession();

  const [locale, setLocale] = useState<PanelLocale>(() => {
    const stored = localStorage.getItem(LOCALE_KEY);
    if (stored === 'pl' || stored === 'it') return stored;
    // Italian for anyone whose browser is Italian; Polish otherwise. The event is in
    // Italy and half the people running it are not Polish.
    return navigator.language?.startsWith('it') ? 'it' : 'pl';
  });

  useEffect(() => {
    localStorage.setItem(LOCALE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const dict = dictionaries[locale];
  const t = useCallback((key: TranslateKey) => dict[key], [dict]);

  const [tab, setTab] = useState<TabId>(() => (sessionStorage.getItem(TAB_KEY) as TabId) || 'dashboard');
  useEffect(() => {
    sessionStorage.setItem(TAB_KEY, tab);
  }, [tab]);

  /* The rail starts open on a wide screen and closed on a phone.
     Not a stored preference: the right answer is a property of the device, and somebody
     who opened it once on a laptop should not find it covering their phone screen. */
  const wide = useMediaQuery('(min-width: 768px)');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [railInitialised, setRailInitialised] = useState(false);
  useEffect(() => {
    if (railInitialised) return;
    setSidebarOpen(wide);
    setRailInitialised(true);
  }, [wide, railInitialised]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [highlightQuery, setHighlightQuery] = useState('');
  const [inbox, setInbox] = useState<Inbox | null>(null);

  const key = state.status === 'open' ? state.key : '';

  const refreshInbox = useCallback(() => {
    if (!key) return;
    fetchInbox(key)
      .then(setInbox)
      .catch(() => {
        /* A failed count is not worth interrupting anyone for; the next tick retries. */
      });
  }, [key]);

  useEffect(() => {
    if (!key) return;
    refreshInbox();
    const timer = window.setInterval(() => {
      // Nothing to poll for while the tab is in the background.
      if (!document.hidden) refreshInbox();
    }, INBOX_INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) refreshInbox();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [key, refreshInbox]);

  /* Cmd+K / Ctrl+K anywhere in the panel. Registered once, at the top, because a shortcut
     that only works when a particular element has focus is a shortcut nobody finds. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPaletteOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /**
   * The navigation, grouped.
   *
   * Three groups rather than one flat list of seven. "Skrzynka" is what you open the panel
   * to check, "Wydarzenie" is the event's own data, and Settings sits at the bottom with
   * the way out — which is where a destructive action belongs, away from the rows you press
   * every day.
   */
  const groups = useMemo<NavGroupData[]>(
    () => [
      {
        items: [
          { id: 'search', title: t('nav.search'), icon: Search, shortcut: '⌘K' },
          { id: 'dashboard', title: t('nav.dashboard'), icon: LayoutDashboard },
          /* Nad grupami, obok pulpitu: to jest ekran, na który się WCHODZI, a nie dane
             wydarzenia, które się prowadzi. Bez plakietki — statystyki nie mają stanu
             „nowe od ostatniego razu", mają zakres czasu wybierany na miejscu. */
          { id: 'stats', title: t('nav.stats'), icon: BarChart3 },
          /* Podsumowanie sezonu — obok statystyk, z tego samego powodu i z tą samą zasadą.
             To jest ODCZYT o wydarzeniu, a nie prowadzenie wydarzenia: wchodzi się tu po
             zawodach albo rok później, żeby przeczytać rocznik. Świadomie NIE w „Głosowaniu",
             gdzie stoją przyciski czyszczące głosy i wysyłające listy — przeglądanie archiwum
             obok działania bez cofnięcia to zaproszenie do pomyłki. Bez plakietki: rocznik nie
             ma stanu „nowe od ostatniego razu". */
          { id: 'season', title: t('nav.season'), icon: Medal }
        ]
      },
      {
        heading: t('nav.groupInbox'),
        items: [
          { id: 'chat', title: t('nav.chat'), icon: MessageSquare, badge: inbox?.counts.chats },
          { id: 'wall', title: t('nav.wall'), icon: StickyNote, badge: inbox?.counts.wall }
        ]
      },
      {
        heading: t('nav.groupEvent'),
        items: [
          {
            id: 'registrations',
            title: t('nav.registrations'),
            icon: ListChecks,
            badge: inbox?.counts.registrations
          },
          /* No badge. Voting has no "new since you last looked" — it has a phase, and the
             screen itself is where that is read. A number here would be votes arriving,
             which is not something anyone needs to act on one at a time. */
          { id: 'voting', title: t('nav.voting'), icon: Trophy },
          /* Nagrody jury, obok głosowania i osobno od niego. Bez plakietki: „nowe od
             ostatniego razu" nie istnieje dla listy, którą wypełnia się samemu. Osobna
             zakładka, a nie sekcja w „Głosowaniu" — uzasadnienie w nagłówku Prizes.tsx. */
          { id: 'awards', title: t('nav.awards'), icon: Award },
          {
            id: 'audience',
            title: t('nav.audience'),
            icon: Activity,
            // Grouped because they are one question — who wants to hear from us — asked
            // in two places. Collapsed by default; opens itself when one is active.
            children: [
              { id: 'reminders', title: t('nav.reminders'), icon: Bell, badge: inbox?.counts.reminders },
              { id: 'newsletter', title: t('nav.newsletter'), icon: Send, badge: inbox?.counts.newsletter }
            ]
          }
        ]
      }
    ],
    [t, inbox]
  );

  const bottom = useMemo<NavItemData[]>(
    () => [
      {
        id: 'settings',
        title: t('nav.settings'),
        icon: Settings,
        /* PLAKIETKA ZGŁOSZEŃ SPONSORÓW — DOŁĄCZONA DO ISTNIEJĄCEGO MECHANIZMU.
           ------------------------------------------------------------------
           Skrzynka zgłoszeń sponsorów stoi w ustawieniach, a ustawienia są na dole rai, poza
           polem wzroku: bez liczby przy nich zgłoszenie od firmy czekałoby na przypadkowe
           wejście na ten ekran. Plakietka jest tym samym mechanizmem, co przy rozmowach i
           tablicy — `inbox.counts`, odpytywane raz na dziesięć sekund — bo druga droga do
           tej samej liczby to druga wersja prawdy i drugie żądanie.

           `counts.sponsors` jest POLEM OPCJONALNYM i dziś nie przychodzi: końcówka `inbox`
           w Workerze liczy sześć rzeczy i o sponsorach nie wie (sprawdzone). Dopisanie
           siódmego licznika jest zmianą w Workerze, której to zadanie NIE robi — patrz
           raport. Dopóki jej nie ma, wartość jest `undefined`, a `NavRow` rysuje plakietkę
           tylko dla wartości prawdziwej, więc na rai po prostu nic nie ma. W dniu, w którym
           Worker zacznie tę liczbę oddawać, plakietka zapali się sama, bez poprawki tutaj. */
        badge: inbox?.counts.sponsors
      },
      { id: 'logout', title: t('nav.logout'), icon: LogOut }
    ],
    [t, inbox]
  );

  const flat = useMemo(() => flattenNav(groups, bottom), [groups, bottom]);

  const [searchResults, setSearchResults] = useState<NavItemData[]>([]);
  const handleGlobalSearch = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2 || !key) {
      setSearchResults([]);
      return;
    }
    const needle = query.trim().toLowerCase();
    try {
      const [roster, sponsors, threads] = await Promise.all([
        fetchRoster(key, 500).catch(() => ({ roster: [] })),
        fetchSponsorLeads(key, 100).catch(() => ({ leads: [] })),
        fetchThreads(key, 100).catch(() => ({ threads: [] }))
      ]);
      const results: NavItemData[] = [];
      
      roster.roster?.forEach(p => {
        if (p.name.toLowerCase().includes(needle) || p.email?.toLowerCase().includes(needle)) {
          results.push({
            id: `searchResult:registrations:${needle}`,
            title: p.name || '?',
            subtitle: t('nav.registrations') + (p.email ? ` • ${p.email}` : ''),
            icon: ListChecks
          });
        }
      });

      sponsors.leads?.forEach(l => {
        if (l.name.toLowerCase().includes(needle) || l.contact_person?.toLowerCase().includes(needle)) {
          results.push({
            id: `searchResult:settings:${needle}`,
            title: l.name || '?',
            subtitle: 'Sponsor' + (l.contact_person ? ` • ${l.contact_person}` : ''),
            icon: Settings
          });
        }
      });

      threads.threads?.forEach(tItem => {
        if (tItem.name?.toLowerCase().includes(needle) || tItem.email?.toLowerCase().includes(needle)) {
          results.push({
            id: `searchResult:chat:${needle}`,
            title: tItem.name || '?',
            subtitle: t('nav.chat') + (tItem.email ? ` • ${tItem.email}` : ''),
            icon: MessageSquare
          });
        }
      });

      setSearchResults(results);
    } catch (e) {}
  }, [key, t]);

  const go = useCallback(
    (id: string) => {
      if (id === 'logout') {
        lock();
        return;
      }
      if (id === 'search') {
        setPaletteOpen(true);
        return;
      }
      // `audience` is a group heading, not a screen. Pressing it opens the group; if it
      // ever reaches here, land on the first thing inside it rather than a blank panel.
      if (id === 'audience') {
        setTab('reminders');
        return;
      }
      setTab(id as TabId);
    },
    [lock]
  );

  if (state.status === 'checking' && !key) {
    /* A spinner rather than the word, and no skeleton here: what follows is either the
       password gate or the whole panel, and there is no shape this could hold still for.
       The label stays for screen readers, which is the one audience the word served. */
    return (
      <div
        className="grid min-h-dvh place-items-center bg-background"
        role="status"
        aria-busy="true"
        aria-label={t('common.loading')}
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" strokeWidth={1.5} />
      </div>
    );
  }

  if (state.status !== 'open') {
    return (
      <Gate
        t={t}
        locale={locale}
        setLocale={setLocale}
        onUnlock={unlock}
        busy={false}
        error={state.status === 'locked' ? (state.error as TranslateKey | undefined) : undefined}
      />
    );
  }

  const total = inbox?.total ?? 0;
  const activeTitle = flat.find((item) => item.id === tab)?.title ?? t('nav.dashboard');

  return (
    <div className="flex min-h-dvh bg-background">
      <DashboardSidebar
        groups={groups}
        bottom={bottom}
        activeId={tab}
        onSelect={go}
        open={sidebarOpen}
        setOpen={setSidebarOpen}
        brand="Carruleddhi 2026"
        subtitle={t('nav.subtitle')}
        menuLabel={t('nav.menu')}
        onSearch={() => setPaletteOpen(true)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 bg-card px-4 md:px-6">
          {/* The same toggle as in the rail, in the place a dashboard usually puts it.
              Two ways to reach it because on a phone the rail's own button is behind the
              scrim once the rail is open. */}
          <button
            type="button"
            onClick={() => setSidebarOpen((value) => !value)}
            aria-label={t('nav.menu')}
            className="hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:block"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-[18px]" strokeWidth={1.5} />
            ) : (
              <PanelLeftOpen className="size-[18px]" strokeWidth={1.5} />
            )}
          </button>

          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden truncate sm:inline">Carruleddhi 2026</span>
            <span className="hidden sm:inline">/</span>
            <span className="truncate font-medium text-foreground">{activeTitle}</span>
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground lg:flex"
          >
            <Search className="size-3.5" strokeWidth={1.5} />
            {t('nav.search')}
            <kbd className="ml-4 font-mono text-[10px] text-muted-foreground/60">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={refreshInbox}
            title={t('top.refresh')}
            aria-label={t('top.refresh')}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="size-4" strokeWidth={1.5} />
          </button>

          {/* The bell, and what is behind it.
              It used to mark everything read and open the dashboard — so "what is new" was
              answered with six totals and no way to see what any of them referred to. Now it
              opens a list of the things themselves and marking them read is a separate,
              deliberate press. Two gestures, because they are two decisions: "show me" and
              "I have dealt with it". */}
          <NotificationBell
            t={t}
            locale={locale}
            apiKey={key}
            total={total}
            onGo={setTab}
            onSeen={refreshInbox}
          />
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-7">
          {tab === 'dashboard' ? (
            <Dashboard t={t} locale={locale} inbox={inbox} onGo={setTab} apiKey={key} />
          ) : null}
          {tab === 'registrations' ? (
            <Registrations t={t} locale={locale} apiKey={key} onChanged={refreshInbox} highlightQuery={highlightQuery} />
          ) : null}
          {tab === 'stats' ? <Stats t={t} apiKey={key} /> : null}
          {tab === 'season' ? <Season t={t} apiKey={key} /> : null}
          {tab === 'voting' ? <Voting t={t} apiKey={key} /> : null}
          {tab === 'awards' ? <Prizes t={t} apiKey={key} /> : null}
          {tab === 'chat' ? <Chat t={t} locale={locale} apiKey={key} onChanged={refreshInbox} highlightQuery={highlightQuery} /> : null}
          {tab === 'wall' ? <Wall t={t} locale={locale} apiKey={key} onChanged={refreshInbox} /> : null}
          {tab === 'reminders' ? (
            <Subscribers t={t} locale={locale} apiKey={key} kind="reminders" onChanged={refreshInbox} />
          ) : null}
          {tab === 'newsletter' ? (
            <Subscribers t={t} locale={locale} apiKey={key} kind="newsletter" onChanged={refreshInbox} />
          ) : null}
          {tab === 'settings' ? (
            <SettingsView highlightQuery={highlightQuery}
              t={t}
              locale={locale}
              setLocale={setLocale}
              onForget={lock}
              apiKey={key}
              ai={inbox?.ai}
            />
          ) : null}
        </div>
      </main>

      <CommandPalette
        items={flat}
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onSelect={go}
        placeholder={t('nav.searchPlaceholder')}
        emptyLabel={t('nav.searchEmpty')}
      />
    </div>
  );
}
