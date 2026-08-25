import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, Bot, Loader2, Send, User } from 'lucide-react';
import { cn, formatAgo, formatMoment } from '@/lib/utils';
import type { PanelLocale, TranslateKey } from '../i18n';
import {
  fetchThreadMessages,
  fetchThreads,
  replyToThread,
  setThreadMode,
  type ChatMessage,
  type ChatThread
} from '../api';

const POLL_MS = 4000;

/* ------------------------------------------------------------------ bubbles */

/**
 * One message.
 *
 * The organiser's own words sit on the right, the visitor's on the left, the bot's on
 * the left in a quieter shade — the same arrangement as every messaging app anyone has
 * used, which is the whole reason to follow it. `Delivered` goes under the last outgoing
 * bubble only; on every bubble it becomes wallpaper and stops being read.
 */
function Bubble({
  message,
  t,
  showDelivered
}: {
  message: ChatMessage;
  t: (key: TranslateKey) => string;
  showDelivered: boolean;
}) {
  const mine = message.author === 'organiser';
  const bot = message.author === 'ai';

  return (
    <div className={cn('flex w-full items-end gap-2', mine && 'flex-row-reverse')}>
      <span
        className={cn(
          'grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-bold',
          /* Three distinguishable avatars, and only one of them is the accent colour.
             The visitor used to be `bg-blue-500`, which no longer exists — the palette has
             one accent now, and it belongs to the organiser's own messages. */
          mine
            ? 'bg-primary text-primary-foreground'
            : bot
              ? 'bg-muted text-muted-foreground'
              : 'bg-secondary text-secondary-foreground'
        )}
        title={mine ? t('chat.you') : bot ? t('chat.bot') : t('chat.visitor')}
      >
        {mine ? t('chat.you').slice(0, 2).toUpperCase() : bot ? <Bot className="size-3.5" /> : <User className="size-3.5" />}
      </span>

      <div className={cn('flex min-w-0 max-w-[78%] flex-col', mine && 'items-end')}>
        <div
          className={cn(
            'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed',
            mine
              ? 'rounded-br-md bg-yellow text-navy-950'
              : bot
                ? 'rounded-bl-md bg-white/8 text-white/75'
                : 'rounded-bl-md bg-navy-800 text-white'
          )}
        >
          {message.body}
        </div>
        <span className="mt-1 px-1 text-[11px] text-white/30">
          {showDelivered && mine ? `${t('chat.delivered')} · ` : ''}
          {formatMoment(message.at, t('locale.intl'))}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- view */

export function Chat({
  t,
  locale,
  apiKey,
  onChanged
}: {
  t: (key: TranslateKey) => string;
  locale: PanelLocale;
  apiKey: string;
  onChanged: () => void;
}) {
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  const scroller = useRef<HTMLDivElement | null>(null);
  /** True while the reader is at the bottom. Drives whether new messages scroll. */
  const pinned = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const loadThreads = useCallback(() => {
    fetchThreads(apiKey)
      .then((data) => {
        setThreads(data.threads);
        setError(false);
      })
      .catch(() => setError(true));
  }, [apiKey]);

  const loadMessages = useCallback(
    (threadId: string) => {
      fetchThreadMessages(apiKey, threadId)
        .then((data) => setMessages(data.messages))
        .catch(() => setError(true));
    },
    [apiKey]
  );

  useEffect(() => {
    loadThreads();
    const timer = window.setInterval(() => {
      if (!document.hidden) loadThreads();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (!active) return;
    loadMessages(active);
    const timer = window.setInterval(() => {
      if (!document.hidden) loadMessages(active);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [active, loadMessages]);

  /* Auto-scroll, but only while the reader is already at the bottom. Scrolling up is a
     deliberate act — they are reading something earlier — and yanking them back down for
     every incoming message is the single most irritating thing a chat can do. */
  useEffect(() => {
    const element = scroller.current;
    if (!element || !pinned.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
    pinned.current = atBottom;
    setShowJump(!atBottom);
  };

  const jumpDown = () => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    pinned.current = true;
    setShowJump(false);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    // Shown immediately with a temporary id. A reply that waits for a round trip before
    // appearing reads as a dropped message, and the poll reconciles it a moment later.
    const optimistic: ChatMessage = {
      id: `pending-${Date.now()}`,
      at: new Date().toISOString(),
      author: 'organiser',
      body
    };
    setMessages((current) => [...current, optimistic]);
    setDraft('');
    pinned.current = true;
    try {
      await replyToThread(apiKey, active, body);
      loadMessages(active);
      loadThreads();
      onChanged();
    } catch {
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setDraft(body);
      setError(true);
    } finally {
      setSending(false);
    }
  };

  const changeMode = async (mode: ChatThread['mode']) => {
    if (!active) return;
    await setThreadMode(apiKey, active, mode).catch(() => setError(true));
    loadThreads();
    onChanged();
  };

  const current = threads?.find((thread) => thread.id === active) ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <h2 className="text-2xl font-bold tracking-tight text-white">{t('chat.title')}</h2>
      <p className="mt-1.5 text-sm text-white/55">{t('chat.lead')}</p>

      {error ? (
        <p className="mt-3 rounded-xl border border-coral/30 bg-coral/10 px-4 py-2.5 text-sm text-white/80">
          {t('common.error')}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ---- list ---- */}
        <div className="rounded-2xl border border-white/10 bg-white/4">
          <div className="border-b border-white/10 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-white/40">
            {t('chat.threads')}
          </div>
          <ul className="max-h-[62vh] overflow-y-auto">
            {threads === null ? (
              <li className="px-4 py-6 text-sm text-white/40">{t('common.loading')}</li>
            ) : threads.length === 0 ? (
              <li className="px-4 py-6 text-sm text-white/40">{t('chat.empty')}</li>
            ) : (
              threads.map((thread) => (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActive(thread.id);
                      pinned.current = true;
                    }}
                    className={cn(
                      'flex w-full flex-col gap-1 border-l-2 px-4 py-3 text-left transition',
                      active === thread.id
                        ? 'border-yellow bg-white/8'
                        : thread.mode === 'human'
                          ? 'border-coral hover:bg-white/6'
                          : 'border-transparent hover:bg-white/6'
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
                        {thread.name || t('chat.visitor')}
                      </span>
                      {thread.unread > 0 ? (
                        <span className="grid min-w-4 place-items-center rounded-full bg-coral px-1 text-[10px] font-bold text-white">
                          {thread.unread}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-[11px] text-white/40">
                      {thread.email || t('chat.noEmail')} · {thread.locale.toUpperCase()}
                    </span>
                    <span className="text-[11px] text-white/30">
                      {formatAgo(thread.lastAt, t('locale.rel'))}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        {/* ---- conversation ---- */}
        <div className="flex min-h-[62vh] flex-col rounded-2xl border border-white/10 bg-white/4">
          {!current ? (
            <div className="grid flex-1 place-items-center px-6 text-center text-sm text-white/40">
              {t('chat.pick')}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-white">
                    {current.name || t('chat.visitor')}
                  </div>
                  <div className="truncate text-[11px] text-white/40">
                    {current.email || t('chat.noEmail')}
                  </div>
                </div>

                <span
                  className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-bold',
                    current.mode === 'human'
                      ? 'bg-coral/20 text-coral'
                      : current.mode === 'closed'
                        ? 'bg-white/10 text-white/50'
                        : 'bg-primary/15 text-primary'
                  )}
                >
                  {current.mode === 'human'
                    ? t('chat.modeHuman')
                    : current.mode === 'closed'
                      ? t('chat.modeClosed')
                      : t('chat.modeAi')}
                </span>

                {current.mode === 'closed' ? (
                  <button
                    type="button"
                    onClick={() => changeMode('human')}
                    className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/70 hover:border-white/50 hover:text-white"
                  >
                    {t('chat.reopen')}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => changeMode('ai')}
                      className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/70 hover:border-white/50 hover:text-white"
                    >
                      {t('chat.handBack')}
                    </button>
                    <button
                      type="button"
                      onClick={() => changeMode('closed')}
                      className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-semibold text-white/70 hover:border-white/50 hover:text-white"
                    >
                      {t('chat.close')}
                    </button>
                  </>
                )}
              </div>

              <div className="relative min-h-0 flex-1">
                <div
                  ref={scroller}
                  onScroll={onScroll}
                  role="log"
                  aria-relevant="additions"
                  className="flex h-full flex-col gap-4 overflow-y-auto p-4"
                >
                  {messages.map((message, index) => (
                    <Bubble
                      key={message.id}
                      message={message}
                      t={t}
                      showDelivered={index === messages.length - 1}
                    />
                  ))}
                </div>

                {showJump ? (
                  <button
                    type="button"
                    onClick={jumpDown}
                    className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-navy-800 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg ring-1 ring-white/15"
                  >
                    <ArrowDown className="size-3.5" />
                    {locale === 'pl' ? 'Nowe wiadomości' : 'Nuovi messaggi'}
                  </button>
                ) : null}
              </div>

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-end gap-2 border-t border-white/10 p-3"
              >
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    // Enter sends, Shift+Enter makes a line. Same as everywhere else.
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder={t('chat.placeholder')}
                  className="min-h-11 flex-1 resize-none rounded-xl border border-white/15 bg-white/6 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-yellow/60"
                />
                <button
                  type="submit"
                  disabled={sending || !draft.trim()}
                  className="grid size-11 shrink-0 place-items-center rounded-xl bg-yellow text-navy-950 transition hover:bg-white disabled:opacity-40"
                  aria-label={t('chat.send')}
                >
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
