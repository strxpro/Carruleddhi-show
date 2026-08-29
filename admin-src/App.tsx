import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  LayoutDashboard, Users, MessageSquare, StickyNote, BellRing,
  Mail, Settings, LogOut, ExternalLink, Trophy
} from 'lucide-react';
import { Sidebar, SidebarBody, SidebarLink, type SidebarLinkItem } from '@/components/ui/sidebar';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Login } from '@/components/Login';
import { Registrations } from '@/components/Registrations';
import { Voting } from '@/components/Voting';
import { LocaleContext, useAuth, useDataKey, useLocaleState } from '@/hooks';
import { fetchInbox, type InboxCounts } from '@/api';
import type { Dict } from '@/i18n';

type TabId =
  | 'dashboard' | 'registrations' | 'chat' | 'wall'
  | 'reminders' | 'newsletter' | 'voting' | 'settings';

const TABS: { id: TabId; labelKey: keyof Dict; icon: React.ReactNode; counter?: keyof InboxCounts }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={20} /> },
  { id: 'registrations', labelKey: 'nav.registrations', icon: <Users size={20} />, counter: 'registrations' },
  { id: 'chat', labelKey: 'nav.chat', icon: <MessageSquare size={20} />, counter: 'chats' },
  { id: 'wall', labelKey: 'nav.wall', icon: <StickyNote size={20} />, counter: 'wall' },
  { id: 'reminders', labelKey: 'nav.reminders', icon: <BellRing size={20} />, counter: 'reminders' },
  { id: 'newsletter', labelKey: 'nav.newsletter', icon: <Mail size={20} />, counter: 'newsletter' },
  { id: 'voting', labelKey: 'nav.voting', icon: <Trophy size={20} /> },
  { id: 'settings', labelKey: 'nav.settings', icon: <Settings size={20} /> }
];

export default function App() {
  const localeState = useLocaleState();
  const { unlocked, logout } = useAuth();
  const { key: dataKey, setKey: setDataKey } = useDataKey();

  const [tab, setTab] = useState<TabId>('dashboard');
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<InboxCounts | null>(null);

  /**
   * The unread counts, on a timer.
   *
   * Ten seconds, and only while the tab is visible. Polling a background tab for hours
   * spends the operator's battery to keep a number nobody is looking at up to date.
   * Silent on failure: the badge disappearing is a smaller problem than an error banner
   * over the panel every ten seconds because the Wi-Fi dropped.
   */
  useEffect(() => {
    if (!unlocked || !dataKey) return;
    let alive = true;

    const tick = async () => {
      if (document.hidden) return;
      try {
        const result = await fetchInbox(dataKey);
        if (alive && result.counts) setCounts(result.counts);
      } catch {
        /* left as it was */
      }
    };

    void tick();
    const timer = window.setInterval(tick, 10_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [unlocked, dataKey]);

  if (!unlocked) {
    return (
      <LocaleContext.Provider value={localeState}>
        <Login onUnlocked={() => setTab('dashboard')} />
      </LocaleContext.Provider>
    );
  }

  const { t } = localeState;

  const links: SidebarLinkItem[] = TABS.map((entry) => ({
    label: t(entry.labelKey),
    href: `#${entry.id}`,
    icon: entry.icon,
    onClick: () => {
      setTab(entry.id);
      setOpen(false);
    },
    badge: entry.counter && counts ? counts[entry.counter] : undefined
  }));

  return (
    <LocaleContext.Provider value={localeState}>
      <div className="flex flex-col md:flex-row h-full w-full bg-navy-950">
        <Sidebar open={open} setOpen={setOpen}>
          <SidebarBody className="justify-between gap-8">
            <div className="flex flex-col flex-1 overflow-x-hidden">
              <a href="/" className="flex items-center gap-2.5 px-1 py-2 shrink-0">
                <span className="grid place-items-center w-9 h-9 rounded-xl bg-yellow text-navy-950 font-extrabold shrink-0">
                  C
                </span>
                <motion.span
                  animate={{ opacity: open ? 1 : 0, display: open ? 'block' : 'none' }}
                  className="whitespace-pre"
                >
                  <span className="block text-sm font-extrabold tracking-tight text-white">
                    {t('app.title')}
                  </span>
                  <span className="block text-[10px] uppercase tracking-[0.16em] text-yellow">
                    {t('app.subtitle')}
                  </span>
                </motion.span>
              </a>

              <nav className="mt-7 flex flex-col gap-1.5">
                {links.map((link) => (
                  <SidebarLink key={link.href} link={link} isActive={link.href === `#${tab}`} />
                ))}
              </nav>
            </div>

            <div className="grid gap-3">
              <motion.div animate={{ opacity: open ? 1 : 0, display: open ? 'block' : 'none' }}>
                <LanguagePicker className="w-full justify-center" />
              </motion.div>

              <SidebarLink
                link={{
                  label: t('nav.logout'),
                  href: '#logout',
                  icon: <LogOut size={20} />,
                  onClick: logout
                }}
              />
            </div>
          </SidebarBody>
        </Sidebar>

        <main className="flex-1 min-w-0 scroll-area">
          <div className="p-5 md:p-9 max-w-7xl">
            <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                {t(TABS.find((entry) => entry.id === tab)!.labelKey)}
              </h1>
              <a
                href="/"
                className="inline-flex items-center gap-2 text-xs font-bold text-white/45 hover:text-yellow transition-colors"
              >
                carruleddhishow.com <ExternalLink size={13} />
              </a>
            </header>

            {tab === 'registrations' && <Registrations dataKey={dataKey} setDataKey={setDataKey} />}

            {tab === 'voting' && <Voting dataKey={dataKey} />}

            {tab === 'dashboard' && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ['dash.registrations', counts?.registrations],
                  ['dash.waitingChat', counts?.chats],
                  ['dash.waitingWall', counts?.wall],
                  ['dash.attendees', counts?.reminders]
                ].map(([labelKey, value]) => (
                  <div
                    key={String(labelKey)}
                    className="rounded-3xl border border-white/10 bg-navy-900 p-6"
                  >
                    <div className="text-4xl font-extrabold text-yellow tabular-nums">
                      {value ?? '—'}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wider text-white/45">
                      {t(labelKey as keyof Dict)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab !== 'registrations' && tab !== 'dashboard' && tab !== 'voting' && (
              <p className="text-sm text-white/45">{t('dash.soon')}</p>
            )}
          </div>
        </main>
      </div>
    </LocaleContext.Provider>
  );
}
