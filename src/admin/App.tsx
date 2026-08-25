import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  StickyNote
} from 'lucide-react';
import {
  Sidebar,
  SidebarBody,
  SidebarLink,
  SidebarToggle,
  type SidebarLinkItem
} from '@/components/ui/sidebar';
import { dictionaries, type PanelLocale, type TranslateKey } from './i18n';
import { fetchInbox, markInboxSeen, type Inbox } from './api';
import { useSession } from './useSession';
import { Gate } from './Gate';
import { Dashboard } from './views/Dashboard';
import { Registrations } from './views/Registrations';
import { Chat } from './views/Chat';
import { Wall } from './views/Wall';
import { Subscribers } from './views/Subscribers';
import { SettingsView } from './views/SettingsView';

const LOCALE_KEY = 'carruleddhi.admin.locale';
const TAB_KEY = 'carruleddhi.admin.tab';

/** How often the bell asks. Ten seconds is invisible to a person and free to the API:
 *  it is one indexed count per table, no rows returned. */
const INBOX_INTERVAL_MS = 10_000;

type TabId = 'dashboard' | 'registrations' | 'chat' | 'wall' | 'reminders' | 'newsletter' | 'settings';

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

  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const links = useMemo<(SidebarLinkItem & { id: TabId })[]>(
    () => [
      { id: 'dashboard', label: t('nav.dashboard'), icon: <LayoutDashboard className="size-5" /> },
      {
        id: 'registrations',
        label: t('nav.registrations'),
        icon: <ListChecks className="size-5" />,
        badge: inbox?.counts.registrations
      },
      {
        id: 'chat',
        label: t('nav.chat'),
        icon: <MessageSquare className="size-5" />,
        badge: inbox?.counts.chats
      },
      {
        id: 'wall',
        label: t('nav.wall'),
        icon: <StickyNote className="size-5" />,
        badge: inbox?.counts.wall
      },
      {
        id: 'reminders',
        label: t('nav.reminders'),
        icon: <Bell className="size-5" />,
        badge: inbox?.counts.reminders
      },
      {
        id: 'newsletter',
        label: t('nav.newsletter'),
        icon: <Send className="size-5" />,
        badge: inbox?.counts.newsletter
      },
      { id: 'settings', label: t('nav.settings'), icon: <Settings className="size-5" /> }
    ],
    [t, inbox]
  );

  if (state.status === 'checking' && !key) {
    return (
      <div className="grid min-h-dvh place-items-center bg-navy-950 text-sm text-white/50">
        {t('common.loading')}
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

  const nav = (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {/* The button first, so on a phone held in one hand it is the nearest thing to
            the thumb. It is also the only way to widen the rail on a touch screen —
            hover does not exist there. */}
        <div className="flex items-center gap-2">
          <SidebarToggle label={t('nav.menu')} />
          {sidebarOpen ? (
            <span className="truncate text-sm font-bold text-white">Carruleddhi 2026</span>
          ) : null}
        </div>

        <nav className="mt-5 flex flex-col gap-1">
          {links.map((link) => (
            <SidebarLink
              key={link.id}
              link={link}
              isActive={tab === link.id}
              onSelect={(id) => {
                setTab(id as TabId);
                setSidebarOpen(false);
              }}
            />
          ))}
        </nav>
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-3">
        <div className="flex gap-1 px-2 pb-1">
          {(['pl', 'it'] as const).map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => setLocale(code)}
              aria-pressed={locale === code}
              className={
                locale === code
                  ? 'rounded-lg bg-white/12 px-2.5 py-1 text-[11px] font-bold text-white'
                  : 'rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white/40 hover:text-white'
              }
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
        <SidebarLink
          link={{ id: 'logout', label: t('nav.logout'), icon: <LogOut className="size-5" /> }}
          onSelect={lock}
        />
      </div>
    </>
  );

  return (
    <div className="flex min-h-dvh bg-navy-950">
      <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
        <SidebarBody className="justify-between gap-4">{nav}</SidebarBody>
      </Sidebar>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/10 bg-navy-900/60 px-4 py-3 md:px-7">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold tracking-tight text-white">
              {t(`nav.${tab}` as TranslateKey)}
            </h1>
          </div>

          <button
            type="button"
            onClick={refreshInbox}
            title={t('top.refresh')}
            aria-label={t('top.refresh')}
            className="grid size-9 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw className="size-4" />
          </button>

          {/* The bell. Clicking it marks everything read and takes you to the summary,
              because "what is new" and "I have seen it" are the same gesture. */}
          <button
            type="button"
            onClick={() => {
              setTab('dashboard');
              if (total > 0) {
                markInboxSeen(key)
                  .then(refreshInbox)
                  .catch(() => {});
              }
            }}
            title={t('top.markSeen')}
            className="relative grid size-9 place-items-center rounded-xl text-white/55 hover:bg-white/10 hover:text-white"
          >
            {total > 0 ? <BellRing className="size-4 text-yellow" /> : <Bell className="size-4" />}
            {total > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                {total > 99 ? '99+' : total}
              </span>
            ) : null}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-7">
          {tab === 'dashboard' ? (
            <Dashboard t={t} locale={locale} inbox={inbox} onGo={setTab} apiKey={key} />
          ) : null}
          {tab === 'registrations' ? <Registrations t={t} locale={locale} apiKey={key} /> : null}
          {tab === 'chat' ? <Chat t={t} locale={locale} apiKey={key} onChanged={refreshInbox} /> : null}
          {tab === 'wall' ? <Wall t={t} locale={locale} apiKey={key} onChanged={refreshInbox} /> : null}
          {tab === 'reminders' ? <Subscribers t={t} kind="reminders" /> : null}
          {tab === 'newsletter' ? <Subscribers t={t} kind="newsletter" /> : null}
          {tab === 'settings' ? (
            <SettingsView
              t={t}
              locale={locale}
              setLocale={setLocale}
              onForget={lock}
              apiKey={key}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
