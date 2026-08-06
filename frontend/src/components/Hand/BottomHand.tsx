import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useMemo, useState } from 'react';

import { MOCK_HAND_CARDS } from '@/data/mockHand';
import type { PlayerHandCard } from '@/types/card';
import { HAND_SIZE } from '@/types/card';

import { InspectCardOverlay } from './InspectCardOverlay';
import { PlayerCard } from './PlayerCard';
import { TurnIndicator } from '@/components/RoundTablePhase/TurnIndicator';

/** Веер: rotate и смещение по Y для полукруга */
const FAN_LAYOUT = [
  { rotate: -10, arcOffsetY: 14 },
  { rotate: -5, arcOffsetY: 8 },
  { rotate: -2, arcOffsetY: 3 },
  { rotate: 2, arcOffsetY: 3 },
  { rotate: 5, arcOffsetY: 8 },
  { rotate: 10, arcOffsetY: 14 },
] as const;

/** Насколько рука опущена ниже края экрана (аванпост и стол — одинаково) */
const HAND_SINK_PX = 56;
/** Лёгкое приподнимание веера при hover — только верхушка карт видна */
const HAND_LIFT_PX = 18;

interface BottomHandProps {
  cards?: PlayerHandCard[];
  revealMode?: boolean;
  onRevealCard?: (cardId: string) => void;
}

export function BottomHand({
  cards = MOCK_HAND_CARDS,
  revealMode = false,
  onRevealCard,
}: BottomHandProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [handZoneHovered, setHandZoneHovered] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  const hand = cards.slice(0, HAND_SIZE);
  const inspectOpen = selectedCardId !== null;

  const selectedCard = useMemo(
    () => hand.find((card) => card.id === selectedCardId) ?? null,
    [hand, selectedCardId],
  );

  const closeInspect = () => setSelectedCardId(null);

  // Wait for server hand (WS `hand`) — hooks above must always run
  if (cards.length === 0) {
    return null;
  }

  if (cards.length !== HAND_SIZE) {
    console.warn(`BottomHand expects ${HAND_SIZE} cards, got ${cards.length}`);
  }

  return (
    <LayoutGroup id="player-hand">
      <div
        className={`pointer-events-none absolute bottom-0 flex w-full justify-center ${revealMode ? 'z-[44]' : 'z-[38]'}`}
      >
        <motion.div
          className={`relative flex w-full max-w-[min(100%,720px)] justify-center px-2 ${inspectOpen ? 'pointer-events-none' : 'pointer-events-auto'}`}
          initial={false}
          animate={{
            y: handZoneHovered && !inspectOpen ? -HAND_LIFT_PX : HAND_SINK_PX,
          }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          onHoverStart={() => !inspectOpen && setHandZoneHovered(true)}
          onHoverEnd={() => setHandZoneHovered(false)}
        >
          <TurnIndicator visible={revealMode} />
          <div className="flex items-end pb-2">
            {hand.map((card, index) => {
              if (selectedCardId === card.id) return null;

              return (
                <PlayerCard
                  key={card.id}
                  card={card}
                  index={index}
                  rotate={FAN_LAYOUT[index]?.rotate ?? 0}
                  arcOffsetY={FAN_LAYOUT[index]?.arcOffsetY ?? 0}
                  isRaised={!inspectOpen && hoveredIndex === index}
                  disabled={inspectOpen}
                  revealMode={revealMode}
                  onHoverStart={() => setHoveredIndex(index)}
                  onHoverEnd={() =>
                    setHoveredIndex((current) => (current === index ? null : current))
                  }
                  onSelect={setSelectedCardId}
                  onReveal={onRevealCard}
                />
              );
            })}
          </div>
        </motion.div>
      </div>

      <AnimatePresence mode="popLayout">
        {selectedCard && (
          <InspectCardOverlay key={selectedCard.id} card={selectedCard} onClose={closeInspect} />
        )}
      </AnimatePresence>
    </LayoutGroup>
  );
}
