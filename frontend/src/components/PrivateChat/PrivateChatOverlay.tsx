import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { CharacterPortraitLayer, buildPortraitSrc } from '@/components/PrivateChat/CharacterPortraitLayer';
import { RevealedCardTabs, REVEALED_CARD_PEEK_PX } from '@/components/PrivateChat/RevealedCardTabs';
import { ASSETS, hasChatPortrait } from '@/config/assets';
import { getRevealedCardsForPlayer } from '@/data/mockPlayerHands';
import type { Player } from '@/types/game';

interface PrivateMessage {
  id: string;
  from: 'me' | 'them';
  text: string;
}

function mockMessages(partnerName: string): PrivateMessage[] {
  return [
    { id: '1', from: 'them', text: `Привет. Это ${partnerName}. Нужно поговорить без лишних ушей.` },
    { id: '2', from: 'me', text: 'Слушаю. Что ты знаешь о последнем инциденте?' },
    { id: '3', from: 'them', text: 'Вентиляция в секторе C работала на обратной тяге. Это не случайность.' },
    { id: '4', from: 'me', text: 'Ты уверен? Кто ещё мог это видеть?' },
    { id: '5', from: 'them', text: 'Пока только я. Но логи терминала кто-то уже подчистил.' },
    { id: '6', from: 'me', text: 'Хорошо. Держи это между нами до голосования.' },
  ];
}

interface PrivateChatOverlayProps {
  player: Player | null;
  onClose: () => void;
}

export function PrivateChatOverlay({ player, onClose }: PrivateChatOverlayProps) {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!player) return;
    setMessages(mockMessages(player.name));
    setDraft('');
  }, [player]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, player]);

  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: `local-${Date.now()}`, from: 'me', text }]);
    setDraft('');
  };

  const portraitSrc = player ? buildPortraitSrc(player.characterId) : ASSETS.characters.default;

  const hasRevealedCards =
    player !== null && getRevealedCardsForPlayer(player.characterId).length > 0;

  return (
    <AnimatePresence>
      {player && (
        <motion.div
          className="fixed inset-0 z-50 overflow-hidden bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="dialog"
          aria-modal
          aria-label={`Приватный чат с ${player.name}`}
        >
          {/* Кнопка закрытия — верхний правый угол */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-6 top-6 z-[3] rounded-md border-2 border-red-500/70 bg-red-950/40 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-red-400 transition hover:bg-red-500/20 hover:text-red-300"
          >
            Закрыть чат
          </button>

          {/* Слой 1: чат — на всю ширину от left-6 до right-6 (как кнопка закрытия) */}
          <div className="absolute inset-x-6 bottom-10 z-[1] h-[72vh]">
            <div className="relative flex h-full w-full flex-col pl-[min(32vw,380px)] pr-6 -translate-x-1 lg:-translate-x-2">
              <div className="relative flex min-h-0 w-full flex-1 flex-col">
                {player && <RevealedCardTabs characterId={player.characterId} />}

                {/* Окно чата — поверх карт, перекрывает их нижнюю часть */}
                <div
                  className="relative z-10 flex w-full min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[#2C2C2C] p-6 shadow-2xl"
                  style={{ marginTop: hasRevealedCards ? REVEALED_CARD_PEEK_PX : 0 }}
                >
                <p className="mb-4 font-display text-lg font-semibold text-white">
                  Кулуары · {player.name}
                </p>

                <div
                  ref={listRef}
                  className="custom-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pr-1"
                >
                  {messages.map((msg) =>
                    msg.from === 'me' ? (
                      <div key={msg.id} className="flex justify-end">
                        <div className="max-w-[75%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm">
                          {msg.text}
                        </div>
                      </div>
                    ) : (
                      <div key={msg.id} className="flex justify-start">
                        <div className="max-w-[75%] rounded-2xl rounded-bl-md bg-[#3a3a3a] px-4 py-2.5 text-sm text-neutral-100 shadow-sm">
                          {msg.text}
                        </div>
                      </div>
                    ),
                  )}
                </div>

                {/* Поле ввода */}
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-inner">
                  <button
                    type="button"
                    className="text-neutral-400 transition hover:text-neutral-600"
                    aria-label="Прикрепить файл"
                  >
                    <Paperclip className="h-5 w-5" />
                  </button>
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submit()}
                    placeholder="Отправить сообщение..."
                    className="min-w-0 flex-1 bg-transparent py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={submit}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-neutral-800"
                    aria-label="Отправить"
                  >
                    <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                </div>
              </div>
            </div>
          </div>

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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
