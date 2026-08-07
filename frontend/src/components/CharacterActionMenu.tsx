import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 200;
const MENU_ESTIMATED_HEIGHT = 120;

interface CharacterActionMenuProps {
  playerName: string;
  open: boolean;
  anchor: DOMRect | null;
  onTalk: () => void;
  onCancel: () => void;
}

function computePosition(anchor: DOMRect, menuHeight: number) {
  const margin = 8;
  let top = anchor.top - menuHeight - margin;
  let left = anchor.left + anchor.width / 2 - MENU_WIDTH / 2;

  // Prefer above the character; if no room, place below
  if (top < margin) {
    top = anchor.bottom + margin;
  }

  // If still overflows bottom, clamp into viewport
  if (top + menuHeight > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - menuHeight - margin);
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - MENU_WIDTH - margin));

  return { top, left };
}

export function CharacterActionMenu({
  playerName,
  open,
  anchor,
  onTalk,
  onCancel,
}: CharacterActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    if (!anchor) return;
    const height = menuRef.current?.offsetHeight ?? MENU_ESTIMATED_HEIGHT;
    setPosition(computePosition(anchor, height));
  };

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    updatePosition();
  }, [open, anchor, playerName]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      onCancel();
    };

    const onReposition = () => updatePosition();

    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, onCancel, anchor]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && anchor && (
        <motion.div
          ref={menuRef}
          role="dialog"
          aria-label={`Действия: ${playerName}`}
          initial={{ opacity: 0, y: 4, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 2, scale: 0.98 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-auto fixed z-[90] overflow-hidden rounded-xl border border-white/10 bg-black/80 p-3 shadow-[0_16px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl"
          style={{
            top: position.top,
            left: position.left,
            width: MENU_WIDTH,
          }}
        >
          <p className="mb-3 truncate px-1 text-center font-display text-sm font-semibold text-bunker-text">
            {playerName}
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={onTalk}
              className="rounded border border-bunker-neon/40 bg-black/70 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-bunker-neon transition hover:border-bunker-neon hover:bg-bunker-neon/15"
            >
              Пообщаться
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="rounded border border-bunker-border/80 bg-black/70 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-bunker-muted transition hover:border-bunker-neon/40 hover:text-bunker-neon"
            >
              Отмена
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
