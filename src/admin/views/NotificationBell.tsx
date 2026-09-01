import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, BellRing, Check, Loader2 } from 'lucide-react';
import { formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import { fetchInboxItems, markInboxSeen, type InboxCounts, type InboxItem } from '../api';

type TabId = 'dashboard' | 'registrations' | 'chat' | 'wall' | 'reminders' | 'newsletter' | 'settings';

/** Which screen each kind of thing lives on. */
const DESTINATION: Record<keyof InboxCounts, TabId> = {
  registrations: 'registrations',
  // Messages from the contact form land in the chat inbox alongside the live conversations.
  contacts: 'chat',
  reminders: 'reminders',
  newsletter: 'newsletter',
  wall: 'wall',
  chats: 'chat',
  /* Zgłoszenie sponsora prowadzi do ustawień, bo tam stoi karta „Zgłoszenia sponsorów" i tam
     zapada decyzja. Wpisane razem z licznikiem w `InboxCounts`, choć końcówka `inbox` tego
     rodzaju jeszcze nie oddaje: te dwie mapy są `Record<keyof InboxCounts, …>`, więc dziura
     w nich byłaby błędem kompilacji, a nie dzwonkiem prowadzącym w nieznane miejsce. */
  sponsors: 'settings'
};

const LABELS: Record<PanelLocale, Record<keyof InboxCounts, string>> = {
  pl: {
    registrations: 'Nowe zgłoszenie',
    contacts: 'Wiadomość z formularza',
    reminders: 'Zapis na przypomnienia',
    newsletter: 'Zapis na newsletter',
    wall: 'Wpis na tablicy',
    chats: 'Rozmowa na czacie',
    sponsors: 'Zgłoszenie sponsora'
  },
  it: {
    registrations: 'Nuova iscrizione',
    contacts: 'Messaggio dal modulo',
    reminders: 'Iscrizione ai promemoria',
    newsletter: 'Iscrizione alla newsletter',
    wall: 'Messaggio in bacheca',
    chats: 'Conversazione in chat',
    sponsors: 'Richiesta di sponsorizzazione'
  }
};

/**
 * The bell and its dropdown.
 *
 * WHY THE LIST IS FETCHED ON OPEN AND NOT WITH THE COUNTS
 *   The counts poll runs every ten seconds for as long as the panel is open. It is six
 *   indexed counts and returns no rows, which is why it can run that often without anybody
 *   noticing. Fetching twenty rows from six tables on the same schedule would turn a free
 *   poll into a steady load for a list nobody is looking at. So `action: 'list'` is asked for
 *   once, when the bell is pressed.
 *
 * WHY "MARK READ" IS ITS OWN BUTTON
 *   The old bell marked everything read the instant it was clicked. That is fine when the
 *   bell is a counter, and wrong once it is a list: opening it to glance at what arrived
 *   would clear the badge, and anything not dealt with in that moment was gone from view with
 *   no way to get it back.
 */
export function NotificationBell({
  t,
  locale,
  apiKey,
  total,
  onGo,
  onSeen
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
  total: number;
  onGo: (tab: TabId) => void;
  onSeen: () => void;
}) {
  const pl = locale === 'pl';
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    if (!apiKey) return;
    setLoading(true);
    setFailed(false);
    fetchInboxItems(apiKey)
      .then((data) => setItems(data.items ?? []))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [apiKey]);

  /* Closed by a click anywhere else and by Escape. Both, because a dropdown that only closes
     on Escape is a dropdown that stays open on a touchscreen. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) load();
  };

  const seen = () => {
    markInboxSeen(apiKey)
      .then(() => {
        onSeen();
        setItems([]);
        setOpen(false);
      })
      .catch(() => setFailed(true));
  };

  return (
    <div ref={holder} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title={pl ? 'Co nowego' : 'Novità'}
        className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {total > 0 ? (
          <BellRing className="size-4 text-primary" strokeWidth={1.5} />
        ) : (
          <Bell className="size-4" strokeWidth={1.5} />
        )}
        {total > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {total > 99 ? '99+' : total}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={pl ? 'Co nowego' : 'Novità'}
          /* Right-aligned and capped in height. The bell is the last thing in the header, so a
             left-aligned panel would hang off the edge of the window on a narrow screen. */
          className="absolute right-0 top-11 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h3 className="text-sm font-bold text-foreground">{pl ? 'Co nowego' : 'Novità'}</h3>
            {items && items.length > 0 ? (
              <button
                type="button"
                onClick={seen}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Check className="size-3.5" />
                {t('top.markSeen')}
              </button>
            ) : null}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto">
            {loading ? (
              <p className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('common.loading')}
              </p>
            ) : null}

            {failed ? (
              <p className="px-4 py-6 text-sm text-foreground">
                {t('common.error')}{' '}
                <button type="button" onClick={load} className="font-semibold underline">
                  {t('common.retry')}
                </button>
              </p>
            ) : null}

            {items && items.length === 0 && !loading && !failed ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                {pl ? 'Nic nowego od ostatniego sprawdzenia.' : 'Niente di nuovo dall’ultimo controllo.'}
              </p>
            ) : null}

            {items?.map((item) => (
              <button
                key={`${item.kind}-${item.id}`}
                type="button"
                onClick={() => {
                  onGo(DESTINATION[item.kind]);
                  setOpen(false);
                }}
                className="flex w-full flex-col gap-0.5 border-b border-border/60 px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent"
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    {LABELS[locale][item.kind]}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {formatMoment(item.at, locale)}
                  </span>
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title || '—'}</span>
                {item.detail ? (
                  <span className="text-xs leading-snug text-muted-foreground">{item.detail}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
