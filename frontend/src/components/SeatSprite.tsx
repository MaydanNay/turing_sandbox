import { motion } from 'framer-motion';

import { playUiSound } from '@/audio/uiSounds';
import { PrivateMessageBadge } from '@/components/PrivateChat/PrivateMessageBadge';
import { seatSprite } from '@/config/assets';
import { genderLabel } from '@/data/characters';
import { usePrivateChatStore } from '@/store/privateChatStore';
import type { Player } from '@/types/game';
import { SEAT_BASE_WIDTH, type SeatLayout } from '@/utils/seatPositions';

interface SeatSpriteProps {
  seatNumber: number;
  player: Player;
  layout: SeatLayout;
  zIndex: number;
  isSelf?: boolean;
  selected?: boolean;
  onSelect?: (id: string) => void;
}

/** % ширины группы сцены на один спрайт стула — см. SEAT_BASE_WIDTH в seatPositions.ts */
const BASE_WIDTH_PERCENT = SEAT_BASE_WIDTH;

/** Якорь: нижняя точка стула (основание) стоит в layout.x / layout.y */
const SEAT_ANCHOR_STYLE = {
  transform: 'translateX(-50%) translateY(-88%)',
} as const;

export function SeatSprite({
  seatNumber,
  player,
  layout,
  zIndex,
  isSelf = false,
  selected = false,
  onSelect,
}: SeatSpriteProps) {
  const unreadCount = usePrivateChatStore((s) => s.unread[player.id] ?? 0);
  const src = seatSprite(seatNumber, player.characterId, player.is_alive);
  const suspicion = player.suspicion_score;
  const criticalSuspicion = suspicion >= 75 && player.is_alive;
  const highSuspicion = suspicion >= 50 && player.is_alive;
  const width = BASE_WIDTH_PERCENT * layout.scale;
  const displayZIndex = unreadCount > 0 ? zIndex + 25 : zIndex;

  return (
    <motion.button
      type="button"
      className="pointer-events-auto absolute focus:outline-none"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${width}%`,
        zIndex: displayZIndex,
        ...SEAT_ANCHOR_STYLE,
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        filter: player.is_alive ? 'grayscale(0)' : 'grayscale(0.85) brightness(0.65)',
      }}
      whileHover={player.is_alive ? { opacity: 0.95 } : undefined}
      onClick={() => {
        if (!player.is_alive) return;
        playUiSound('character');
        onSelect?.(player.id);
      }}
      aria-label={`${player.name}, ${genderLabel(player.gender)}`}
    >
      <motion.div
        className={`relative ${selected ? 'rounded-lg ring-2 ring-bunker-danger ring-offset-1 ring-offset-transparent' : ''} ${isSelf ? 'drop-shadow-[0_0_10px_rgba(57,255,20,0.55)]' : ''}`}
        animate={
          criticalSuspicion
            ? { x: [0, -2, 2, 0] }
            : highSuspicion
              ? { scale: [1, 1.02, 1] }
              : {}
        }
        transition={
          criticalSuspicion
            ? { duration: 0.4, repeat: Infinity, repeatDelay: 0.5 }
            : { duration: 1.5, repeat: Infinity }
        }
      >
        <div className="relative w-full">
          {!isSelf && player.is_alive && (
            <PrivateMessageBadge count={unreadCount} variant="seated" />
          )}
          <img
            src={src}
            alt=""
            className="pointer-events-none block h-auto w-full select-none"
            draggable={false}
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

        {!player.is_alive && (
          <motion.div
            className="pointer-events-none absolute inset-[8%] flex items-center justify-center"
            initial={{ scale: 1.6, opacity: 0, rotate: -10 }}
            animate={{ scale: 1, opacity: 1, rotate: -10 }}
          >
            <span className="rounded border-2 border-bunker-danger bg-black/85 px-1 py-0.5 font-mono text-[7px] font-bold uppercase tracking-widest text-bunker-danger sm:text-[9px]">
              Отклонён
            </span>
          </motion.div>
        )}

        {suspicion > 0 && player.is_alive && (
          <div className="absolute -top-0.5 left-1/2 h-0.5 w-3/4 -translate-x-1/2 overflow-hidden rounded-full bg-bunker-border">
            <motion.div
              className="h-full bg-bunker-danger"
              animate={{ width: `${suspicion}%` }}
            />
          </div>
        )}
      </motion.div>
    </motion.button>
  );
}

export function EmptySeatSprite({
  seatNumber,
  layout,
  zIndex,
}: {
  seatNumber: number;
  layout: SeatLayout;
  zIndex: number;
}) {
  const width = BASE_WIDTH_PERCENT * layout.scale;

  return (
    <div
      className="absolute"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${width}%`,
        zIndex,
        ...SEAT_ANCHOR_STYLE,
      }}
    >
      <img
        src={seatSprite(seatNumber, null, false)}
        alt=""
        className="h-auto w-full select-none"
        draggable={false}
      />
    </div>
  );
}
