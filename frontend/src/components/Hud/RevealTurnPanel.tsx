import { motion } from 'framer-motion';
import { useState } from 'react';

import { CardFrontFace } from '@/components/Hand/CardFaces';
import type { PlayerHandCard } from '@/types/card';

interface RevealPickCardProps {
  card: PlayerHandCard;
  isRaised: boolean;
  onPick: (cardId: string) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/** Полноразмерная карта — те же пропорции, что в BottomHand (112×168) */
function RevealPickCard({
  card,
  isRaised,
  onPick,
  onHoverStart,
  onHoverEnd,
}: RevealPickCardProps) {
  return (
    <motion.button
      type="button"
      onClick={() => onPick(card.id)}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
      className="relative h-[168px] w-[112px] shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
      aria-label={`Раскрыть: ${card.title}`}
      animate={{ y: isRaised ? -8 : 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
    >
      <CardFrontFace card={card} size="hand" />
    </motion.button>
  );
}

interface RevealTurnPanelProps {
  cards: PlayerHandCard[];
  onRevealCard: (cardId: string) => void;
}

/** Окно выбора карты — под лентой чата, над полем ввода */
export function RevealTurnPanel({ cards, onRevealCard }: RevealTurnPanelProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const pickableCards = cards.filter(
    (c) =>
      !c.isRevealed &&
      c.type !== 'secret_mission' &&
      c.type !== 'character',
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.22 }}
      className="mt-4 shrink-0"
    >
      <p className="mb-4 text-center text-sm font-medium text-[#2dd4bf]">
        Ваша очередь раскрыть карту
      </p>

      <div className="flex min-h-[196px] items-end gap-3 overflow-visible rounded-2xl bg-[#1A1A1A] px-5 pb-4 pt-5 sm:min-h-[204px] sm:px-6 sm:pb-5 sm:pt-6">
        <p className="mb-2 min-w-0 flex-1 self-center text-[15px] font-medium leading-snug text-white sm:text-base">
          Ваша очередь раскрыть карту
        </p>

        <div className="flex shrink-0 items-end gap-3 overflow-x-auto overflow-y-visible pb-1">
          {pickableCards.map((card, index) => (
            <RevealPickCard
              key={card.id}
              card={card}
              isRaised={hoveredIndex === index}
              onPick={onRevealCard}
              onHoverStart={() => setHoveredIndex(index)}
              onHoverEnd={() =>
                setHoveredIndex((cur) => (cur === index ? null : cur))
              }
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
