import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

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
      className={`pointer-events-none flex h-[88px] w-[72px] flex-col items-center justify-end rounded-xl border-2 border-dashed pb-2 sm:h-[96px] sm:w-20 ${
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
  onOpen?: () => void;
}

/** Сетка карцера — portal + явное WoW-вдавливание */
export function BrigGrid({ brigCharacterIds, players, onOpen }: BrigGridProps) {
  const [pressed, setPressed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const slots = Array.from({ length: BRIG_CAPACITY }, (_, index) => {
    const characterId = brigCharacterIds[index] ?? null;
    const player = characterId
      ? players.find((p) => p.characterId === characterId)
      : undefined;
    return { characterId, name: player?.name };
  });

  const occupied = brigCharacterIds.length;

  const press = useCallback(() => setPressed(true), []);
  const release = useCallback(() => setPressed(false), []);

  useEffect(() => {
    if (!pressed) return;
    const up = () => setPressed(false);
    window.addEventListener('mouseup', up);
    window.addEventListener('blur', up);
    return () => {
      window.removeEventListener('mouseup', up);
      window.removeEventListener('blur', up);
    };
  }, [pressed]);

  const node = (
    <div
      data-brig-widget
      style={{
        position: 'fixed',
        right: 16,
        top: 12,
        zIndex: 10000,
        pointerEvents: 'auto',
      }}
    >
      <button
        type="button"
        data-pressed={pressed ? 'true' : 'false'}
        aria-label={`Карцер ${occupied} из ${BRIG_CAPACITY}`}
        onClick={(event) => {
          event.stopPropagation();
          setCollapsed(!collapsed);
          onOpen?.();
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          event.stopPropagation();
          press();
        }}
        onMouseUp={(event) => {
          event.stopPropagation();
          release();
        }}
        onMouseLeave={release}
        onBlur={release}
        className={`brig-wow-btn select-none rounded-xl px-4 py-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${collapsed ? 'w-48' : ''}`}
      >
        <div className={`flex items-center justify-between ${collapsed ? '' : 'mb-3'}`}>
          <p className="text-center font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-red-300">
            Карцер · {occupied}/{BRIG_CAPACITY}
          </p>
          <span className="ml-4 flex h-4 w-4 items-center justify-center rounded-sm text-[10px] text-red-400">
            {collapsed ? '▼' : '▲'}
          </span>
        </div>
        {!collapsed && (
          <div className="flex gap-2">
            {slots.map((slot, index) => (
              <BrigSlot
                key={slot.characterId ?? `empty-${index}`}
                characterId={slot.characterId}
                name={slot.name}
              />
            ))}
          </div>
        )}
      </button>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(node, document.body);
}
