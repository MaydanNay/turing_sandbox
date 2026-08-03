import { AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';

import type { VoteBarPlayer, VoteBarStatusKind } from '@/types/roundTablePhase';

import { PlayerProfilePopover } from './PlayerProfilePopover';

const STATUS_STYLES: Record<
  VoteBarStatusKind,
  { badge: string; ring: string }
> = {
  voting: {
    badge: 'border-bunker-neon/50 bg-bunker-neon/15 text-bunker-neon',
    ring: 'ring-bunker-neon/40',
  },
  evicted: {
    badge: 'border-bunker-danger/50 bg-bunker-danger/15 text-bunker-danger',
    ring: 'ring-bunker-danger/30',
  },
  votes: {
    badge: 'border-bunker-amber/50 bg-bunker-amber/15 text-bunker-amber',
    ring: 'ring-bunker-amber/30',
  },
  idle: {
    badge: 'border-bunker-border/70 bg-black/40 text-bunker-muted',
    ring: 'ring-bunker-border/30',
  },
};

interface PlayerVoteCardProps {
  player: VoteBarPlayer;
  isSelected: boolean;
  onSelect: (playerId: string) => void;
}

function PlayerVoteCard({ player, isSelected, onSelect }: PlayerVoteCardProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const styles = STATUS_STYLES[player.statusKind];
  const dimmed = player.statusKind === 'evicted';

  return (
    <div className="relative flex w-[72px] flex-col items-center gap-1.5">
      <button
        ref={anchorRef}
        type="button"
        onClick={() => onSelect(player.id)}
        className={`flex w-full flex-col items-center gap-1.5 rounded-lg p-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-bunker-neon/50 ${
          isSelected ? 'bg-bunker-neon/10 ring-1 ring-bunker-neon/40' : 'hover:bg-white/5'
        } ${dimmed ? 'opacity-50 grayscale' : ''}`}
        aria-label={`Профиль игрока ${player.name}`}
        aria-expanded={isSelected}
      >
        <div
          className={`relative h-14 w-14 overflow-hidden rounded-md border border-bunker-border/80 ring-1 ${styles.ring}`}
          style={{ background: player.portraitColor }}
        >
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold text-white/90 drop-shadow-md">
            {player.name.charAt(0)}
          </span>
        </div>
        <span className="max-w-full truncate font-display text-[11px] font-medium text-bunker-text">
          {player.name}
        </span>
        <span
          className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${styles.badge}`}
        >
          {player.statusLabel}
        </span>
      </button>

      <AnimatePresence>
        {isSelected && player.statusKind !== 'evicted' && (
          <PlayerProfilePopover
            key={player.id}
            player={player}
            anchorRef={anchorRef}
            onClose={() => onSelect(player.id)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface TopBarProps {
  players: VoteBarPlayer[];
  selectedPlayerId?: string | null;
  onSelectPlayer?: (playerId: string | null) => void;
}

/** Верхняя панель статусов игроков (голосование) */
export function TopBar({ players, selectedPlayerId = null, onSelectPlayer }: TopBarProps) {
  const [internalSelected, setInternalSelected] = useState<string | null>(null);
  const activeId = onSelectPlayer ? selectedPlayerId : internalSelected;

  const handleSelect = (playerId: string) => {
    const next = activeId === playerId ? null : playerId;
    if (onSelectPlayer) {
      onSelectPlayer(next);
    } else {
      setInternalSelected(next);
    }
  };

  return (
    <div
      className={`pointer-events-auto absolute top-4 left-1/2 -translate-x-1/2 ${
        activeId ? 'z-[55]' : 'z-[48]'
      }`}
    >
      <div className="flex items-end gap-4 overflow-visible rounded-xl border border-bunker-border/60 bg-black/50 px-4 py-3 backdrop-blur-md">
        {players.map((player) => (
          <PlayerVoteCard
            key={player.id}
            player={player}
            isSelected={activeId === player.id}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
