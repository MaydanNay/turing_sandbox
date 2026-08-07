import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import {
  PlayerFootOval,
  playerMarkTone,
  playerNameplateClass,
} from '@/components/PlayerTargetMark';
import { PrivateMessageBadge } from '@/components/PrivateChat/PrivateMessageBadge';
import { ASSETS } from '@/config/assets';
import { genderLabel } from '@/data/characters';
import {
  moveDurationSeconds,
  useOutpostMovementStore,
} from '@/store/outpostMovementStore';
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
  /** Fired when a move animation to the current layout finishes */
  onMoveComplete?: (playerId: string) => void;
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
  onMoveComplete,
}: StandingCharacterSpriteProps) {
  const [useDefault, setUseDefault] = useState(false);
  const [hovered, setHovered] = useState(false);
  const unreadCount = usePrivateChatStore((s) => s.unread[player.id] ?? 0);
  const src = useDefault
    ? ASSETS.characters.default
    : ASSETS.characters.chibi(player.characterId);
  const width = OUTPOST_BASE_WIDTH * layout.scale;
  const fromRef = useRef({ x: layout.x, y: layout.y });
  const targetKeyRef = useRef(`${layout.x},${layout.y}`);
  const durationRef = useRef(0.35);
  const moveGen = useRef(0);

  const markTone = playerMarkTone({
    isSelf,
    alive: player.is_alive,
    hovered,
    selected,
  });

  const storeAnim = useOutpostMovementStore((s) => s.moveAnim[player.id]);
  const targetKey = `${layout.x},${layout.y}`;
  if (targetKeyRef.current !== targetKey) {
    // Prefer store anim (from real feet) so re-clicks don't use a stale fromRef
    if (
      storeAnim &&
      Math.abs(storeAnim.toX - layout.x) < 0.05 &&
      Math.abs(storeAnim.toY - layout.y) < 0.05
    ) {
      fromRef.current = { x: storeAnim.fromX, y: storeAnim.fromY };
      durationRef.current = storeAnim.durationMs / 1000;
    } else {
      durationRef.current = moveDurationSeconds(
        fromRef.current.x,
        fromRef.current.y,
        layout.x,
        layout.y,
      );
    }
    targetKeyRef.current = targetKey;
  }
  const moveDuration = durationRef.current;

  useEffect(() => {
    const moved =
      Math.abs(fromRef.current.x - layout.x) > 0.05 ||
      Math.abs(fromRef.current.y - layout.y) > 0.05;
    if (!moved) {
      fromRef.current = { x: layout.x, y: layout.y };
      // Still advance multi-waypoint paths if store thinks we're moving
      if (onMoveComplete && useOutpostMovementStore.getState().isMoving(player.id)) {
        const gen = ++moveGen.current;
        const timer = window.setTimeout(() => {
          if (moveGen.current !== gen) return;
          onMoveComplete(player.id);
        }, 40);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    if (!onMoveComplete) {
      const timer = window.setTimeout(() => {
        fromRef.current = { x: layout.x, y: layout.y };
      }, moveDuration * 1000);
      return () => window.clearTimeout(timer);
    }

    const gen = ++moveGen.current;
    const timer = window.setTimeout(() => {
      if (moveGen.current !== gen) return;
      fromRef.current = { x: layout.x, y: layout.y };
      onMoveComplete(player.id);
    }, moveDuration * 1000 + 40);

    return () => window.clearTimeout(timer);
  }, [layout.x, layout.y, onMoveComplete, player.id, moveDuration]);

  const canHover = !isSelf && player.is_alive;

  return (
    <motion.button
      type="button"
      className="pointer-events-auto absolute focus:outline-none"
      style={{
        width: `${width}%`,
        zIndex: unreadCount > 0 ? zIndex + 2 : zIndex,
        ...CHIBI_ANCHOR,
      }}
      initial={{ opacity: 0, left: `${layout.x}%`, top: `${layout.y}%` }}
      animate={{
        opacity: 1,
        left: `${layout.x}%`,
        top: `${layout.y}%`,
      }}
      exit={{ opacity: 0 }}
      transition={{
        opacity: { duration: 0.35 },
        left: { duration: moveDuration, ease: 'linear' },
        top: { duration: moveDuration, ease: 'linear' },
      }}
      onMouseEnter={() => {
        if (canHover) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        event.stopPropagation();
        playUiSound('character');
        // Mark selected (red oval) even when opening the action / chat menu
        onSelect?.(player.id);
        if (onOpenPrivateChat) {
          onOpenPrivateChat(player.id, event.currentTarget.getBoundingClientRect());
        }
      }}
      aria-label={`${player.name}, ${genderLabel(player.gender)}`}
    >
      <div
        className={`relative ${isSelf ? 'drop-shadow-[0_0_4px_rgba(57,255,20,0.35)]' : ''}`}
      >
        <PlayerFootOval tone={markTone} />
        <div className="relative z-[1] w-full">
          {!isSelf && <PrivateMessageBadge count={unreadCount} variant="chibi" />}
          <img
            src={src}
            alt=""
            className="pointer-events-none block h-auto w-full select-none"
            draggable={false}
            onError={() => setUseDefault(true)}
          />
        </div>
        <div className="absolute bottom-0 left-1/2 z-[1] w-[130%] -translate-x-1/2 translate-y-full pt-0.5 text-center">
          <span className={playerNameplateClass(isSelf ? 'idle' : markTone)}>
            {player.name}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
