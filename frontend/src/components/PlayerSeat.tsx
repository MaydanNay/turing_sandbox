import { motion } from 'framer-motion';
import { Bot, Skull, User } from 'lucide-react';

import { genderLabel } from '@/data/characters';
import type { Player } from '@/types/game';

interface PlayerSeatProps {
  player: Player;
  x: number;
  y: number;
  isSelf?: boolean;
  sceneMode: 'outpost' | 'table';
  onSelect?: (id: string) => void;
  selected?: boolean;
}

export function PlayerSeat({
  player,
  x,
  y,
  isSelf = false,
  sceneMode,
  onSelect,
  selected = false,
}: PlayerSeatProps) {
  const suspicion = player.suspicion_score;
  const highSuspicion = suspicion >= 50;
  const criticalSuspicion = suspicion >= 75;

  return (
    <motion.button
      type="button"
      className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{
        opacity: player.is_alive ? 1 : 0.55,
        scale: 1,
        filter: player.is_alive ? 'grayscale(0)' : 'grayscale(1)',
      }}
      whileHover={player.is_alive ? { scale: 1.05 } : undefined}
      onClick={() => onSelect?.(player.id)}
      aria-label={`Игрок ${player.name}`}
    >
      <motion.div
        className={`relative w-[88px] sm:w-[104px] rounded-xl border-2 bg-bunker-panel/95 p-2 shadow-lg backdrop-blur-sm ${
          isSelf ? 'border-bunker-neon shadow-neon' : 'border-bunker-border'
        } ${selected ? 'ring-2 ring-bunker-danger ring-offset-2 ring-offset-bunker-bg' : ''}`}
        animate={
          criticalSuspicion && player.is_alive
            ? {
                boxShadow: [
                  '0 0 0 rgba(255,0,60,0)',
                  '0 0 24px rgba(255,0,60,0.7)',
                  '0 0 0 rgba(255,0,60,0)',
                ],
                x: [0, -2, 2, -1, 0],
              }
            : highSuspicion && player.is_alive
              ? {
                  boxShadow: [
                    '0 0 0 rgba(255,0,60,0)',
                    '0 0 14px rgba(255,0,60,0.45)',
                    '0 0 0 rgba(255,0,60,0)',
                  ],
                }
              : {}
        }
        transition={
          criticalSuspicion
            ? { duration: 0.45, repeat: Infinity, repeatDelay: 0.6 }
            : { duration: 1.6, repeat: Infinity }
        }
      >
        {/* Chibi avatar — картинка из public/assets/characters/chibi/ или иконка */}
        <div
          className={`mx-auto mb-1.5 flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border-[3px] border-black bg-gradient-to-b ${
            player.is_ai
              ? 'from-indigo-900 to-indigo-950'
              : 'from-zinc-700 to-zinc-900'
          }`}
        >
          {player.avatarUrl && player.is_alive ? (
            <img
              src={player.avatarUrl}
              alt={player.name}
              className="h-full w-full object-cover object-top"
            />
          ) : player.is_alive ? (
            player.is_ai ? (
              <Bot className="h-7 w-7 text-indigo-300" strokeWidth={2.5} />
            ) : (
              <User className="h-7 w-7 text-zinc-200" strokeWidth={2.5} />
            )
          ) : (
            <Skull className="h-7 w-7 text-zinc-400" strokeWidth={2.5} />
          )}
        </div>

        <p className="truncate text-center font-display text-xs font-semibold text-bunker-text">
          {player.name}
          <span className="ml-0.5 font-mono text-[10px] text-bunker-muted">
            {genderLabel(player.gender)}
          </span>
        </p>
        <p className="truncate text-center font-mono text-[10px] text-bunker-neonDim">
          {player.role}
          {isSelf && (
            <span className="text-bunker-neon"> · {player.age}л</span>
          )}
        </p>

        {Object.entries(player.stats)
          .slice(0, 2)
          .map(([key, val]) => (
            <p key={key} className="truncate text-center font-mono text-[9px] text-bunker-muted">
              {key}: {val}
            </p>
          ))}

        {suspicion > 0 && player.is_alive && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-bunker-border">
            <motion.div
              className="h-full bg-bunker-danger"
              initial={{ width: 0 }}
              animate={{ width: `${suspicion}%` }}
            />
          </div>
        )}

        {!player.is_alive && (
          <motion.div
            className="pointer-events-none absolute inset-0 flex items-center justify-center"
            initial={{ scale: 2, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: -12 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <span className="rounded border-4 border-bunker-danger bg-black/80 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-bunker-danger">
              ОТКЛОНЕН
            </span>
          </motion.div>
        )}

        {sceneMode === 'table' && (
          <div className="absolute -bottom-3 left-1/2 h-2 w-8 -translate-x-1/2 rounded-sm bg-zinc-800 ring-1 ring-black" />
        )}
      </motion.div>
    </motion.button>
  );
}
