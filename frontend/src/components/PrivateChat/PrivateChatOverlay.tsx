import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ChatEmojiButton, insertEmojiAtCursor } from '@/components/Chat/ChatEmojiButton';
import { CHAT_PANEL_SURFACE_CLASS } from '@/components/Hud/chatPanelSurface';
import { CharacterPortraitLayer, buildPortraitSrc } from '@/components/PrivateChat/CharacterPortraitLayer';
import { RevealedCardTabs, REVEALED_CARD_PEEK_PX } from '@/components/PrivateChat/RevealedCardTabs';
import { ASSETS, hasCharacterCard, hasChatPortrait } from '@/config/assets';
import { useGameStore } from '@/store/gameStore';
import { EMPTY_CARDS } from '@/store/gameStore';
import { usePrivateChatStore, type PrivateChatMessage } from '@/store/privateChatStore';
import type { MyProfile, Player } from '@/types/game';

const EMPTY_MESSAGES: PrivateChatMessage[] = [];

/** Место под absolute «Закрыть чат» (top-4 + высота кнопки), даже когда нет вкладок карт */
const CLOSE_BUTTON_CLEARANCE_PX = 56;

function ChatAvatar({
  characterId,
  name,
}: {
  characterId: string;
  name: string;
}) {
  const [src, setSrc] = useState(() =>
    hasCharacterCard(characterId)
      ? ASSETS.cards.character(characterId)
      : ASSETS.characters.chibi(characterId),
  );

  return (
    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-neutral-700">
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

function PrivateMessageBubble({
  msg,
  partner,
  myProfile,
}: {
  msg: PrivateChatMessage;
  partner: Player;
  myProfile?: MyProfile | null;
}) {
  if (msg.from === 'me') {
    const myName = myProfile?.name ?? 'Вы';
    const myCharacterId = myProfile?.characterId ?? 'vance';

    return (
      <div className="flex justify-end gap-3">
        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed text-neutral-900">{msg.text}</p>
          <p className="mt-1.5 text-right text-xs text-neutral-400">{msg.timestamp}</p>
        </div>
        <ChatAvatar characterId={myCharacterId} name={myName} />
      </div>
    );
  }

  return (
    <div className="flex items-start justify-start gap-3">
      <ChatAvatar characterId={partner.characterId} name={partner.name} />
      <div className="relative min-w-0 max-w-[75%]">
        <p className="mb-1 pl-1 text-sm font-semibold capitalize leading-none text-white">
          {partner.name}
        </p>
        <div className="relative rounded-2xl rounded-bl-md bg-white px-4 py-2.5 shadow-sm">
          <p className="text-sm leading-relaxed text-neutral-900">{msg.text}</p>
          <p className="mt-1.5 text-right text-xs text-neutral-400">{msg.timestamp}</p>
        </div>
      </div>
    </div>
  );
}

interface PrivateChatOverlayProps {
  player: Player | null;
  myProfile?: MyProfile | null;
  onSendPrivate?: (agentId: string, partnerName: string, text: string) => void;
  onClose: () => void;
}

export function PrivateChatOverlay({
  player,
  myProfile,
  onSendPrivate,
  onClose,
}: PrivateChatOverlayProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const ensureThread = usePrivateChatStore((s) => s.ensureThread);
  const sendMessage = usePrivateChatStore((s) => s.sendMessage);
  const setActivePartner = usePrivateChatStore((s) => s.setActivePartner);
  const threadMessages = usePrivateChatStore((s) =>
    player ? s.threads[player.id] : undefined,
  );
  const partnerTyping = usePrivateChatStore((s) =>
    player ? Boolean(s.typingByPartner[player.id]) : false,
  );
  const messages = threadMessages ?? EMPTY_MESSAGES;

  useEffect(() => {
    if (!player) {
      setActivePartner(null);
      return;
    }

    ensureThread(player.id, player.name);
    setActivePartner(player.id);
    setDraft('');

    return () => setActivePartner(null);
  }, [player, ensureThread, setActivePartner]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, partnerTyping, player]);

  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  const submit = () => {
    if (!player) return;
    const text = draft.trim();
    if (!text) return;
    if (onSendPrivate) {
      onSendPrivate(player.id, player.name, text);
    } else {
      sendMessage(player.id, player.name, text);
    }
    setDraft('');
  };

  const portraitSrc = player ? buildPortraitSrc(player.characterId) : ASSETS.characters.default;

  const partnerCharacterId = player?.characterId;
  const revealedForPartner = useGameStore((s) =>
    partnerCharacterId
      ? (s.revealedByPlayer[partnerCharacterId] ?? EMPTY_CARDS)
      : EMPTY_CARDS,
  );
  const hasRevealedCards = revealedForPartner.length > 0;

  return (
    <AnimatePresence>
      {player && (
        <motion.div
          className="fixed inset-0 z-50 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal
          aria-label={`Приватный чат с ${player.name}`}
        >
          <div
            className="pointer-events-none absolute inset-0 bg-black/10 backdrop-blur-[24px]"
            aria-hidden
          />

          <CharacterPortraitLayer
            characterId={player.characterId}
            portraitSrc={portraitSrc}
            onPortraitError={(e) => {
              const img = e.target as HTMLImageElement;
              if (hasChatPortrait(player.characterId) && img.dataset.fallback !== 'chibi') {
                img.dataset.fallback = 'chibi';
                img.src = ASSETS.characters.chibi(player.characterId);
              } else {
                img.src = ASSETS.characters.default;
              }
            }}
          />

          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-[3] rounded-md border-2 border-red-500/70 bg-red-950/40 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-red-400 transition hover:bg-red-500/20 hover:text-red-300 sm:right-6 sm:top-6"
          >
            Закрыть чат
          </button>

          <div className="absolute bottom-4 left-4 right-4 top-4 z-[2] sm:top-6 sm:right-6">
            <div className="relative flex h-full w-full flex-col pl-[min(32vw,380px)]">
              <div className="relative flex min-h-0 w-full flex-1 flex-col">
                <RevealedCardTabs characterId={player.characterId} />

                <div
                  className={`relative z-10 flex w-full min-h-0 flex-1 flex-col ${CHAT_PANEL_SURFACE_CLASS} p-4 shadow-2xl sm:p-5`}
                  style={{
                    marginTop: hasRevealedCards
                      ? Math.max(REVEALED_CARD_PEEK_PX, CLOSE_BUTTON_CLEARANCE_PX)
                      : CLOSE_BUTTON_CLEARANCE_PX,
                  }}
                >
                  <p className="mb-4 pr-28 font-display text-lg font-semibold text-white sm:pr-32">
                    Кулуары · {player.name}
                  </p>

                  <div
                    ref={listRef}
                    className="custom-scrollbar flex flex-1 flex-col gap-4 overflow-y-auto pr-1"
                  >
                    {messages.map((msg) => (
                      <PrivateMessageBubble
                        key={msg.id}
                        msg={msg}
                        partner={player}
                        myProfile={myProfile}
                      />
                    ))}
                    {partnerTyping && (
                      <p className="pl-1 font-mono text-xs tracking-wide text-bunker-neon animate-pulse">
                        {player.name} печатает...
                      </p>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2 rounded-full bg-white px-3 py-2.5 shadow-inner sm:px-4">
                    <ChatEmojiButton
                      inputRef={inputRef}
                      onPick={(emoji) => {
                        setDraft((prev) =>
                          insertEmojiAtCursor(prev, emoji, inputRef.current),
                        );
                      }}
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submit()}
                      placeholder="Отправить сообщение ..."
                      className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={submit}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-neutral-800"
                      aria-label="Отправить"
                    >
                      <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
