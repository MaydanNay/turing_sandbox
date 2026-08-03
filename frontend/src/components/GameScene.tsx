import {
  FileText,
  Radio,
  Shield,
  SlidersHorizontal,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ActionBar } from '@/components/ActionBar';
import { ChatBox } from '@/components/ChatBox';
import { BottomHand } from '@/components/Hand';
import { GameHud } from '@/components/Hud';
import { HudFab, PanelOverlay } from '@/components/PanelOverlay';
import { PrivateChatOverlay } from '@/components/PrivateChat';
import { RoundTable } from '@/components/RoundTable';
import { MOCK_HAND_CARDS } from '@/data/mockHand';
import { genderLabel } from '@/data/characters';
import type { PlayerHandCard } from '@/types/card';
import type { ChatMessage, GamePhase, MyProfile, Player, TypingIndicator } from '@/types/game';

type OpenPanel = 'chat' | 'dossier' | 'actions' | null;

interface GameSceneProps {
  gameState: GamePhase;
  players: Player[];
  gatheredAtTable: boolean;
  onGatherAtTable: () => void;
  chat: ChatMessage[];
  typing: TypingIndicator[];
  myProfile: MyProfile | null;
  connected: boolean;
  roomId: string | null;
  clientId: string | null;
  mockMode: boolean;
  selectedPlayerId: string | null;
  onSelectPlayer: (id: string) => void;
  onSendChat: (text: string) => void;
  onPitch: (text: string) => void;
  onVote: (targetId: string) => void;
  onAdvancePhase?: () => void;
  onMockPhase?: () => void;
}

export function GameScene({
  gameState,
  players,
  gatheredAtTable,
  onGatherAtTable,
  chat,
  typing,
  myProfile,
  connected,
  roomId,
  clientId,
  mockMode,
  selectedPlayerId,
  onSelectPlayer,
  onSendChat,
  onPitch,
  onVote,
  onAdvancePhase,
  onMockPhase,
}: GameSceneProps) {
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [handCards, setHandCards] = useState<PlayerHandCard[]>(MOCK_HAND_CARDS);
  const [isMyTurnToReveal, setIsMyTurnToReveal] = useState(false);
  const [lastRevealedCard, setLastRevealedCard] = useState<PlayerHandCard | null>(null);
  const [privateChatPlayerId, setPrivateChatPlayerId] = useState<string | null>(null);
  const wasGatheredRef = useRef(false);

  const privateChatPlayer =
    players.find((p) => p.id === privateChatPlayerId) ?? null;

  useEffect(() => {
    if (gatheredAtTable && !wasGatheredRef.current) {
      wasGatheredRef.current = true;
      setIsMyTurnToReveal(true);
    }
    if (!gatheredAtTable) {
      wasGatheredRef.current = false;
      setIsMyTurnToReveal(false);
      setLastRevealedCard(null);
    }
  }, [gatheredAtTable]);

  const toggle = (panel: OpenPanel) => {
    setOpenPanel((cur) => (cur === panel ? null : panel));
  };

  const handleGatherAtTable = useCallback(() => {
    onGatherAtTable();
    setIsMyTurnToReveal(true);
    setLastRevealedCard(null);
  }, [onGatherAtTable]);

  const handleRevealCard = useCallback(
    (cardId: string) => {
      if (!isMyTurnToReveal) return;

      const card = handCards.find((c) => c.id === cardId);
      if (!card || card.isRevealed) return;

      const revealed = { ...card, isRevealed: true };
      setHandCards((prev) => prev.map((c) => (c.id === cardId ? revealed : c)));
      setLastRevealedCard(revealed);
      setIsMyTurnToReveal(false);
    },
    [handCards, isMyTurnToReveal],
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-bunker-text">
      {/* Локация на весь экран */}
      <RoundTable
        players={players}
        gatheredAtTable={gatheredAtTable}
        onGatherAtTable={handleGatherAtTable}
        selfId={clientId ?? myProfile?.id}
        selectedPlayerId={selectedPlayerId}
        onSelectPlayer={onSelectPlayer}
        onOpenPrivateChat={setPrivateChatPlayerId}
      />

      <PrivateChatOverlay
        player={privateChatPlayer}
        onClose={() => setPrivateChatPlayerId(null)}
      />

      {/* Лёгкий scanline */}
      <div className="pointer-events-none absolute inset-0 z-[35] bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.08)_50%)] bg-[length:100%_4px] opacity-25" />

      {/* Мини-HUD: фаза + статус */}
      <div
        className={`absolute left-4 z-[36] flex flex-wrap items-center gap-2 ${gatheredAtTable ? 'top-[5.25rem]' : 'top-4'}`}
      >
        {!gatheredAtTable && (
          <span className="rounded-full border border-bunker-amber/60 bg-black/45 px-3 py-1 font-mono text-[10px] text-bunker-amber backdrop-blur-md">
            Нажмите на стол
          </span>
        )}
        <span className="rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bunker-neon backdrop-blur-md">
          {gameState}
        </span>
        <span className="flex items-center gap-1 rounded-full border border-bunker-border/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md">
          {connected ? (
            <Wifi className="h-3 w-3 text-bunker-neon" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          {connected ? 'LIVE' : mockMode ? 'MOCK' : 'OFF'}
        </span>
        {roomId && (
          <span className="hidden rounded-full border border-bunker-border/70 bg-black/45 px-2.5 py-1 font-mono text-[10px] text-bunker-muted backdrop-blur-md sm:inline">
            {roomId.slice(0, 8)}
          </span>
        )}
      </div>

      {/* Рука игрока — 6 карт */}
      <BottomHand
        cards={handCards}
        revealMode={gatheredAtTable && isMyTurnToReveal}
        onRevealCard={handleRevealCard}
      />

      <GameHud
        visible={gatheredAtTable}
        selfId={clientId ?? undefined}
        selfCharacterId={myProfile?.characterId}
        selectedPlayerId={selectedPlayerId}
        isMyTurnToReveal={isMyTurnToReveal}
        lastRevealedCard={lastRevealedCard}
        revealPlayerName={myProfile?.name ?? 'Вы'}
        onSelectPlayer={onSelectPlayer}
        onSendMessage={onSendChat}
        onVoteEvict={() => {
          if (selectedPlayerId) onVote(selectedPlayerId);
        }}
      />

      {/* Кнопки HUD — открывают панели */}
      <div className="absolute bottom-6 right-4 z-[36] flex flex-col gap-3 sm:bottom-8 sm:right-6">
        <HudFab
          label="Канал связи"
          icon={<Radio className="h-5 w-5" />}
          onClick={() => toggle('chat')}
          active={openPanel === 'chat'}
          badge={openPanel === 'chat' ? undefined : chat.length}
        />
        <HudFab
          label="Досье"
          icon={<FileText className="h-5 w-5" />}
          onClick={() => toggle('dossier')}
          active={openPanel === 'dossier'}
        />
        <HudFab
          label="Действия"
          icon={<SlidersHorizontal className="h-5 w-5" />}
          onClick={() => toggle('actions')}
          active={openPanel === 'actions'}
        />
      </div>

      {/* Панель: чат */}
      <PanelOverlay
        open={openPanel === 'chat'}
        title="Канал связи"
        onClose={() => setOpenPanel(null)}
      >
        <ChatBox messages={chat} typing={typing} className="h-full min-h-[50vh] border-0 shadow-none" />
      </PanelOverlay>

      {/* Панель: досье */}
      <PanelOverlay
        open={openPanel === 'dossier'}
        title="Досье"
        onClose={() => setOpenPanel(null)}
      >
        {myProfile ? (
          <div className="space-y-4 font-mono text-sm">
            <div className="rounded-xl border border-bunker-border bg-bunker-bg/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-bunker-neon">
                <Shield className="h-4 w-4" />
                <span className="font-display text-base font-semibold text-bunker-text">
                  {myProfile.name}
                </span>
              </div>
              <ul className="space-y-1 text-bunker-text">
                <li>Пол: {genderLabel(myProfile.gender)}</li>
                <li className="text-bunker-neon">Возраст: {myProfile.age} (только вы)</li>
                <li className="text-bunker-muted">{myProfile.role}</li>
              </ul>
            </div>
            <div className="rounded-xl border border-bunker-border bg-bunker-bg/60 p-4">
              <p className="mb-2 text-bunker-muted">Инвентарь</p>
              <ul className="space-y-0.5">
                {myProfile.inventory.length > 0 ? (
                  myProfile.inventory.map((item) => <li key={item}>• {item}</li>)
                ) : (
                  <li className="text-bunker-muted">Пусто</li>
                )}
              </ul>
            </div>
          </div>
        ) : (
          <p className="font-mono text-sm text-bunker-muted">Нет данных профиля</p>
        )}
      </PanelOverlay>

      {/* Панель: действия */}
      <PanelOverlay
        open={openPanel === 'actions'}
        title="Действия"
        onClose={() => setOpenPanel(null)}
        side="bottom"
      >
        <ActionBar
          gameState={gameState}
          connected={connected}
          selectedPlayerId={selectedPlayerId}
          onSendChat={onSendChat}
          onPitch={onPitch}
          onVote={onVote}
          onAdvancePhase={onAdvancePhase}
          mockMode={mockMode}
          onMockPhase={onMockPhase}
        />
      </PanelOverlay>
    </div>
  );
}
