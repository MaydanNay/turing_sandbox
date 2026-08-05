import { ArrowUp } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { RevealCardThumb } from '@/components/Hand/RevealCardThumb';
import { GameProcessPanel } from '@/components/Hud/GameProcessPanel';
import { PlayerEyeButton, PlayerInspectView } from '@/components/Hud/PlayerInspectPanel';
import { RevealTurnPanel } from '@/components/Hud/RevealTurnPanel';
import { ASSETS, hasCharacterCard } from '@/config/assets';
import type { HudChatLine, HudPlayerSlot } from '@/data/mockHud';
import type { PlayerHandCard } from '@/types/card';
import type { GamePhase, MyProfile, Player } from '@/types/game';
import { resolveSenderCharacterId } from '@/utils/chatAdapter';

interface GameChatPanelProps {
  messages: HudChatLine[];
  players: HudPlayerSlot[];
  rosterPlayers?: Player[];
  myProfile?: MyProfile | null;
  selfId?: string;
  onSend?: (text: string) => void;
  inputDisabled?: boolean;
  placeholder?: string;
  topOffsetClass?: string;
  typing?: string[];
  gamePhase?: GamePhase;
  revealPlayer?: HudPlayerSlot | null;
  isMyRevealTurn?: boolean;
  gatheredAtTable?: boolean;
  handCards?: PlayerHandCard[];
  onRevealCard?: (cardId: string) => void;
}

function PlayerAvatar({
  characterId,
  name,
  size = 'md',
}: {
  characterId: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const [src, setSrc] = useState(() =>
    hasCharacterCard(characterId)
      ? ASSETS.cards.character(characterId)
      : ASSETS.characters.chibi(characterId),
  );

  const sizeClass =
    size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-10 w-10' : 'h-12 w-12';

  return (
    <div className={`${sizeClass} shrink-0 overflow-hidden rounded-full bg-neutral-700`}>
      <img
        src={src}
        alt={name}
        className="h-full w-full object-cover object-top"
        draggable={false}
        onError={() => setSrc(ASSETS.characters.chibi(characterId))}
      />
    </div>
  );
}

function ChatAvatar({
  sender,
  selfId,
  rosterPlayers,
  myProfile,
}: {
  sender: string;
  selfId?: string;
  rosterPlayers?: Player[];
  myProfile?: MyProfile | null;
}) {
  const characterId = resolveSenderCharacterId(
    sender,
    rosterPlayers ?? [],
    myProfile,
  ) ?? (sender === 'Вы' ? selfId : null);

  if (!characterId) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-neutral-600 text-sm font-semibold text-white">
        {sender.charAt(0)}
      </div>
    );
  }
  return <PlayerAvatar characterId={characterId} name={sender} />;
}

function PlayerSidebarRow({
  player,
  dimmed,
  highlighted,
  onInspect,
}: {
  player: HudPlayerSlot;
  dimmed?: boolean;
  highlighted?: boolean;
  onInspect: (characterId: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 px-4 py-3 ${
        dimmed ? 'opacity-40' : highlighted ? 'bg-white/[0.06]' : ''
      }`}
    >
      <PlayerAvatar characterId={player.id} name={player.name} size="sm" />
      <span className="min-w-0 flex-1 truncate text-base font-medium capitalize text-white/90">
        {player.name}
      </span>
      <PlayerEyeButton
        playerName={player.name}
        onClick={() => onInspect(player.id)}
      />
    </div>
  );
}

function PlayerSidebar({
  players,
  revealPlayer,
  gamePhase = 'INIT',
  isMyRevealTurn = false,
  gatheredAtTable = true,
  inspectCharacterId,
  rosterPlayers,
  onInspect,
}: {
  players: HudPlayerSlot[];
  revealPlayer?: HudPlayerSlot | null;
  gamePhase?: GamePhase;
  isMyRevealTurn?: boolean;
  gatheredAtTable?: boolean;
  inspectCharacterId?: string | null;
  rosterPlayers?: Player[];
  onInspect: (characterId: string) => void;
}) {
  const handleInspect = (characterId: string) => {
    onInspect(inspectCharacterId === characterId ? '' : characterId);
  };

  return (
    <aside className="flex w-[min(240px,28vw)] shrink-0 flex-col overflow-hidden rounded-3xl bg-[#2C2C2C] sm:w-[260px]">
      <GameProcessPanel
        phase={gamePhase}
        revealPlayer={revealPlayer}
        isMyRevealTurn={isMyRevealTurn}
        gatheredAtTable={gatheredAtTable}
      />

      <AnimatePresence mode="wait">
        {inspectCharacterId ? (
          <PlayerInspectView
            key={inspectCharacterId}
            characterId={inspectCharacterId}
            rosterPlayers={rosterPlayers}
            onClose={() => onInspect('')}
          />
        ) : (
          <motion.div
            key="player-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="custom-scrollbar flex-1 overflow-y-auto pb-3"
          >
            {players.map((player, index) => (
              <div key={player.id}>
                {index > 0 && <div className="mx-4 border-t border-white/10" />}
                <PlayerSidebarRow
                  player={player}
                  dimmed={player.status === 'dead'}
                  highlighted={player.isActive}
                  onInspect={handleInspect}
                />
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}

function MessageBubble({
  msg,
  selfId,
  rosterPlayers,
  myProfile,
}: {
  msg: HudChatLine;
  selfId?: string;
  rosterPlayers?: Player[];
  myProfile?: MyProfile | null;
}) {
  return (
    <div className="flex gap-3">
      <ChatAvatar
        sender={msg.sender}
        selfId={selfId}
        rosterPlayers={rosterPlayers}
        myProfile={myProfile}
      />
      <div className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-3 shadow-sm">
        <p className="text-sm font-semibold capitalize text-neutral-900">{msg.sender}</p>
        <p className="mt-1 text-sm leading-relaxed text-neutral-800">{msg.text}</p>
        {msg.timestamp && (
          <p className="mt-2 text-right text-xs text-neutral-400">{msg.timestamp}</p>
        )}
      </div>
    </div>
  );
}

function TurnNotice({ msg }: { msg: HudChatLine }) {
  return (
    <p
      className="py-2 text-center text-sm font-medium"
      style={{ color: msg.senderColor ?? '#2dd4bf' }}
    >
      {msg.text}
    </p>
  );
}

function RevealBanner({
  msg,
  selfId,
  rosterPlayers,
  myProfile,
}: {
  msg: HudChatLine;
  selfId?: string;
  rosterPlayers?: Player[];
  myProfile?: MyProfile | null;
}) {
  return (
    <div className="relative overflow-visible rounded-2xl bg-[#F5E6A8] px-4 py-4 pr-[7.5rem] shadow-sm">
      <div className="flex items-center gap-3">
        <ChatAvatar
          sender={msg.sender}
          selfId={selfId}
          rosterPlayers={rosterPlayers}
          myProfile={myProfile}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">{msg.text}</p>
          {msg.subtitle && (
            <p className="mt-1 text-sm text-neutral-700">{msg.subtitle}</p>
          )}
        </div>
      </div>
      {msg.cardTitle && (
        <RevealCardThumb
          type={msg.cardType ?? 'skill'}
          title={msg.cardTitle}
          description={msg.cardDescription ?? msg.subtitle}
          imageUrl={msg.cardImageUrl}
        />
      )}
    </div>
  );
}

export function GameChatPanel({
  messages,
  players,
  rosterPlayers,
  myProfile,
  selfId,
  onSend,
  inputDisabled = false,
  placeholder = 'Отправить сообщение ...',
  topOffsetClass = 'top-12 sm:top-14',
  typing = [],
  gamePhase = 'PITCH',
  revealPlayer = null,
  isMyRevealTurn = false,
  gatheredAtTable = true,
  handCards = [],
  onRevealCard,
}: GameChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [inspectCharacterId, setInspectCharacterId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const activeTypers = typing.filter(
    (name) => myProfile?.name !== name && name.length > 0,
  );

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, activeTypers.join(',')]);

  const submit = () => {
    if (inputDisabled) return;
    const text = draft.trim();
    if (!text) return;
    onSend?.(text);
    setDraft('');
  };

  const handleInspect = (characterId: string) => {
    setInspectCharacterId(characterId || null);
  };

  return (
    <div
      className={`pointer-events-auto absolute bottom-4 left-4 right-20 flex ${topOffsetClass} min-w-0 gap-4`}
    >
      <PlayerSidebar
        players={players}
        revealPlayer={revealPlayer}
        gamePhase={gamePhase}
        isMyRevealTurn={isMyRevealTurn}
        gatheredAtTable={gatheredAtTable}
        inspectCharacterId={inspectCharacterId}
        rosterPlayers={rosterPlayers}
        onInspect={handleInspect}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[#2C2C2C] p-4 shadow-2xl sm:p-5">
        <div
          ref={listRef}
          className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto pr-1"
        >
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-neutral-500">
              Сообщений пока нет. Напишите первым.
            </p>
          )}
          {messages.map((msg) => {
            if (msg.kind === 'turn' || msg.kind === 'system') {
              return <TurnNotice key={msg.id} msg={msg} />;
            }
            if (msg.kind === 'reveal') {
              return (
                <RevealBanner
                  key={msg.id}
                  msg={msg}
                  selfId={selfId}
                  rosterPlayers={rosterPlayers}
                  myProfile={myProfile}
                />
              );
            }
            return (
              <MessageBubble
                key={msg.id}
                msg={msg}
                selfId={selfId}
                rosterPlayers={rosterPlayers}
                myProfile={myProfile}
              />
            );
          })}
        </div>

        {activeTypers.length > 0 && (
          <p className="mt-2 px-1 text-xs text-neutral-400">
            {activeTypers.join(', ')} печатает...
          </p>
        )}

        {isMyRevealTurn && onRevealCard && (
          <RevealTurnPanel cards={handCards} onRevealCard={onRevealCard} />
        )}

        <div
          className={`mt-3 flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-inner ${
            inputDisabled ? 'opacity-40' : ''
          }`}
        >
          <input
            type="text"
            value={draft}
            readOnly={inputDisabled}
            onChange={(e) => !inputDisabled && setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={
              isMyRevealTurn
                ? 'Сначала раскройте карту...'
                : inputDisabled
                  ? 'Ожидание действия...'
                  : placeholder
            }
            className={`min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-900 focus:outline-none ${
              inputDisabled
                ? 'cursor-not-allowed placeholder:text-neutral-400/40'
                : 'placeholder:text-neutral-400'
            }`}
          />
          <button
            type="button"
            onClick={submit}
            disabled={inputDisabled}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed"
            aria-label="Отправить"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
