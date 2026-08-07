import { ASSETS, hasCharacterCard } from '@/config/assets';
import type { CardType, PlayerHandCard } from '@/types/card';

/** Map backend hand JSON → frontend cards */
export function mapBackendHandCard(raw: Record<string, unknown>): PlayerHandCard {
  const type = String(raw.type ?? 'skill') as CardType;
  const title = String(raw.title ?? '');
  const hint = raw.image_hint != null ? String(raw.image_hint) : undefined;
  let imageUrl: string | undefined;
  if (type === 'character' && hint) {
    imageUrl = hasCharacterCard(hint)
      ? ASSETS.cards.character(hint)
      : ASSETS.characters.chibi(hint);
  } else if (typeof raw.imageUrl === 'string') {
    imageUrl = raw.imageUrl;
  }
  return {
    id: String(raw.id ?? `${type}-${title}`),
    type,
    title,
    description: String(raw.description ?? ''),
    isRevealed: Boolean(raw.is_revealed ?? raw.isRevealed),
    imageUrl,
  };
}
