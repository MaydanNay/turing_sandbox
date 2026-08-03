import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import { MOCK_HUD_PLAYERS, type HudPlayerSlot, type PlayerHudStatus } from '@/data/mockHud';

function StatusBadge({ status }: { status: PlayerHudStatus }) {
  const base =
    'absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full';

  if (status === 'alive') {
    return (
      <span className={`${base} bg-emerald-600`}>
        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  if (status === 'dead') {
    return (
      <span className={`${base} bg-red-600`}>
        <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className={`${base} bg-orange-500`}>
      <AlertTriangle className="h-2.5 w-2.5 text-black" strokeWidth={2.5} />
    </span>
  );
}

interface PlayerVoteCardProps {
  player: HudPlayerSlot;
  isSelf?: boolean;
  isSelected?: boolean;
  onClick?: (id: string) => void;
}

function PlayerVoteCard({ player, isSelf, isSelected, onClick }: PlayerVoteCardProps) {
  const highlight = player.isActive || isSelf || isSelected;
  const [portraitSrc, setPortraitSrc] = useState(() =>
    hasCharacterCard(player.id)
      ? ASSETS.cards.character(player.id)
      : ASSETS.characters.chibi(player.id),
  );

  return (
    <button
      type="button"
      onClick={() => onClick?.(player.id)}
      className={`pointer-events-auto flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 transition focus:outline-none hover:opacity-90 sm:gap-1 sm:px-1 ${
        highlight ? 'opacity-100' : 'opacity-85'
      } ${player.status === 'dead' ? 'opacity-40 grayscale' : ''}`}
    >
      <div className="relative">
        <div className="h-11 w-11 overflow-hidden rounded-full bg-neutral-950 sm:h-12 sm:w-12">
          <img
            src={portraitSrc}
            alt=""
            className="h-full w-full object-cover object-top"
            draggable={false}
            onError={() => setPortraitSrc(ASSETS.characters.chibi(player.id))}
          />
        </div>
        <StatusBadge status={player.status} />
      </div>
      <span className="w-full truncate text-center font-mono text-[8px] uppercase tracking-wide text-neutral-200 sm:text-[9px]">
        {player.name}
      </span>
      <span className="hidden w-full truncate text-center font-mono text-[7px] uppercase tracking-wider text-yellow-500/70 sm:block sm:text-[8px]">
        {player.statusLabel}
      </span>
    </button>
  );
}

interface TopVotingBarProps {
  players?: HudPlayerSlot[];
  selfId?: string;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (id: string) => void;
}

export function TopVotingBar({
  players = MOCK_HUD_PLAYERS,
  selfId,
  selectedPlayerId,
  onSelectPlayer,
}: TopVotingBarProps) {
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-0 z-[38] bg-gradient-to-b from-black/95 via-black/70 to-transparent px-1 pb-3 pt-2 sm:px-3">
      <div className="mx-auto flex w-full max-w-[1100px] items-start justify-between gap-0 sm:justify-evenly sm:gap-1">
        {players.map((player) => (
          <PlayerVoteCard
            key={player.id}
            player={player}
            isSelf={selfId === player.id}
            isSelected={selectedPlayerId === player.id}
            onClick={onSelectPlayer}
          />
        ))}
      </div>
    </div>
  );
}
