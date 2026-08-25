import React, { createContext, useContext, useEffect, useState } from 'react';
/* `motion/react`, not `framer-motion`.
   They are the same library: `motion` is what framer-motion was renamed to, and both
   were installed at once here. Two copies sharing one `motion-dom` produced a build
   failure with a name in it and no clue where it came from —
   `"activeAnimations" is not exported by motion-dom`. One package, one version. */
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The panel's navigation rail.
 *
 * WHAT CHANGED, AND WHY
 *   It used to be two separate things: an icon rail on desktop (`hidden md:flex`) and,
 *   on a phone, a 56px top bar with a hamburger that opened a full-screen sheet. So on
 *   a phone there was no rail at all — no icons, nothing to orient by, and the only way
 *   to see where you were was to open a sheet that covered the page you were reading.
 *
 *   Now there is one rail at every width. It is 64px of icons by default and widens to
 *   264px when opened. On a wide screen the content moves over to make room; on a phone
 *   the open rail slides over the content with a scrim behind it, because taking 264 of
 *   390 available pixels away from the page is not a trade worth making.
 *
 *   Opening it: hover on a device that has a pointer, and the button at the top of the
 *   rail everywhere. The button is the part that was missing — hover does not exist on
 *   a touch screen, so without it the rail could never be widened by hand.
 *
 * WHAT CHANGED FROM THE SNIPPET THIS CAME FROM
 *   `next/link`, `next/image` and `"use client"` are gone: this is Vite, not Next, and
 *   the panel switches a tab in local state rather than navigating. A real <a href>
 *   would reload the page and throw the unlocked session away.
 */

const RAIL = 64;
const EXPANDED = 264;
const EASE = [0.22, 1, 0.36, 1] as const;

export interface SidebarLinkItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  /** Shown as a count beside the label. Zero renders nothing. */
  badge?: number;
}

interface SidebarContextValue {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
  wide: boolean;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a Sidebar');
  return context;
};

/**
 * A live media query.
 *
 * Read once at render and then kept in step with a listener, because the answer changes
 * when a phone is turned sideways and a rail that decided its behaviour at mount would
 * be wrong for the rest of the session.
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

export function Sidebar({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;
  const wide = useMediaQuery('(min-width: 768px)');

  // Escape closes it. On a phone the open rail covers the page, so there has to be a
  // way out that is not "find the small button again".
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate, wide }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function SidebarBody({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  const { open, setOpen, animate, wide } = useSidebar();

  const width = animate && !open ? RAIL : EXPANDED;
  // The column of layout space the page flows beside. On a phone it stays at rail
  // width whatever the rail is doing, so opening the rail does not reflow the page
  // underneath it and lose the reader's place.
  const gutter = wide ? width : RAIL;

  return (
    <>
      <motion.div
        aria-hidden
        className="shrink-0"
        animate={{ width: gutter }}
        initial={false}
        transition={{ duration: 0.25, ease: EASE }}
      />

      {/* Touch only: tapping beside the open rail closes it. */}
      <AnimatePresence>
        {open && !wide ? (
          <motion.button
            type="button"
            aria-label="Zamknij menu"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-navy-950/70 backdrop-blur-[2px]"
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col overflow-x-hidden border-r border-white/10 bg-navy-900 px-2.5 py-3',
          className
        )}
        animate={{ width }}
        initial={false}
        transition={{ duration: 0.25, ease: EASE }}
        // Hover only where a pointer exists. On a tablet, mouseenter fires on the first
        // tap and the rail would open when you meant to press what is under it.
        onMouseEnter={wide ? () => setOpen(true) : undefined}
        onMouseLeave={wide ? () => setOpen(false) : undefined}
        {...props}
      >
        {children}
      </motion.aside>
    </>
  );
}

/**
 * The rail's own open/close button.
 *
 * Three lines and a hard requirement: on a touch screen it is the only way to widen the
 * rail, because hover is not a thing there. Kept at the top so it is inside thumb reach
 * on a phone held in one hand.
 */
export function SidebarToggle({ label }: { label: string }) {
  const { open, setOpen } = useSidebar();
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      className="grid size-9 shrink-0 place-items-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
    >
      {open ? <X className="size-5" /> : <Menu className="size-5" />}
    </button>
  );
}

/**
 * One row in the rail.
 *
 * A button, not a link: the panel has no routes, and an <a href> would navigate away and
 * lose the unlocked session. The label is animated to zero width rather than removed, so
 * a screen reader still reads it while a sighted user sees only the icon.
 */
export function SidebarLink({
  link,
  isActive,
  onSelect,
  className
}: {
  link: SidebarLinkItem;
  isActive?: boolean;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const { open, animate } = useSidebar();
  const showLabel = animate ? open : true;
  return (
    <button
      type="button"
      onClick={() => onSelect(link.id)}
      aria-current={isActive ? 'page' : undefined}
      title={showLabel ? undefined : link.label}
      className={cn(
        'group/sidebar relative flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors',
        isActive ? 'bg-white/12 text-white' : 'text-white/65 hover:bg-white/8 hover:text-white',
        className
      )}
    >
      {/* A collapsed rail has no room for a label, so the active row needs another way
          to say which one it is. */}
      {isActive ? (
        <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r bg-yellow" />
      ) : null}

      <span className={cn('grid size-5 shrink-0 place-items-center', isActive && 'text-yellow')}>
        {link.icon}
      </span>

      <motion.span
        animate={{ opacity: showLabel ? 1 : 0, width: showLabel ? 'auto' : 0 }}
        initial={false}
        transition={{ duration: 0.18 }}
        className="overflow-hidden whitespace-pre text-sm font-medium"
      >
        {link.label}
      </motion.span>

      {/* The count stays visible when the rail is collapsed — it is the reason to look
          at the rail in the first place. */}
      {link.badge ? (
        <span
          className={cn(
            'grid min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white',
            showLabel ? 'ml-auto' : 'absolute left-6 top-1 size-4 min-w-0 px-0 text-[9px]'
          )}
        >
          {link.badge > 99 ? '99+' : link.badge}
        </span>
      ) : null}
    </button>
  );
}
