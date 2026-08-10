import { useState } from 'react';

import { CardFrontFace } from '@/components/Hand/CardFaces';
import type { CardType, PlayerHandCard } from '@/types/card';
import { resolveCardImageUrl } from '@/utils/cardArt';

interface RevealCardThumbProps {
  type: CardType;
  title: string;
  description?: string;
  imageUrl?: string;
  className?: string;
}

export function RevealCardThumb({
  type,
  title,
  description = '',
  imageUrl,
  className = '',
}: RevealCardThumbProps) {
  const resolvedUrl = imageUrl ?? resolveCardImageUrl({ type, title, imageUrl });
  const [useFallback, setUseFallback] = useState(false);

  const card: PlayerHandCard = {
    id: `reveal-${title}`,
    type,
    title,
    description,
    isRevealed: true,
    imageUrl: resolvedUrl,
  };

  return (
    <div
      className={`pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 rotate-6 ${className}`}
      aria-hidden
    >
      {!useFallback ? (
        <div className="h-[108px] w-[76px] overflow-hidden rounded-xl border border-black/20 bg-neutral-900 shadow-[10px_14px_28px_rgba(0,0,0,0.65),4px_6px_12px_rgba(0,0,0,0.45)]">
          <img
            src={resolvedUrl}
            alt=""
            className={`h-full w-full ${type === 'character' ? 'object-cover object-top' : 'object-cover'}`}
            draggable={false}
            onError={() => setUseFallback(true)}
          />
        </div>
      ) : (
        <div className="origin-top-left scale-[0.6785] shadow-[15px_21px_42px_rgba(0,0,0,0.65)] rounded-2xl">
          <div className="h-[168px] w-[112px]">
            <CardFrontFace card={card} size="hand" />
          </div>
        </div>
      )}
    </div>
  );
}
