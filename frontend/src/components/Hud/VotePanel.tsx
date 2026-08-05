import { motion } from 'framer-motion';
import { useState } from 'react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import type { MyProfile, Player } from '@/types/game';

function VoteTargetCard({
  player,
  selected,
  disabled,
  onSelect,
}: {
  player: Player;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const [src, setSrc] = useState(() =>
    hasCharacterCard(player.characterId)
      ? ASSETS.cards.character(player.characterId)
      : ASSETS.characters.chibi(player.characterId),
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={`relative flex shrink-0 flex-col items-center gap-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:-translate-y-0.5'
      }`}
    >
      <div
        className={`h-14 w-14 overflow-hidden rounded-full border-2 bg-neutral-800 shadow-md sm:h-16 sm:w-16 ${
          selected ? 'border-red-400 ring-2 ring-red-400/40' : 'border-white/20'
        }`}
      >
        <img
          src={src}
          alt={player.name}
          className="h-full w-full object-cover object-top"
          draggable={false}
          onError={() => setSrc(ASSETS.characters.chibi(player.characterId))}
        />
      </div>
      <span className="max-w-[72px] truncate text-center text-[11px] font-medium capitalize text-white">
        {player.name}
      </span>
    </button>
  );
}

interface VotePanelProps {
  players: Player[];
  myProfile?: MyProfile | null;
  hasVoted: boolean;
  onConfirmBrig: (targetCharacterId: string) => void;
}

/** Панель голосования — выбор игрока для отправки в карцер */
export function VotePanel({
  players,
  myProfile,
  hasVoted,
  onConfirmBrig,
}: VotePanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const candidates = players.filter(
    (p) => p.is_alive && p.characterId !== myProfile?.characterId,
  );

  const confirm = () => {
    if (!selectedId || hasVoted) return;
    onConfirmBrig(selectedId);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22 }}
      className="mt-4 shrink-0"
    >
      <div className="flex min-h-[196px] flex-col gap-4 overflow-visible rounded-2xl bg-white/10 px-5 pb-4 pt-5 sm:min-h-[204px] sm:px-6 sm:pb-5 sm:pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 self-center border-l-2 border-red-400/80 py-1 pl-4 sm:pl-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-red-400 sm:text-[11px]">
              Голосование
            </p>
            <p className="mt-1.5 font-display text-lg font-semibold leading-tight text-white sm:text-xl">
              отправить в карцер
            </p>
            {hasVoted ? (
              <p className="mt-2 text-xs text-neutral-300">Ваш голос учтён</p>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">
                Выберите подозреваемого и подтвердите
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-end justify-end gap-4 pb-1 sm:gap-5">
            {candidates.map((player) => (
              <VoteTargetCard
                key={player.id}
                player={player}
                selected={selectedId === player.characterId}
                disabled={hasVoted}
                onSelect={() => setSelectedId(player.characterId)}
              />
            ))}
          </div>
        </div>

        {!hasVoted && (
          <div className="flex justify-end border-t border-white/10 pt-4">
            <button
              type="button"
              disabled={!selectedId}
              onClick={confirm}
              className="rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Отправить в карцер
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
