import { ArrowUp, Paperclip } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ASSETS, hasCharacterCard } from '@/config/assets';
import { MOCK_HUD_CHAT, MOCK_HUD_PLAYERS, type HudChatLine } from '@/data/mockHud';

interface GameChatPanelProps {
  messages?: HudChatLine[];
  selfId?: string;
  onSend?: (text: string) => void;
  inputDisabled?: boolean;
  placeholder?: string;
  topOffsetClass?: string;
}

function isOwnMessage(msg: HudChatLine): boolean {
  return msg.sender === 'Вы';
}

function isSystemMessage(msg: HudChatLine): boolean {
  return msg.sender === 'System';
}

function resolveCharacterId(sender: string, selfId?: string): string | null {
  if (sender === 'Вы') return selfId ?? null;
  if (sender === 'System') return null;
  const match = MOCK_HUD_PLAYERS.find(
    (player) => player.name.toLowerCase() === sender.toLowerCase(),
  );
  return match?.id ?? sender.toLowerCase();
}

function ChatAvatar({ sender, selfId }: { sender: string; selfId?: string }) {
  const characterId = resolveCharacterId(sender, selfId);
  const [src, setSrc] = useState(() => {
    if (!characterId) return null;
    return hasCharacterCard(characterId)
      ? ASSETS.cards.character(characterId)
      : ASSETS.characters.chibi(characterId);
  });

  useEffect(() => {
    if (!characterId) {
      setSrc(null);
      return;
    }
    setSrc(
      hasCharacterCard(characterId)
        ? ASSETS.cards.character(characterId)
        : ASSETS.characters.chibi(characterId),
    );
  }, [characterId]);

  if (!characterId || !src) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#4a4a4a] text-xs font-semibold text-neutral-200">
        {sender === 'System' ? '⚙' : sender.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-neutral-800">
      <img
        src={src}
        alt=""
        className="h-full w-full object-cover object-top"
        draggable={false}
        onError={() => setSrc(ASSETS.characters.chibi(characterId))}
      />
    </div>
  );
}

export function GameChatPanel({
  messages: externalMessages,
  selfId,
  onSend,
  inputDisabled = false,
  placeholder = 'Отправить сообщение...',
  topOffsetClass = 'top-[4.5rem] sm:top-[5rem]',
}: GameChatPanelProps) {
  const [internalMessages, setInternalMessages] = useState<HudChatLine[]>(MOCK_HUD_CHAT);
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const messages = externalMessages ?? internalMessages;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (inputDisabled) return;
    const text = draft.trim();
    if (!text) return;

    const line: HudChatLine = {
      id: `local-${Date.now()}`,
      sender: 'Вы',
      text,
      senderColor: '#facc15',
    };

    if (!externalMessages) {
      setInternalMessages((prev) => [...prev, line]);
    }
    onSend?.(text);
    setDraft('');
  };

  return (
    <div
      className={`pointer-events-auto absolute bottom-28 left-4 flex ${topOffsetClass} w-[min(540px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] flex-col`}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl bg-[#2C2C2C] p-5 shadow-2xl sm:p-6">
        <p className="mb-4 font-display text-lg font-semibold text-white">Общий чат</p>

        <div
          ref={listRef}
          className="custom-scrollbar flex flex-1 flex-col gap-3 overflow-y-auto pr-1"
        >
          {messages.map((msg) => {
            if (isOwnMessage(msg)) {
              return (
                <div key={msg.id} className="flex items-end justify-end gap-2">
                  <div className="max-w-[78%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm text-neutral-900 shadow-sm">
                    {msg.text}
                  </div>
                  <ChatAvatar sender={msg.sender} selfId={selfId} />
                </div>
              );
            }

            if (isSystemMessage(msg)) {
              return (
                <div key={msg.id} className="flex justify-center px-2">
                  <p
                    className="text-center text-xs leading-relaxed"
                    style={{ color: msg.senderColor ?? '#a3a3a3' }}
                  >
                    {msg.text}
                  </p>
                </div>
              );
            }

            return (
              <div key={msg.id} className="flex items-end gap-2">
                <ChatAvatar sender={msg.sender} selfId={selfId} />
                <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-[#3a3a3a] px-4 py-2.5 text-sm text-neutral-100 shadow-sm">
                  {msg.text}
                </div>
              </div>
            );
          })}
        </div>

        <div
          className={`mt-4 flex items-center gap-3 rounded-2xl bg-white px-4 py-2 shadow-inner ${
            inputDisabled ? 'opacity-40' : ''
          }`}
        >
          <button
            type="button"
            disabled={inputDisabled}
            className="text-neutral-400 transition hover:text-neutral-600 disabled:cursor-not-allowed"
            aria-label="Прикрепить файл"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={draft}
            readOnly={inputDisabled}
            onChange={(e) => !inputDisabled && setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder={inputDisabled ? 'Ожидание действия...' : placeholder}
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
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed"
            aria-label="Отправить"
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
