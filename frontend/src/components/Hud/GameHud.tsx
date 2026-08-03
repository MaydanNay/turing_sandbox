import type { PlayerHandCard } from '@/types/card';
import { MOCK_HUD_CHAT } from '@/data/mockHud';
import type { HudChatLine } from '@/data/mockHud';
import { cardRevealLabel } from '@/utils/cardLabel';

import { GameChatPanel } from './GameChatPanel';
import { SideActionPanel } from './SideActionPanel';
import { TopVotingBar } from './TopVotingBar';

interface GameHudProps {
  visible?: boolean;
  selfId?: string;
  selfCharacterId?: string;
  selectedPlayerId?: string | null;
  isMyTurnToReveal?: boolean;
  lastRevealedCard?: PlayerHandCard | null;
  revealPlayerName?: string;
  onSelectPlayer?: (id: string) => void;
  onSendMessage?: (text: string) => void;
  onVoteEvict?: () => void;
  onSkip?: () => void;
}

function buildMessages(
  lastRevealed: PlayerHandCard | null,
  playerName: string,
): HudChatLine[] {
  if (!lastRevealed) return MOCK_HUD_CHAT;

  return [
    ...MOCK_HUD_CHAT,
    {
      id: `reveal-${lastRevealed.id}`,
      sender: 'System',
      text: `Игрок ${playerName} раскрывает карту: ${cardRevealLabel(lastRevealed)}`,
      senderColor: '#4ade80',
    },
  ];
}

export function GameHud({
  visible = true,
  selfId,
  selfCharacterId,
  selectedPlayerId,
  isMyTurnToReveal = false,
  lastRevealedCard = null,
  revealPlayerName = 'Вы',
  onSelectPlayer,
  onSendMessage,
  onVoteEvict,
  onSkip,
}: GameHudProps) {
  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <TopVotingBar
        selfId={selfId}
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={onSelectPlayer}
      />
      <GameChatPanel
        messages={buildMessages(lastRevealedCard, revealPlayerName)}
        selfId={selfCharacterId ?? selfId}
        onSend={onSendMessage}
        inputDisabled={isMyTurnToReveal}
        topOffsetClass="top-[4.5rem] sm:top-[5rem]"
      />
      <SideActionPanel onVoteEvict={onVoteEvict} onSkip={onSkip} />
    </div>
  );
}
