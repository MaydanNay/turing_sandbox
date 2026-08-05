import { useState } from 'react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import { BRIG_CAPACITY } from '@/data/gamePhaseConfig';
import type { Player } from '@/types/game';

function BrigSlot({
  characterId,
  name,
}: {
  characterId: string | null;
  name?: string;
}) {
  const [src, setSrc] = useState(() =>
    characterId
      ? hasCharacterCard(characterId)
        ? ASSETS.cards.character(characterId)
        : ASSETS.characters.chibi(characterId)
      : '',
  );

  return (
    <div
      className={`flex h-[88px] w-[72px] flex-col items-center justify-end rounded-xl border-2 border-dashed pb-2 sm:h-[96px] sm:w-20 ${
        characterId
          ? 'border-red-500/40 bg-red-950/30'
          : 'border-white/15 bg-black/20'
      }`}
    >
      {characterId ? (
        <>
          <div className="mb-1 h-12 w-12 overflow-hidden rounded-lg bg-neutral-900 sm:h-14 sm:w-14">
            <img
              src={src}
              alt={name ?? ''}
              className="h-full w-full object-cover object-top"
              draggable={false}
              onError={() =>
                characterId && setSrc(ASSETS.characters.chibi(characterId))
              }
            />
          </div>
          <span className="max-w-full truncate px-1 text-[9px] font-medium capitalize text-red-200/90">
            {name}
          </span>
        </>
      ) : (
        <span className="px-1 text-center text-[9px] uppercase tracking-wider text-white/25">
          пусто
        </span>
      )}
    </div>
  );
}

interface BrigGridProps {
  brigCharacterIds: string[];
  players: Player[];
}

/** Сетка карцера — сюда попадают изгнанные chibi (до 3 слотов) */
export function BrigGrid({ brigCharacterIds, players }: BrigGridProps) {
  const slots = Array.from({ length: BRIG_CAPACITY }, (_, index) => {
    const characterId = brigCharacterIds[index] ?? null;
    const player = characterId
      ? players.find((p) => p.characterId === characterId)
      : undefined;
    return { characterId, name: player?.name };
  });

  const occupied = brigCharacterIds.length;

  return (
    <div className="pointer-events-none absolute right-4 top-16 z-[8] sm:top-[4.5rem]">
      <div className="rounded-2xl border border-red-500/25 bg-black/35 px-3 py-2.5 backdrop-blur-md">
        <p className="mb-2 text-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-red-400/90">
          Карцер · {occupied}/{BRIG_CAPACITY}
        </p>
        <div className="flex gap-2">
          {slots.map((slot, index) => (
            <BrigSlot
              key={slot.characterId ?? `empty-${index}`}
              characterId={slot.characterId}
              name={slot.name}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
