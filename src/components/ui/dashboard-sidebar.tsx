import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Command, Menu, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The panel's navigation rail.
 *
 * WHAT THIS IS ADAPTED FROM, AND WHAT CHANGED
 *   A shadcn-style dashboard sidebar: grouped items with section headings, collapsible
 *   children, badges, keyboard shortcuts, a switcher at the top and a command palette.
 *   Four things had to change to make it real rather than a mock.
 *
 *   1. THE MOCK DATA IS GONE. The original shipped `mockNavGroups` and `mockBottomItems`
 *      as module constants and rendered them directly, so the component could only ever
 *      show Acme Corp's projects. Groups now arrive as a prop. That is the difference
 *      between a screenshot and a component.
 *
 *   2. THE WORKSPACE SWITCHER IS NOT A SWITCHER. There is one event and one database;
 *      a dropdown offering "Personal Workspace" and "Create Workspace" would be three
 *      lies in a menu. It keeps the shape — badge, name, subtitle — and shows what the
 *      panel is actually connected to.
 *
 *   3. IT COLLAPSES TO AN ICON RAIL INSTEAD OF DISAPPEARING. The original animated the
 *      whole thing to `w-0`, which on a phone leaves no navigation at all and nothing to
 *      orient by. It goes to a 64px rail of icons here, and on a narrow screen the opened
 *      rail slides over the content with a scrim rather than taking 264 of 390 pixels
 *      away from the page you are reading.
 *
 *   4. `useState` FOR EVERY OPEN GROUP WAS MOVED UP. In the original each NavItem kept
 *      its own `isOpen`, so a group closed itself whenever the tree re-rendered with a
 *      new badge count — and this panel polls badge counts every ten seconds. One set of
 *      open ids lives in the parent instead.
 *
 * The palette is the shadcn token set from src/admin.css: `card`, `border`, `primary`,
 * `muted-foreground`. No colour is written literally in this file.
 */

const RAIL = 64;
const EXPANDED = 264;

export interface NavItemData {
  id: string;
  title: string;
  icon: React.ElementType;
  badge?: number | string;
  shortcut?: string;
  children?: NavItemData[];
}

export interface NavGroupData {
  heading?: string;
  items: NavItemData[];
}

/** Flattens a tree, for the command palette and for looking up the active title. */
export function flattenNav(groups: NavGroupData[], extra: NavItemData[] = []): NavItemData[] {
  const walk = (items: NavItemData[]): NavItemData[] =>
    items.flatMap((item) => [item, ...(item.children ? walk(item.children) : [])]);
  return [...walk(groups.flatMap((group) => group.items)), ...walk(extra)];
}

/**
 * A live media query, kept in step with a listener.
 *
 * Read once and then watched, because the answer changes when a phone is turned sideways
 * and a rail that decided its behaviour at mount would be wrong for the rest of the
 * session.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(query).matches
  );
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/* ------------------------------------------------------------------ one row */

function NavRow({
  item,
  activeId,
  onSelect,
  level,
  expanded,
  openIds,
  onToggle
}: {
  item: NavItemData;
  activeId: string;
  onSelect: (id: string) => void;
  level: number;
  expanded: boolean;
  openIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const isActive = activeId === item.id;
  const hasChildren = Boolean(item.children?.length);
  // A child being active is the reason a group is open, whether or not it was clicked.
  const isOpen = openIds.has(item.id) || Boolean(item.children?.some((c) => c.id === activeId));
  const Icon = item.icon;

  return (
    <div className="flex w-full flex-col">
      <button
        type="button"
        onClick={() => (hasChildren ? onToggle(item.id) : onSelect(item.id))}
        aria-current={isActive ? 'page' : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
        title={expanded ? undefined : item.title}
        className={cn(
          'group relative flex w-full items-center justify-between rounded-md py-[7px] pr-2 text-left transition-colors select-none',
          isActive
            ? 'bg-accent text-foreground font-medium'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground/90'
        )}
        style={{ paddingLeft: `${level * 12 + 10}px` }}
      >
        {/* A collapsed rail has no room for a label, so the active row needs another way
            to say which one it is. */}
        {isActive ? (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary" />
        ) : null}

        <span className="flex min-w-0 items-center gap-2.5">
          <Icon
            className={cn(
              'size-4 shrink-0 transition-colors',
              isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground/70'
            )}
            strokeWidth={1.5}
          />
          <span
            className={cn(
              'truncate text-[13px] tracking-wide transition-[opacity,max-width] duration-200',
              expanded ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'
            )}
          >
            {item.title}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {item.shortcut && expanded ? (
            <kbd className="hidden h-5 items-center justify-center rounded border border-border/60 bg-background/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70 group-hover:inline-flex">
              {item.shortcut}
            </kbd>
          ) : null}

          {/* The count is the reason to look at the rail, so it survives collapsing —
              as a dot over the icon when there is no room for a number. */}
          {item.badge ? (
            <span
              className={cn(
                'grid place-items-center rounded-full bg-primary/15 text-[10px] font-semibold text-primary',
                expanded
                  ? 'h-5 min-w-5 px-1.5'
                  : 'absolute left-[22px] top-[3px] size-[15px] min-w-0 px-0 text-[9px]'
              )}
            >
              {typeof item.badge === 'number' && item.badge > 99 ? '99+' : item.badge}
            </span>
          ) : null}

          {hasChildren && expanded ? (
            <ChevronRight
              className={cn(
                'size-3.5 text-muted-foreground/50 transition-transform duration-200',
                isOpen && 'rotate-90'
              )}
              strokeWidth={2}
            />
          ) : null}
        </span>
      </button>

      {hasChildren ? (
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-in-out',
            isOpen && expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
          )}
        >
          <div className="relative mt-0.5 flex min-h-0 flex-col gap-0.5 overflow-hidden">
            <div
              className="absolute bottom-0 top-0 border-l border-border/60"
              style={{ left: `${level * 12 + 18}px` }}
            />
            {item.children!.map((child) => (
              <NavRow
                key={child.id}
                item={child}
                activeId={activeId}
                onSelect={onSelect}
                level={level + 1}
                expanded={expanded}
                openIds={openIds}
                onToggle={onToggle}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ the rail itself */

export function DashboardSidebar({
  groups,
  bottom = [],
  activeId,
  onSelect,
  open,
  setOpen,
  brand,
  subtitle,
  menuLabel,
  onSearch
}: {
  groups: NavGroupData[];
  bottom?: NavItemData[];
  activeId: string;
  onSelect: (id: string) => void;
  open: boolean;
  setOpen: (open: boolean | ((value: boolean) => boolean)) => void;
  brand: string;
  subtitle: string;
  menuLabel: string;
  onSearch?: () => void;
}) {
  const wide = useMediaQuery('(min-width: 768px)');
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Escape closes it. On a phone the open rail covers the page, so there has to be a way
  // out that is not "find the small button again".
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const width = open ? EXPANDED : RAIL;
  // On a phone the gutter stays at rail width whatever the rail is doing, so opening it
  // does not reflow the page underneath and lose the reader's place.
  const gutter = wide ? width : RAIL;

  return (
    <>
      <div
        aria-hidden
        className="shrink-0 transition-[width] duration-300 ease-in-out"
        style={{ width: gutter }}
      />

      {/* Touch only: tapping beside the open rail closes it. */}
      {open && !wide ? (
        <button
          type="button"
          aria-label={menuLabel}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-[2px] animate-in fade-in duration-200"
        />
      ) : null}

      <aside
        className="fixed inset-y-0 left-0 z-50 flex flex-col overflow-x-hidden border-r border-border/60 bg-card p-2.5 transition-[width] duration-300 ease-in-out"
        style={{ width }}
      >
        {/* The switcher's shape, with the truth in it: one event, one database. */}
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
          <button
            type="button"
            aria-label={menuLabel}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {open ? <X className="size-[18px]" strokeWidth={1.5} /> : <Menu className="size-[18px]" strokeWidth={1.5} />}
          </button>

          <div
            className={cn(
              'flex min-w-0 flex-col transition-opacity duration-200',
              open ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
          >
            <span className="mb-0.5 truncate text-[13px] font-medium leading-none text-foreground">
              {brand}
            </span>
            <span className="truncate text-[11px] leading-none text-muted-foreground">{subtitle}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden">
          {groups.map((group, index) => (
            <div key={group.heading || index} className="flex flex-col gap-0.5">
              {group.heading ? (
                <span
                  className={cn(
                    'mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/50 transition-opacity duration-200',
                    open ? 'opacity-100' : 'opacity-0'
                  )}
                >
                  {group.heading}
                </span>
              ) : null}
              {group.items.map((item) => (
                <NavRow
                  key={item.id}
                  item={item}
                  activeId={activeId}
                  onSelect={(id) => {
                    if (id === 'search' && onSearch) {
                      onSearch();
                      return;
                    }
                    onSelect(id);
                    if (!wide) setOpen(false);
                  }}
                  level={0}
                  expanded={open}
                  openIds={openIds}
                  onToggle={toggle}
                />
              ))}
            </div>
          ))}
        </div>

        {bottom.length ? (
          <div className="mt-auto flex flex-col gap-0.5 border-t border-border/60 pt-3">
            {bottom.map((item) => (
              <NavRow
                key={item.id}
                item={item}
                activeId={activeId}
                onSelect={(id) => {
                  onSelect(id);
                  if (!wide) setOpen(false);
                }}
                level={0}
                expanded={open}
                openIds={openIds}
                onToggle={toggle}
              />
            ))}
          </div>
        ) : null}
      </aside>
    </>
  );
}

/* ------------------------------------------------------------ command palette */

/**
 * Cmd+K, and the reason it is worth having here.
 *
 * The panel has seven screens, which is one more than fits comfortably in a glance on a
 * phone. Typing two letters is faster than opening the rail, reading it and pressing the
 * right row — and on a phone it avoids the rail covering the thing you were looking at.
 *
 * It searches nothing but the navigation. A palette that searches participants would need
 * to know about the roster, and this component has no business knowing that.
 */
export function CommandPalette({
  items,
  open,
  onClose,
  onSelect,
  placeholder,
  emptyLabel
}: {
  items: NavItemData[];
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  placeholder: string;
  emptyLabel: string;
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    // A frame's delay: the input does not exist until this render is committed.
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const usable = items.filter((item) => item.id !== 'search');
    if (!needle) return usable;
    return usable.filter((item) => item.title.toLowerCase().includes(needle));
  }, [items, query]);

  useEffect(() => {
    if (cursor >= results.length) setCursor(0);
  }, [results.length, cursor]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((value) => (value + 1) % Math.max(results.length, 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((value) => (value - 1 + results.length) % Math.max(results.length, 1));
      return;
    }
    if (event.key === 'Enter') {
      const picked = results[cursor];
      if (picked) {
        onSelect(picked.id);
        onClose();
      }
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[14vh]">
      <button
        type="button"
        aria-label={emptyLabel}
        onClick={onClose}
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="flex items-center border-b border-border/60 px-4">
          <Search className="mr-3 size-[18px] shrink-0 text-muted-foreground/70" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-4 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          <button
            type="button"
            onClick={onClose}
            className="ml-2 hidden h-5 items-center justify-center rounded border border-border/60 bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground sm:inline-flex"
          >
            ESC
          </button>
        </div>

        {results.length ? (
          <ul className="max-h-72 overflow-y-auto p-1.5">
            {results.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => {
                      onSelect(item.id);
                      onClose();
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-colors',
                      index === cursor ? 'bg-accent text-foreground' : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.5} />
                    <span className="truncate">{item.title}</span>
                    {item.badge ? (
                      <span className="ml-auto text-[11px] font-semibold text-primary">{item.badge}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="flex flex-col items-center justify-center py-10">
            <Command className="mb-2 size-6 text-muted-foreground/30" strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-muted-foreground">{emptyLabel}</p>
          </div>
        )}
      </div>
    </div>
  );
}
