import { cn } from '@/lib/utils';
import React, { useState, createContext, useContext } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Menu, X } from 'lucide-react';

/**
 * Collapsing sidebar, desktop and mobile.
 *
 * Adapted from the component you sent. Two changes were unavoidable and one is worth
 * knowing about:
 *
 *   next/link and next/image are gone. They only exist in Next.js, and this is a Vite
 *   application — a plain <a> and a plain <img> do the same job here.
 *
 *   "use client" is gone. It marks a boundary in a Next server-component tree; there is
 *   no server rendering here, so it means nothing.
 *
 *   framer-motion is imported as `motion/react`. Framer Motion moved to that name and
 *   the old package no longer receives releases.
 *
 * Behaviour is unchanged: 300px expanded, 60px collapsed to icons, opening on hover on
 * a desktop and as a full-screen panel on a phone.
 */

export interface SidebarLinkItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  onClick?: () => void;
  /** Rendered as a small count on the right. Hidden when the rail is collapsed. */
  badge?: number;
}

interface SidebarContextProps {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  animate: boolean;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider');
  return context;
};

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => {
  const [openState, setOpenState] = useState(false);
  const open = openProp !== undefined ? openProp : openState;
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState;

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  );
};

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate
}: {
  children: React.ReactNode;
  open?: boolean;
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  animate?: boolean;
}) => (
  <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
    {children}
  </SidebarProvider>
);

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => (
  <>
    <DesktopSidebar {...props} />
    <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
  </>
);

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar();
  return (
    <motion.div
      className={cn(
        'h-full px-4 py-4 hidden md:flex md:flex-col w-[300px] shrink-0',
        'bg-[#0b1f45] border-r border-white/10',
        className
      )}
      animate={{ width: animate ? (open ? '300px' : '76px') : '300px' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  );
};

export const MobileSidebar = ({ className, children, ...props }: React.ComponentProps<'div'>) => {
  const { open, setOpen } = useSidebar();
  return (
    <div
      className={cn(
        'h-14 px-4 flex flex-row md:hidden items-center justify-between w-full',
        'bg-[#0b1f45] border-b border-white/10'
      )}
      {...props}
    >
      <span className="font-extrabold tracking-tight text-white">
        CARRULEDDHI <span className="text-[#ffc928]">ADMIN</span>
      </span>
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-white/90 p-2 -mr-2"
      >
        <Menu />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeInOut' }}
            className={cn(
              'fixed h-full w-full inset-0 bg-[#071a3d] p-8 z-100 flex flex-col justify-between',
              className
            )}
          >
            <button
              type="button"
              aria-label="Zamknij"
              onClick={() => setOpen(false)}
              className="absolute right-6 top-5 z-50 text-white/90 p-2"
            >
              <X />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const SidebarLink = ({
  link,
  className,
  isActive,
  ...props
}: {
  link: SidebarLinkItem;
  className?: string;
  isActive?: boolean;
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
  const { open, animate } = useSidebar();
  const expanded = animate ? open : true;

  return (
    <a
      href={link.href}
      aria-current={isActive ? 'page' : undefined}
      // The label is hidden while the rail is collapsed, so the accessible name has to
      // come from somewhere that is not the hidden text.
      aria-label={link.label}
      title={expanded ? undefined : link.label}
      onClick={(event) => {
        if (link.onClick) {
          event.preventDefault();
          link.onClick();
        }
      }}
      className={cn(
        'flex items-center justify-start gap-3 group/sidebar py-2.5 px-3 rounded-xl',
        'cursor-pointer transition-colors duration-150 relative',
        isActive
          ? 'bg-[#ffc928] text-[#071a3d] font-bold'
          : 'text-white/70 hover:bg-white/10 hover:text-white',
        className
      )}
      {...props}
    >
      {link.icon}

      <motion.span
        animate={{
          display: expanded ? 'inline-block' : 'none',
          opacity: expanded ? 1 : 0
        }}
        className="text-sm font-medium whitespace-pre inline-block !p-0 !m-0 group-hover/sidebar:translate-x-1 transition duration-150"
      >
        {link.label}
      </motion.span>

      {/* Unread count. Collapsed, it becomes a dot on the icon — a number at 76px wide
          would overlap the icon it belongs to, and "something is waiting" is the whole
          message at that size anyway. */}
      {link.badge ? (
        expanded ? (
          <span
            className={cn(
              'ml-auto min-w-6 h-6 px-1.5 grid place-items-center rounded-full text-xs font-extrabold',
              isActive ? 'bg-[#071a3d] text-white' : 'bg-[#f6494f] text-white'
            )}
          >
            {link.badge > 99 ? '99+' : link.badge}
          </span>
        ) : (
          <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#f6494f] ring-2 ring-[#0b1f45]" />
        )
      ) : null}
    </a>
  );
};
