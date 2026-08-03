import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface PanelOverlayProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  side?: 'right' | 'bottom';
}

export function PanelOverlay({
  open,
  title,
  onClose,
  children,
  side = 'right',
}: PanelOverlayProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть"
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label={title}
            className={`fixed z-50 flex flex-col border border-bunker-border bg-bunker-panel/95 shadow-2xl backdrop-blur-md ${
              side === 'right'
                ? 'bottom-0 right-0 top-0 w-full max-w-md border-l'
                : 'bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl border-t'
            }`}
            initial={side === 'right' ? { x: '100%' } : { y: '100%' }}
            animate={side === 'right' ? { x: 0 } : { y: 0 }}
            exit={side === 'right' ? { x: '100%' } : { y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            <div className="flex items-center justify-between border-b border-bunker-border px-4 py-3">
              <h2 className="font-mono text-xs uppercase tracking-widest text-bunker-neon">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-bunker-muted transition hover:bg-bunker-border/40 hover:text-bunker-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface HudFabProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  badge?: number;
}

export function HudFab({ label, icon, onClick, active = false, badge }: HudFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`relative flex h-12 w-12 items-center justify-center rounded-full border backdrop-blur-md transition ${
        active
          ? 'border-bunker-neon bg-bunker-neon/20 text-bunker-neon shadow-neon'
          : 'border-bunker-border/80 bg-black/50 text-bunker-text hover:border-bunker-neon/50 hover:text-bunker-neon'
      }`}
    >
      {icon}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bunker-danger px-1 text-[9px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
