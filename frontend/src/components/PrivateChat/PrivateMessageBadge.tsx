import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

interface PrivateMessageBadgeProps {
  count: number;
  /** chibi на локации / сидящий за столом */
  variant?: 'chibi' | 'seated';
}

const GAP_PX: Record<'chibi' | 'seated', number> = {
  chibi: 8,
  seated: 10,
};

/** Иконка над головой — якорь по верхнему краю спрайта (bottom: 100%) */
export function PrivateMessageBadge({ count, variant = 'chibi' }: PrivateMessageBadgeProps) {
  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="badge"
          initial={{ scale: 0.5, opacity: 0, y: 6 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.5, opacity: 0, y: 6 }}
          transition={{ type: 'spring', stiffness: 460, damping: 22 }}
          className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2"
          style={{ bottom: '100%', marginBottom: GAP_PX[variant] }}
          aria-label={`Непрочитанных сообщений: ${count}`}
        >
          <div className="relative">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-50 bg-amber-300 shadow-[0_0_16px_rgba(251,191,36,0.85)] sm:h-7 sm:w-7"
            >
              <MessageCircle className="h-3 w-3 text-amber-950 sm:h-3.5 sm:w-3.5" strokeWidth={2.5} />
            </motion.div>

            {count > 1 && (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white shadow-md">
                {count > 9 ? '9+' : count}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
