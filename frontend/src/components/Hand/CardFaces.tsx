import { motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ASSETS } from '@/config/assets';
import type { CardType, PlayerHandCard } from '@/types/card';

export const TYPE_STYLES: Record<
  Exclude<CardType, 'character'>,
  { bg: string; border: string; accent: string }
> = {
  skill: {
    bg: 'bg-gradient-to-br from-emerald-950/90 via-bunker-panel to-black',
    border: 'border-bunker-neon/50',
    accent: 'text-bunker-neon',
  },
  biometrics: {
    bg: 'bg-gradient-to-br from-red-950/90 via-bunker-panel to-black',
    border: 'border-bunker-danger/50',
    accent: 'text-bunker-danger',
  },
  inventory: {
    bg: 'bg-gradient-to-br from-blue-950/90 via-bunker-panel to-black',
    border: 'border-blue-400/50',
    accent: 'text-blue-300',
  },
  trait: {
    bg: 'bg-gradient-to-br from-purple-950/90 via-bunker-panel to-black',
    border: 'border-purple-400/50',
    accent: 'text-purple-300',
  },
  secret_mission: {
    bg: 'bg-gradient-to-br from-amber-950/90 via-bunker-panel to-black',
    border: 'border-bunker-amber/60',
    accent: 'text-bunker-amber',
  },
};

export type CardVisualSize = 'hand' | 'inspect';

const SIZE_CLASS: Record<CardVisualSize, string> = {
  hand: 'text-[10px]',
  inspect: 'text-base',
};

function CardBackContent({ size }: { size: CardVisualSize }) {
  const bordered = size === 'inspect';
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#2a2a2a] via-[#1c1c1c] to-[#121212] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${bordered ? 'border border-bunker-border' : ''}`}
    >
      <div
        className={`mb-3 rounded-full bg-black/50 ${size === 'inspect' ? 'border border-bunker-neon/30 p-5' : 'p-3'}`}
      >
        <Lock
          className={size === 'inspect' ? 'h-8 w-8 text-bunker-neon/70' : 'h-5 w-5 text-bunker-muted'}
          strokeWidth={1.75}
        />
      </div>
      <span
        className={`font-display font-semibold tracking-widest text-bunker-neon/80 ${size === 'inspect' ? 'text-sm' : 'text-[10px]'}`}
      >
        TURING
      </span>
      <span
        className={`mt-1 font-mono uppercase tracking-[0.25em] text-bunker-muted ${size === 'inspect' ? 'text-[10px]' : 'text-[8px]'}`}
      >
        Sandbox
      </span>
    </div>
  );
}

function CardBack({ size }: { size: CardVisualSize }) {
  return (
    <div
      className="absolute inset-0"
      style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
    >
      <CardBackContent size={size} />
    </div>
  );
}

/** Только визуал рубашки — для drag-3D оборачивай в слой с rotateY(180deg) */
export function CardBackFace({ size = 'hand' }: { size?: CardVisualSize }) {
  return <CardBackContent size={size} />;
}

function CharacterFront({ card, size }: { card: PlayerHandCard; size: CardVisualSize }) {
  const [imageSrc, setImageSrc] = useState(card.imageUrl);

  useEffect(() => {
    setImageSrc(card.imageUrl);
  }, [card.imageUrl]);

  return (
    <div
      className={`absolute inset-0 overflow-hidden rounded-xl bg-bunker-panel ${size === 'inspect' ? 'border border-bunker-border/80' : ''}`}
      style={{ backfaceVisibility: 'hidden' }}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-cover object-top"
          draggable={false}
          onError={() => {
            if (imageSrc?.includes('/cards/characters/')) {
              const match = imageSrc.match(/\/([^/]+)_card\.png$/);
              const id = match?.[1];
              setImageSrc(id ? ASSETS.characters.chibi(id) : ASSETS.characters.default);
            } else {
              setImageSrc(ASSETS.characters.default);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-bunker-bg/80">
          <span className="font-display text-sm text-bunker-muted">?</span>
        </div>
      )}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-3 ${size === 'inspect' ? 'pb-4 pt-16' : 'pb-2 pt-8'}`}
      >
        <p
          className={`truncate text-center font-display font-semibold text-bunker-text ${size === 'inspect' ? 'text-xl' : 'text-xs'}`}
        >
          {card.title}
        </p>
        {card.description && (
          <p
            className={`truncate text-center font-mono text-bunker-muted ${size === 'inspect' ? 'text-sm' : 'text-[9px]'}`}
          >
            {card.description}
          </p>
        )}
      </div>
    </div>
  );
}

function TypedFront({ card, size }: { card: PlayerHandCard; size: CardVisualSize }) {
  const style = TYPE_STYLES[card.type as Exclude<CardType, 'character'>];
  const isInspect = size === 'inspect';

  return (
    <div
      className={`absolute inset-0 flex flex-col rounded-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${style.bg} ${isInspect ? `border ${style.border} p-6` : 'p-3'}`}
      style={{ backfaceVisibility: 'hidden' }}
    >
      <p
        className={`mb-2 font-mono uppercase tracking-widest ${style.accent} ${isInspect ? 'text-xs' : 'text-[9px]'}`}
      >
        {card.type.replace('_', ' ')}
      </p>
      <h3
        className={`mb-3 font-display font-semibold leading-tight text-bunker-text ${isInspect ? 'text-2xl' : 'line-clamp-2 text-sm'}`}
      >
        {card.title}
      </h3>
      <p
        className={`flex-1 font-mono leading-relaxed text-bunker-text/85 ${SIZE_CLASS[size]} ${isInspect ? 'line-clamp-none' : 'line-clamp-4'}`}
      >
        {card.description}
      </p>
    </div>
  );
}

export function CardFrontFace({
  card,
  size = 'hand',
}: {
  card: PlayerHandCard;
  size?: CardVisualSize;
}) {
  if (card.type === 'character') {
    return <CharacterFront card={card} size={size} />;
  }
  return <TypedFront card={card} size={size} />;
}

interface CardFlipBodyProps {
  card: PlayerHandCard;
  size?: CardVisualSize;
}

/** 3D-переворот лицо / рубашка */
export function CardFlipBody({ card, size = 'hand' }: CardFlipBodyProps) {
  return (
    <motion.div
      className="relative h-full w-full"
      style={{ transformStyle: 'preserve-3d' }}
      animate={{ rotateY: card.isRevealed ? 0 : 180 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      {card.type === 'character' ? (
        <CharacterFront card={card} size={size} />
      ) : (
        <TypedFront card={card} size={size} />
      )}
      <CardBack size={size} />
    </motion.div>
  );
}
