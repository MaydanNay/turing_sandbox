import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

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
  const [isHandOpen, setIsHandOpen] = useState(false);

  // Auto-open hand when it's our turn to reveal
  useEffect(() => {
    if (revealMode) {
      setIsHandOpen(true);
    }
  }, [revealMode]);

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
      {/* Toggle Button */}
      <div className={`pointer-events-none absolute bottom-0 left-0 flex h-full w-full items-end p-4 sm:p-6 ${revealMode ? 'z-[45]' : 'z-[39]'}`}>
        <button
          onClick={() => setIsHandOpen((prev) => !prev)}
          className={`pointer-events-auto flex h-[4.5rem] w-12 items-center justify-center rounded-lg border-2 bg-neutral-900/80 p-1 backdrop-blur-md transition-all duration-300 ${
            isHandOpen 
              ? 'border-amber-400/50 shadow-[0_0_15px_rgba(251,191,36,0.2)]'
              : 'border-white/20 hover:border-white/40 hover:bg-neutral-800 hover:-translate-y-1'
          }`}
          title="Инвентарь"
        >
          <div className={`h-full w-full rounded-sm border ${isHandOpen ? 'border-amber-400/30' : 'border-white/10'}`} />
        </button>
      </div>

      <div
        className={`pointer-events-none absolute bottom-0 flex w-full justify-center ${revealMode ? 'z-[44]' : 'z-[38]'}`}
      >
        <motion.div
          className="relative flex w-full max-w-[min(100%,720px)] justify-center px-2"
          style={{ pointerEvents: isHandOpen ? (inspectOpen ? 'none' : 'auto') : 'none' }}
          initial={false}
          animate={{
            x: isHandOpen ? 0 : '-40vw',
            y: isHandOpen ? (handZoneHovered && !inspectOpen ? -HAND_LIFT_PX : HAND_SINK_PX) : 120,
            scale: isHandOpen ? 1 : 0.2,
            opacity: isHandOpen ? 1 : 0,
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
