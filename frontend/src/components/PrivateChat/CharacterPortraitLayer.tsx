import type { SyntheticEvent } from 'react';

import { ASSETS, hasChatPortrait } from '@/config/assets';
import { getCharacterChatAccent } from '@/data/characterChatAccent';

interface CharacterPortraitLayerProps {
  characterId: string;
  portraitSrc: string;
  onPortraitError: (event: SyntheticEvent<HTMLImageElement>) => void;
}

/** Портрет + цветная геометрическая подложка в углу (за фото) */
export function CharacterPortraitLayer({
  characterId,
  portraitSrc,
  onPortraitError,
}: CharacterPortraitLayerProps) {
  const accent = getCharacterChatAccent(characterId);

  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-[2] flex items-end justify-start">
      <div
        aria-hidden
        className="absolute left-0 top-0 h-[min(48vh,480px)] w-[min(42vw,460px)]"
        style={{
          backgroundColor: accent,
          clipPath: 'polygon(0 0, 100% 0, 68% 100%, 0 88%)',
        }}
      />
      <div
        aria-hidden
        className="absolute left-0 top-0 h-[min(40vh,400px)] w-[min(34vw,360px)] opacity-35"
        style={{
          backgroundColor: accent,
          clipPath: 'polygon(0 0, 88% 0, 58% 100%, 0 92%)',
          filter: 'brightness(0.55)',
        }}
      />

      <img
        src={portraitSrc}
        alt=""
        className="relative z-10 h-full max-h-[100dvh] w-auto object-contain object-left-bottom"
        draggable={false}
        onError={onPortraitError}
      />
    </div>
  );
}

export function buildPortraitSrc(characterId: string): string {
  return hasChatPortrait(characterId)
    ? ASSETS.characters.chat(characterId)
    : ASSETS.characters.chibi(characterId);
}
