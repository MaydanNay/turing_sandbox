import { motion } from 'framer-motion';

import { playCardHoverSoundEffect, playUiSound } from '@/audio/uiSounds';
import type { PlayerHandCard } from '@/types/card';

import { CardFlipBody } from './CardFaces';

interface PlayerCardProps {
  card: PlayerHandCard;
  index: number;
  rotate: number;
  arcOffsetY: number;
  isRaised: boolean;
  disabled?: boolean;
  revealMode?: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onSelect: (cardId: string) => void;
  onReveal?: (cardId: string) => void;
}

export function PlayerCard({
  card,
  index,
  rotate,
  arcOffsetY,
  isRaised,
  disabled = false,
  revealMode = false,
  onHoverStart,
  onHoverEnd,
  onSelect,
  onReveal,
}: PlayerCardProps) {
  const canReveal = revealMode && !card.isRevealed;
  const interactive = !disabled && (canReveal || !revealMode);

  const handleClick = () => {
    if (disabled) return;
    if (canReveal) {
      playUiSound('cardReveal');
      onReveal?.(card.id);
      return;
    }
    if (!revealMode) {
      playUiSound('card');
      onSelect(card.id);
    }
  };

  return (
    <div
      className="relative shrink-0 first:ml-0"
      style={{
        zIndex: isRaised ? 50 : index + 1,
        marginLeft: index === 0 ? 0 : '-1.5rem',
        rotate: `${rotate}deg`,
        translate: `0 ${arcOffsetY}px`,
        opacity: disabled ? 0.35 : 1,
        scale: disabled ? 0.96 : 1,
      }}
    >
      <motion.div
        layoutId={card.id}
        role="button"
        tabIndex={interactive ? 0 : -1}
        className={`relative h-[168px] w-[112px] focus:outline-none ${
          interactive ? 'cursor-pointer' : 'cursor-default'
        } ${canReveal ? 'brightness-110' : ''}`}
        onClick={handleClick}
        onKeyDown={(event) => {
          if (!interactive) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          }
        }}
        onHoverStart={() => {
          if (interactive) {
            playCardHoverSoundEffect();
            onHoverStart();
          }
        }}
        onHoverEnd={onHoverEnd}
        aria-label={canReveal ? `Раскрыть: ${card.title}` : card.title}
        aria-disabled={!interactive}
      >
        <motion.div
          className="h-full w-full"
          animate={{ y: isRaised ? -12 : 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        >
          <CardFlipBody card={card} size="hand" />
        </motion.div>
      </motion.div>
    </div>
  );
}
