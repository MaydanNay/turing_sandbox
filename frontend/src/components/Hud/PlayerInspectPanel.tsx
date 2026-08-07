import { motion } from 'framer-motion';
import { ArrowLeft, Eye } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CardFrontFace } from '@/components/Hand/CardFaces';
import { buildPortraitSrc } from '@/components/PrivateChat/CharacterPortraitLayer';
import { ASSETS, hasCharacterCard } from '@/config/assets';
import { getCharacterById, genderLabel } from '@/data/characters';
import { getCharacterChatAccent } from '@/data/characterChatAccent';
import { EMPTY_CARDS, useGameStore } from '@/store/gameStore';
import type { PlayerHandCard } from '@/types/card';
import type { Player } from '@/types/game';
import { cardRevealLabel } from '@/utils/cardLabel';

const PINSTRIPE_BG = (accent: string) =>
  `repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.045) 3px,
    rgba(0,0,0,0.045) 4px
  ), ${accent}`;

function MiniRevealedCard({ card }: { card: PlayerHandCard }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30 shadow-md">
      <div className="flex h-[88px] items-start justify-center overflow-hidden">
        <div
          style={{
            width: 112,
            height: 168,
            transform: 'scale(0.52)',
            transformOrigin: 'top center',
          }}
        >
          <CardFrontFace card={card} size="hand" />
        </div>
      </div>
      <p className="truncate px-1.5 pb-2 text-center text-[9px] text-neutral-300">
        {cardRevealLabel(card)}
      </p>
    </div>
  );
}

interface PlayerProfileHeaderCardProps {
  characterId: string;
  name: string;
  subtitle?: string;
  onClose?: () => void;
}

export function PlayerProfileHeaderCard({
  characterId,
  name,
  subtitle,
  onClose,
}: PlayerProfileHeaderCardProps) {
  const accent = getCharacterChatAccent(characterId);
  const [portraitSrc, setPortraitSrc] = useState(() => buildPortraitSrc(characterId));

  const fallbackPortrait = hasCharacterCard(characterId)
    ? ASSETS.cards.character(characterId)
    : ASSETS.characters.chibi(characterId);

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-4 py-5"
      style={{ background: PINSTRIPE_BG(accent) }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 opacity-40"
        style={{
          backgroundColor: accent,
          clipPath: 'polygon(0 0, 100% 0, 68% 100%, 0 88%)',
          filter: 'brightness(0.65)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-4 bottom-0 h-20 w-24 opacity-25"
        style={{
          backgroundColor: accent,
          clipPath: 'polygon(0 0, 88% 0, 58% 100%, 0 92%)',
          filter: 'brightness(0.5)',
        }}
      />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full text-neutral-700 transition hover:bg-black/10 hover:text-neutral-900"
          aria-label="Закрыть профиль"
          title="К списку игроков"
        >
          <Eye className="h-4 w-4" />
        </button>
      )}

      <div className="relative flex flex-col items-center gap-2.5 text-center">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-neutral-900/15 bg-neutral-800 shadow-md">
          <img
            src={portraitSrc}
            alt=""
            className="h-full w-full object-cover object-top"
            draggable={false}
            onError={() => setPortraitSrc(fallbackPortrait)}
          />
        </div>
        <div>
          <p className="text-base font-semibold capitalize text-neutral-900">{name}</p>
          {subtitle && (
            <p className="mt-1 text-xs leading-snug text-neutral-700">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface PlayerInspectViewProps {
  characterId: string;
  rosterPlayers?: Player[];
  onClose: () => void;
}

export function PlayerInspectView({
  characterId,
  rosterPlayers = [],
  onClose,
}: PlayerInspectViewProps) {
  const roster = rosterPlayers.find((p) => p.characterId === characterId);
  const character = getCharacterById(characterId);
  const name = roster?.name ?? character?.displayName ?? characterId;
  const age = roster?.age;
  const role = roster?.role ?? character?.role ?? '—';
  const gender = roster?.gender ?? character?.gender;

  const revealedCards = useGameStore(
    (s) => s.revealedByPlayer[characterId] ?? EMPTY_CARDS,
  );

  const subtitleParts: string[] = [];
  if (age !== undefined) subtitleParts.push(`${age} лет`);
  if (gender) subtitleParts.push(genderLabel(gender));
  if (role) subtitleParts.push(role);
  const subtitle = subtitleParts.join(' · ');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3"
      role="region"
      aria-label={`Профиль ${name}`}
    >
      <PlayerProfileHeaderCard
        characterId={characterId}
        name={name}
        subtitle={subtitle}
        onClose={onClose}
      />

      <section className="mt-4">
        <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
          Раскрытые карты
        </p>
        {revealedCards.length === 0 ? (
          <p className="rounded-xl bg-black/25 px-3 py-4 text-center text-xs text-neutral-500">
            Пока ничего не раскрыто
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {revealedCards.map((card) => (
              <MiniRevealedCard key={card.id} card={card} />
            ))}
          </div>
        )}
      </section>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-white/10 py-2 text-xs font-medium text-white transition hover:bg-white/15"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        К списку игроков
      </button>
    </motion.div>
  );
}

interface PlayerEyeButtonProps {
  playerName: string;
  onClick: () => void;
  active?: boolean;
  variant?: 'dark' | 'light';
}

export function PlayerEyeButton({
  playerName,
  onClick,
  active = false,
  variant = 'dark',
}: PlayerEyeButtonProps) {
  const tone = active
    ? 'bg-white/15 text-white'
    : variant === 'light'
      ? 'text-neutral-600 hover:bg-black/10 hover:text-neutral-900'
      : 'text-neutral-400 hover:bg-white/10 hover:text-white';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${tone}`}
      aria-label={`Смотреть профиль ${playerName}`}
      aria-pressed={active}
      title="Раскрытые карты и профиль"
    >
      <Eye className="h-4 w-4" />
    </button>
  );
}
