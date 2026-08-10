import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import { playCardHoverSoundEffect, playUiSound } from '@/audio/uiSounds';
import { CardFrontFace } from '@/components/Hand/CardFaces';
import { InspectCardOverlay } from '@/components/Hand/InspectCardOverlay';
import type { PlayerHandCard } from '@/types/card';

interface RevealPickCardProps {
  card: PlayerHandCard;
  isRaised: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onSelect: (cardId: string) => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}

/** Полноразмерная карта — те же пропорции, что в BottomHand (112×168) */
function RevealPickCard({
  card,
  isRaised,
  disabled = false,
  hidden = false,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: RevealPickCardProps) {
  if (hidden) return null;

  return (
    <motion.div
      layoutId={card.id}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={() => {
        if (disabled) return;
        playUiSound('card');
        onSelect(card.id);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          playUiSound('card');
          onSelect(card.id);
        }
      }}
      onHoverStart={() => {
        if (!disabled) {
          playCardHoverSoundEffect();
          onHoverStart();
        }
      }}
      onHoverEnd={onHoverEnd}
      className={`relative h-[168px] w-[112px] shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 ${
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer'
      }`}
      aria-label={`Раскрыть: ${card.title}`}
      aria-disabled={disabled}
    >
      <motion.div
        className="h-full w-full"
        animate={{ y: isRaised && !disabled ? -8 : 0 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      >
        <CardFrontFace card={card} size="hand" />
      </motion.div>
    </motion.div>
  );
}

interface RevealTurnPanelProps {
  cards: PlayerHandCard[];
  onRevealCard: (cardId: string) => void;
}

/** Окно выбора карты — под лентой чата, над полем ввода */
export function RevealTurnPanel({ cards, onRevealCard }: RevealTurnPanelProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const displayCards = cards.filter(
    (c) => c.type !== 'secret_mission' && c.type !== 'character',
  );

  const selectedCard = useMemo(
    () => displayCards.find((card) => card.id === selectedCardId) ?? null,
    [displayCards, selectedCardId],
  );

  const inspectOpen = selectedCard !== null;

  const closeInspect = () => setSelectedCardId(null);

  const confirmReveal = () => {
    if (!selectedCard || selectedCard.isRevealed) return;
    playUiSound('cardReveal');
    onRevealCard(selectedCard.id);
    setSelectedCardId(null);
  };

  return (
    <LayoutGroup id="reveal-turn-cards">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.22 }}
        className="mt-4 shrink-0"
      >
        <div
          className={`flex min-h-[196px] items-end gap-4 overflow-visible rounded-2xl bg-white/10 px-5 pb-4 pt-5 sm:min-h-[204px] sm:gap-6 sm:px-6 sm:pb-5 sm:pt-6 ${
            inspectOpen ? 'opacity-60' : ''
          }`}
        >
          <div className="mb-2 min-w-0 flex-1 self-center border-l-2 border-[#2dd4bf]/80 py-1 pl-4 sm:pl-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#2dd4bf] sm:text-[11px]">
              Ваша очередь
            </p>
            <p className="mt-1.5 font-display text-lg font-semibold leading-tight text-white sm:text-xl">
              раскрыть карту
            </p>
          </div>

          <div className="flex shrink-0 items-end gap-5 overflow-x-auto pt-4 pb-1 sm:gap-6">
            {displayCards.map((card, index) => (
              <RevealPickCard
                key={card.id}
                card={card}
                disabled={card.isRevealed || inspectOpen}
                hidden={selectedCardId === card.id}
                isRaised={!inspectOpen && hoveredIndex === index}
                onSelect={setSelectedCardId}
                onHoverStart={() => setHoveredIndex(index)}
                onHoverEnd={() =>
                  setHoveredIndex((cur) => (cur === index ? null : cur))
                }
              />
            ))}
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {selectedCard && (
          <InspectCardOverlay
            key={selectedCard.id}
            card={selectedCard}
            onClose={closeInspect}
            zClass="z-[55]"
            startOnFront
            actions={[
              {
                label: 'Открыть эту карту',
                variant: 'primary',
                onClick: confirmReveal,
              },
              {
                label: 'Выбрать другую',
                variant: 'secondary',
                onClick: closeInspect,
              },
            ]}
          />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
