import { useCallback, useEffect, useState } from 'react';

import {
  MOCK_GLOBAL_CHAT,
  MOCK_ROUND_SECONDS,
  MOCK_VOTE_BAR_PLAYERS,
} from '@/data/mockRoundTablePhase';
import type { PlayerHandCard } from '@/types/card';
import type { GlobalChatLine } from '@/types/roundTablePhase';
import { cardRevealLabel } from '@/utils/cardLabel';

import { ChatWindow } from './ChatWindow';
import { SideActions } from './SideActions';
import { TopBar } from './TopBar';

interface RoundTablePhaseProps {
  visible?: boolean;
  isMyTurnToReveal?: boolean;
  lastRevealedCard?: PlayerHandCard | null;
  revealPlayerName?: string;
  onVoteEvict?: () => void;
  onSkip?: () => void;
  onSendMessage?: (text: string) => void;
}

export function RoundTablePhase({
  visible = true,
  isMyTurnToReveal = false,
  lastRevealedCard = null,
  revealPlayerName = 'Вы',
  onVoteEvict,
  onSkip,
  onSendMessage,
}: RoundTablePhaseProps) {
  const [messages, setMessages] = useState<GlobalChatLine[]>(MOCK_GLOBAL_CHAT);
  const [profilePlayerId, setProfilePlayerId] = useState<string | null>(null);

  useEffect(() => {
    if (!lastRevealedCard) return;

    const line: GlobalChatLine = {
      id: `reveal-${lastRevealedCard.id}-${Date.now()}`,
      type: 'system_reveal',
      sender: 'Система',
      text: '',
      playerName: revealPlayerName,
      cardTitle: cardRevealLabel(lastRevealedCard),
    };
    setMessages((prev) => [...prev, line]);
  }, [lastRevealedCard, revealPlayerName]);

  const handleSend = useCallback(
    (text: string) => {
      const line: GlobalChatLine = {
        id: `local-${Date.now()}`,
        sender: 'Вы',
        text,
        senderColor: '#39ff14',
      };
      setMessages((prev) => [...prev, line]);
      onSendMessage?.(text);
    },
    [onSendMessage],
  );

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[39]">
      <TopBar
        players={MOCK_VOTE_BAR_PLAYERS}
        selectedPlayerId={profilePlayerId}
        onSelectPlayer={setProfilePlayerId}
      />
      <ChatWindow
        messages={messages}
        onSend={handleSend}
        inputDisabled={isMyTurnToReveal}
        timerSeconds={MOCK_ROUND_SECONDS}
        timerTick
      />
      <SideActions onVoteEvict={onVoteEvict} onSkip={onSkip} />
    </div>
  );
}
