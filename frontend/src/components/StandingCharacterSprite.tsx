import { motion } from 'framer-motion';
import { useState } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import { PrivateMessageBadge } from '@/components/PrivateChat/PrivateMessageBadge';
import { ASSETS } from '@/config/assets';
import { genderLabel } from '@/data/characters';
import { usePrivateChatStore } from '@/store/privateChatStore';
import type { Player } from '@/types/game';
import { OUTPOST_BASE_WIDTH, type SeatLayout } from '@/utils/seatPositions';

interface StandingCharacterSpriteProps {
  player: Player;
  layout: SeatLayout;
  zIndex?: number;
  isSelf?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
  onOpenPrivateChat?: (id: string, anchor: DOMRect) => void;
}

const CHIBI_ANCHOR = {
  transform: 'translateX(-50%) translateY(-92%)',
} as const;

export function StandingCharacterSprite({
  player,
  layout,
  zIndex = 15,
  isSelf = false,
  selected = false,
  onSelect,
  onOpenPrivateChat,
}: StandingCharacterSpriteProps) {
  const [useDefault, setUseDefault] = useState(false);
  const unreadCount = usePrivateChatStore((s) => s.unread[player.id] ?? 0);
  const src = useDefault
    ? ASSETS.characters.default
    : ASSETS.characters.chibi(player.characterId);
  const width = OUTPOST_BASE_WIDTH * layout.scale;

  return (
    <motion.button
      type="button"
      className="pointer-events-auto absolute focus:outline-none"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${width}%`,
        zIndex: unreadCount > 0 ? zIndex + 25 : zIndex,
        ...CHIBI_ANCHOR,
      }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.35 }}
      onClick={(event) => {
        playUiSound('character');
        if (onOpenPrivateChat) {
          onOpenPrivateChat(player.id, event.currentTarget.getBoundingClientRect());
          return;
        }
        onSelect?.(player.id);
      }}
      aria-label={`${player.name}, ${genderLabel(player.gender)}`}
    >
      <div
        className={`relative ${selected ? 'rounded-lg ring-2 ring-bunker-danger' : ''} ${isSelf ? 'drop-shadow-[0_0_10px_rgba(57,255,20,0.55)]' : ''}`}
      >
        <div className="relative w-full">
          {!isSelf && <PrivateMessageBadge count={unreadCount} variant="chibi" />}
          <img
            src={src}
            alt=""
            className="pointer-events-none block h-auto w-full select-none"
            draggable={false}
            onError={() => setUseDefault(true)}
          />
        </div>
        <div className="absolute bottom-0 left-1/2 w-[130%] -translate-x-1/2 translate-y-full pt-0.5 text-center">
          <span className="inline-block whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 font-display text-[9px] font-semibold text-bunker-text backdrop-blur-sm sm:text-[10px]">
            {player.name}
            <span className="ml-1 font-mono text-bunker-muted">{genderLabel(player.gender)}</span>
            {isSelf && (
              <span className="ml-1 font-mono text-bunker-neon">{player.age}л</span>
            )}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
