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
import { seatSprite } from '@/config/assets';
import { genderLabel } from '@/data/characters';
import { useGameStore } from '@/store/gameStore';
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
  onOpenPrivateChat?: (id: string, anchor: DOMRect) => void;
  /** Клик по своему месту — встать из-за стола */
  onStandUp?: () => void;
  style?: React.CSSProperties;
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
  onOpenPrivateChat,
  onStandUp,
  style,
}: SeatSpriteProps) {
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
  const src = seatSprite(seatNumber, player.characterId, player.is_alive);
  const suspicion = player.suspicion_score;
  const criticalSuspicion = suspicion >= 75 && player.is_alive;
  const highSuspicion = suspicion >= 50 && player.is_alive;
  const width = BASE_WIDTH_PERCENT * layout.scale;
  const displayZIndex = unreadCount > 0 ? zIndex + 25 : zIndex;
  const canHover = !isSelf && player.is_alive && !onStandUp;
  const markTone = playerMarkTone({
    isSelf,
    alive: player.is_alive,
    hovered: canHover && hovered,
    selected: Boolean(selected && !isSelf && player.is_alive),
  });

  return (
    <motion.button
      type="button"
      className="pointer-events-auto absolute focus:outline-none"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${width}%`,
        zIndex: displayZIndex,
        ...style,
        ...SEAT_ANCHOR_STYLE,
      }}
      initial={{ opacity: 0 }}
      animate={{
        opacity: 1,
        filter: player.is_alive ? 'grayscale(0)' : 'grayscale(0.85) brightness(0.65)',
      }}
      onMouseEnter={() => {
        if (canHover) setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onClick={(event) => {
        if (!player.is_alive) return;
        playUiSound(onStandUp ? 'table' : 'character');
        if (onStandUp) {
          onStandUp();
          return;
        }
        onSelect?.(player.id);
        if (onOpenPrivateChat) {
          onOpenPrivateChat(player.id, event.currentTarget.getBoundingClientRect());
        }
      }}
      aria-label={
        onStandUp
          ? 'Встать из-за стола'
          : `${player.name}, ${genderLabel(player.gender)}`
      }
    >
      <motion.div
        className="relative"
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

        <div className="absolute bottom-0 left-1/2 z-[1] w-[130%] -translate-x-1/2 translate-y-full pt-0.5 text-center">
          <span className={playerNameplateClass(markTone)}>
            {playerNameplateLabel(player.name, markTone)}
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

interface EmptySeatSpriteProps {
  seatNumber: number;
  layout: SeatLayout;
  zIndex: number;
  onClick?: () => void;
  interactive?: boolean;
  style?: React.CSSProperties;
}

export function EmptySeatSprite({
  seatNumber,
  layout,
  zIndex,
  onClick,
  style,
  interactive = false,
}: EmptySeatSpriteProps) {
  const width = BASE_WIDTH_PERCENT * layout.scale;

  if (interactive) {
    return (
      <div
        className="pointer-events-auto absolute"
        style={{
          left: `${layout.x}%`,
          top: `${layout.y}%`,
          width: `${width}%`,
          zIndex,
          ...SEAT_ANCHOR_STYLE,
        }}
      >
        <motion.button
          type="button"
          className="block w-full cursor-pointer focus:outline-none"
          initial={false}
          animate={{ y: 0, filter: 'brightness(1)' }}
          whileHover={{ y: -12, filter: 'brightness(1.12)' }}
          whileTap={{ y: -5, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          onClick={(event) => {
            event.stopPropagation();
            onClick?.();
          }}
          aria-label={`Стул ${seatNumber}`}
        >
          <img
            src={seatSprite(seatNumber, null, false)}
            alt=""
            className="pointer-events-none h-auto w-full select-none drop-shadow-[0_6px_12px_rgba(0,0,0,0.4)]"
            draggable={false}
          />
        </motion.button>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${layout.x}%`,
        top: `${layout.y}%`,
        width: `${width}%`,
        zIndex,
        ...style,
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
