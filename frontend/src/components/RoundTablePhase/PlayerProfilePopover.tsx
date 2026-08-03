import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PublicCardSlot, VoteBarPlayer } from '@/types/roundTablePhase';

const POPOVER_WIDTH = 168;
const POPOVER_ESTIMATED_HEIGHT = 118;

const DEFAULT_SLOTS: PublicCardSlot[] = Array.from({ length: 6 }, (_, i) => ({
  id: `slot-${i}`,
  isRevealed: false,
}));

function shortCardName(label?: string): string {
  if (!label) return '—';
  const part = label.split(':').pop()?.trim();
  return part?.split(/\s+/)[0] ?? label;
}

function cardStyle(label?: string): { border: string; text: string } {
  const text = (label ?? '').toLowerCase();
  if (text.includes('навык')) return { border: 'border-emerald-400/70', text: 'text-emerald-300' };
  if (text.includes('биометр')) return { border: 'border-red-400/70', text: 'text-red-300' };
  if (text.includes('инвентар')) return { border: 'border-blue-400/70', text: 'text-blue-300' };
  if (text.includes('фактор') || text.includes('черт'))
    return { border: 'border-purple-400/70', text: 'text-purple-300' };
  if (text.includes('миссия') || text.includes('протокол'))
    return { border: 'border-amber-400/70', text: 'text-amber-300' };
  if (text.includes('персонаж')) return { border: 'border-bunker-neon/70', text: 'text-bunker-neon' };
  return { border: 'border-bunker-neon/50', text: 'text-bunker-neon' };
}

function MiniCard({ slot }: { slot: PublicCardSlot }) {
  if (!slot.isRevealed) {
    return (
      <div className="flex h-7 items-center justify-center rounded bg-neutral-800/90">
        <Lock className="h-2.5 w-2.5 text-neutral-500" strokeWidth={2} />
      </div>
    );
  }

  const style = cardStyle(slot.label);

  return (
    <div
      className={`flex h-7 items-center justify-center rounded border bg-black/40 px-0.5 ${style.border}`}
    >
      <span className={`truncate px-1 text-xs font-medium ${style.text}`}>
        {shortCardName(slot.label)}
      </span>
    </div>
  );
}

interface PlayerProfilePopoverProps {
  player: VoteBarPlayer;
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}

function computePosition(anchor: HTMLElement, popoverHeight: number) {
  const rect = anchor.getBoundingClientRect();
  const margin = 6;

  let top = rect.bottom + margin;
  let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;

  if (top + popoverHeight > window.innerHeight - margin) {
    top = rect.top - popoverHeight - margin;
  }

  left = Math.max(margin, Math.min(left, window.innerWidth - POPOVER_WIDTH - margin));

  return { top, left };
}

export function PlayerProfilePopover({
  player,
  anchorRef,
  onClose,
}: PlayerProfilePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const updatePosition = () => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const height = popoverRef.current?.offsetHeight ?? POPOVER_ESTIMATED_HEIGHT;
    setPosition(computePosition(anchor, height));
  };

  useLayoutEffect(() => {
    updatePosition();
  }, [anchorRef, player.id]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };

    const handleReposition = () => updatePosition();

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [anchorRef, onClose]);

  const slots = player.revealedCards ?? DEFAULT_SLOTS;

  return createPortal(
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -2, scale: 0.98 }}
      transition={{ duration: 0.15 }}
      className="fixed rounded-xl border border-white/10 bg-black/80 p-3 backdrop-blur-xl"
      style={{
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        zIndex: 100,
      }}
      role="dialog"
      aria-label={`Карты игрока ${player.name}`}
    >
      <p className="mb-2 truncate font-mono text-[9px] uppercase tracking-widest text-bunker-muted">
        {player.name}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {slots.map((slot) => (
          <MiniCard key={slot.id} slot={slot} />
        ))}
      </div>
    </motion.div>,
    document.body,
  );
}
