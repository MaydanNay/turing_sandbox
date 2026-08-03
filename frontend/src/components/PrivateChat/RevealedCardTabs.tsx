import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useState } from 'react';

import { InspectCardOverlay } from '@/components/Hand/InspectCardOverlay';
import { CardFrontFace } from '@/components/Hand/CardFaces';
import { getRevealedCardsForPlayer } from '@/data/mockPlayerHands';
import type { CardType, PlayerHandCard } from '@/types/card';
import { cardRevealLabel } from '@/utils/cardLabel';

const TAB_ACCENT: Record<Exclude<CardType, 'character'>, string> = {
  biometrics: 'ring-red-300/80',
  skill: 'ring-cyan-300/80',
  trait: 'ring-green-300/80',
  inventory: 'ring-purple-300/80',
  secret_mission: 'ring-amber-300/80',
};

const TAB_SCALE = 0.76;
const TAB_W = 112 * TAB_SCALE;
const TAB_H = 168 * TAB_SCALE;

/** Сколько пикселей карты торчит над окном чата */
export const REVEALED_CARD_PEEK_PX = 44;

function RevealedCardTab({
  card,
  onOpen,
}: {
  card: PlayerHandCard;
  onOpen: (card: PlayerHandCard) => void;
}) {
  const accent = TAB_ACCENT[card.type as Exclude<CardType, 'character'>];

  return (
    <motion.button
      type="button"
      layoutId={card.id}
      onClick={() => onOpen(card)}
      className={`pointer-events-auto relative shrink-0 overflow-hidden rounded-t-xl bg-black shadow-lg ring-2 ring-inset transition hover:-translate-y-0.5 hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 ${accent}`}
      style={{ width: TAB_W, height: TAB_H }}
      title={cardRevealLabel(card)}
      aria-label={`Открыть карту: ${cardRevealLabel(card)}`}
    >
      <div
        className="pointer-events-none absolute left-0 top-0 origin-top-left"
        style={{
          width: 112,
          height: 168,
          transform: `scale(${TAB_SCALE})`,
        }}
      >
        <CardFrontFace card={card} size="hand" />
      </div>
    </motion.button>
  );
}

interface RevealedCardTabsProps {
  characterId: string;
}

/** Вкладки над чатом — раскрытые карты собеседника (без карты персонажа) */
export function RevealedCardTabs({ characterId }: RevealedCardTabsProps) {
  const [inspectedCard, setInspectedCard] = useState<PlayerHandCard | null>(null);
  const revealed = getRevealedCardsForPlayer(characterId);

  if (revealed.length === 0) return null;

  return (
    <>
      {/* Привязка к контейнеру чата — не к краю экрана */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-0 flex gap-2.5 pl-6">
        <LayoutGroup>
          {revealed.map((card) => (
            <RevealedCardTab key={card.id} card={card} onOpen={setInspectedCard} />
          ))}
        </LayoutGroup>
      </div>

      <AnimatePresence>
        {inspectedCard && (
          <InspectCardOverlay
            card={inspectedCard}
            onClose={() => setInspectedCard(null)}
            zClass="z-[60]"
          />
        )}
      </AnimatePresence>
    </>
  );
}
