import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { playUiSound } from '@/audio/uiSounds';
import {
  PlayerFootOval,
  SelfPlayerMarker,
  playerMarkTone,
  playerNameplateClass,
  playerNameplateLabel,
} from '@/components/PlayerTargetMark';
import { PrivateMessageBadge } from '@/components/PrivateChat/PrivateMessageBadge';
import { ASSETS } from '@/config/assets';
import { genderLabel } from '@/data/characters';
import { useGameStore } from '@/store/gameStore';
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
  const [activeSpeech, setActiveSpeech] = useState<{ id: string; text: string } | null>(null);
  
  const chatMessages = useGameStore((s) => s.chat);
  const privateThread = usePrivateChatStore((s) => s.threads[player.id]);

  const prevChatLen = useRef(chatMessages.length);
  const prevPrivLen = useRef(privateThread?.length ?? 0);

  useEffect(() => {
    let newCandidate: { id: string; text: string } | null = null;

    if (chatMessages.length > prevChatLen.current) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (
        lastMsg &&
        lastMsg.kind === 'message' &&
        (lastMsg.sender === player.name ||
          lastMsg.sender === player.characterId ||
          lastMsg.sender === player.id)
      ) {
        newCandidate = { id: lastMsg.id, text: lastMsg.text };
      }
    }

    if (privateThread && privateThread.length > prevPrivLen.current) {
      const lastPriv = privateThread[privateThread.length - 1];
      if (lastPriv && lastPriv.from === 'them') {
        newCandidate = { id: lastPriv.id, text: lastPriv.text };
      }
    }

    prevChatLen.current = chatMessages.length;
    prevPrivLen.current = privateThread?.length ?? 0;

    if (newCandidate) {
      const { id, text } = newCandidate;
      setActiveSpeech((curr) => {
        if (curr?.id === id) return curr;
        let t = text;
        if (t.length > 70) t = t.slice(0, 67) + '...';
        return { id, text: t };
      });
    }
  }, [chatMessages, privateThread, player.name, player.characterId, player.id]);

  useEffect(() => {
    if (!activeSpeech) return;
    const timer = window.setTimeout(() => setActiveSpeech(null), 6000);
    return () => window.clearTimeout(timer);
  }, [activeSpeech]);

  const unreadCount = usePrivateChatStore((s) => s.unread[player.id] ?? 0);
  const src = useDefault
    ? ASSETS.characters.default
    : ASSETS.characters.chibi(player.characterId);
  const width = OUTPOST_BASE_WIDTH * layout.scale;
  const [initialState] = useState(() => {
    const store = useOutpostMovementStore.getState();
    const feet = store.getFeet(player.id);
    const anim = store.moveAnim[player.id];
    const isMidAnim = Boolean(anim && (performance.now() - anim.startedAt < anim.durationMs + 100));
    return {
      pos: feet ? { x: feet.x, y: feet.y } : { x: layout.x, y: layout.y },
      isMidAnim,
    };
  });

  const fromRef = useRef({ x: initialState.pos.x, y: initialState.pos.y });
  const targetKeyRef = useRef('');
  const durationRef = useRef(0);
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
      const elapsed = (performance.now() - storeAnim.startedAt) / 1000;
      const total = storeAnim.durationMs / 1000;
      durationRef.current = Math.max(0.05, total - Math.max(0, elapsed));
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
      initial={{ 
        opacity: initialState.isMidAnim ? 1 : 0, 
        left: `${initialState.pos.x}%`, 
        top: `${initialState.pos.y}%` 
      }}
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
      <div className="relative">
        <PlayerFootOval tone={markTone} />
        <div className="relative z-[1] w-full">
          <AnimatePresence>
            {activeSpeech && (
              <motion.div
                key={activeSpeech.id}
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                transition={{ duration: 0.2 }}
                className="absolute bottom-[100%] left-1/2 z-[10] mb-2 w-max max-w-[180px] -translate-x-1/2 pointer-events-none"
              >
                <div className="relative rounded-2xl bg-white/95 px-3 py-2 text-sm font-medium text-slate-800 shadow-xl backdrop-blur-sm border border-slate-200">
                  <p className="whitespace-pre-wrap break-words leading-tight">{activeSpeech.text}</p>
                  <div className="absolute top-[100%] left-1/2 -mt-[6px] -translate-x-1/2 w-3 h-3 bg-white/95 border-b border-r border-slate-200 rotate-45" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {isSelf && <SelfPlayerMarker />}
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
          <span className={playerNameplateClass(markTone)}>
            {playerNameplateLabel(player.name, markTone)}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
