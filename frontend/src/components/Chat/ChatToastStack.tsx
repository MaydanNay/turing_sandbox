import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import { useChatNotificationStore } from '@/store/chatNotificationStore';

interface ChatToastStackProps {
  onOpenPrivateChat?: (playerId: string) => void;
  onOpenGeneralChat?: () => void;
}

function ChatToastContent({
  onOpenPrivateChat,
  onOpenGeneralChat,
}: ChatToastStackProps) {
  const items = useChatNotificationStore((s) => s.items);
  const dismiss = useChatNotificationStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[min(92vw,360px)] flex-col gap-2 sm:right-6 sm:top-6">
      <AnimatePresence mode="popLayout">
        {items.map((item) => (
          <motion.button
            key={item.id}
            type="button"
            layout
            initial={{ opacity: 0, x: 28, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 28, scale: 0.94 }}
            transition={{ duration: 0.24 }}
            onClick={() => {
              if (item.kind === 'private' && item.playerId) {
                onOpenPrivateChat?.(item.playerId);
              } else if (item.kind === 'general') {
                onOpenGeneralChat?.();
              }
              dismiss(item.id);
            }}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-2xl border border-amber-300/25 bg-neutral-900/95 px-4 py-3 text-left shadow-[0_12px_40px_rgba(0,0,0,0.55)] backdrop-blur-md transition hover:border-amber-300/45 hover:bg-neutral-900"
          >
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300/20 text-amber-200">
              <MessageCircle className="h-4 w-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-sm font-semibold text-white">
                {item.kind === 'private' ? `Кулуары · ${item.title}` : item.title}
              </p>
              <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/75">{item.body}</p>
            </div>

            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                dismiss(item.id);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  dismiss(item.id);
                }
              }}
              className="shrink-0 rounded-md p-1 text-white/45 transition hover:bg-white/10 hover:text-white"
              aria-label="Закрыть уведомление"
            >
              <X className="h-4 w-4" />
            </span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ChatToastStack(props: ChatToastStackProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<ChatToastContent {...props} />, document.body);
}
