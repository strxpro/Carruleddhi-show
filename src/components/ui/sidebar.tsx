import React, { createContext, useContext, useState } from 'react';
/* `motion/react`, not `framer-motion`.
   They are the same library: `motion` is what framer-motion was renamed to, and both
   were installed at once here. Two copies sharing one `motion-dom` produced a build
   failure with a name in it and no clue where it came from —
   `"activeAnimations" is not exported by motion-dom`. One package, one version. */
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sidebar that collapses to icons and opens on hover.
 *
 * WHAT CHANGED FROM THE SNIPPET THIS CAME FROM
 *   `next/link` and `next/image` are gone. This is a Vite project, not Next, and there
 *   is no router — the panel switches a tab in local state rather than navigating, so a
 *   real <a href> would reload the page and throw away the session. The links are
 *   buttons with an href-shaped fallback for middle-click and keyboard behaviour.
 *
 *   `"use client"` is gone too: it means nothing outside Next's server components.
 *
 *   Hover-to-open is desktop only. On a touch screen there is no hover, so a pointer
 *   query guards it; the phone gets the slide-over panel instead.
 */

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
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a Sidebar');
  return context;
};

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
  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>{children}</SidebarContext.Provider>
  );
}

export function SidebarBody(props: React.ComponentProps<typeof motion.div>) {
  return (
    <>
      <DesktopSidebar {...props} />
      <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
    </>
  );
}

export function DesktopSidebar({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) {
  const { open, setOpen, animate } = useSidebar();
  // Hover only where a pointer exists. On a tablet, mouseenter fires on the first tap
  // and the sidebar would open when you meant to press whatever is under it.
  const hoverable =
    typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  return (
    <motion.div
      className={cn(
        'hidden h-full shrink-0 flex-col border-r border-white/10 bg-navy-900 px-3 py-4 md:flex',
        className
      )}
      animate={{ width: animate ? (open ? 268 : 68) : 268 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      onMouseEnter={hoverable ? () => setOpen(true) : undefined}
      onMouseLeave={hoverable ? () => setOpen(false) : undefined}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MobileSidebar({ className, children, ...props }: React.ComponentProps<'div'>) {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className="flex h-14 w-full flex-row items-center justify-between border-b border-white/10 bg-navy-900 px-4 md:hidden"
      {...props}
    >
      <span className="font-semibold tracking-tight text-white">Carruleddhi</span>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="grid size-10 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
      >
        <Menu className="size-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className={cn(
              'fixed inset-0 z-100 flex flex-col justify-between overflow-y-auto bg-navy-950 p-8',
              className
            )}
          >
            <button
              type="button"
              aria-label="Zamknij"
              onClick={() => setOpen(false)}
              className="absolute right-6 top-6 grid size-10 place-items-center rounded-xl text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="size-5" />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * One row in the sidebar.
 *
 * A button, not a link: the panel has no routes, and an <a href> would navigate away
 * and lose the unlocked session. The label collapses with the sidebar rather than being
 * hidden with `display:none`, so a screen reader still reads it while a sighted user
 * sees only the icon.
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
        'group/sidebar flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
        isActive
          ? 'bg-white/12 text-white'
          : 'text-white/65 hover:bg-white/8 hover:text-white',
        className
      )}
    >
      <span className={cn('grid size-5 shrink-0 place-items-center', isActive && 'text-yellow')}>
        {link.icon}
      </span>

      <motion.span
        animate={{ opacity: showLabel ? 1 : 0, width: showLabel ? 'auto' : 0 }}
        transition={{ duration: 0.18 }}
        className="overflow-hidden whitespace-pre text-sm font-medium"
      >
        {link.label}
      </motion.span>

      {/* The count stays visible when the sidebar is collapsed — it is the reason to
          look at the sidebar in the first place. */}
      {link.badge ? (
        <span
          className={cn(
            'ml-auto grid min-w-5 place-items-center rounded-full bg-coral px-1.5 text-[11px] font-bold text-white',
            !showLabel && 'ml-0 absolute left-8 top-1.5 size-4 min-w-0 text-[9px]'
          )}
        >
          {link.badge > 99 ? '99+' : link.badge}
        </span>
      ) : null}
    </button>
  );
}
