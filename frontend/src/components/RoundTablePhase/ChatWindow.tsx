import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { GlobalChatLine } from '@/types/roundTablePhase';

import { ChatMessage } from './ChatMessage';
import { RoundTimer } from './RoundTimer';

interface ChatWindowProps {
  messages: GlobalChatLine[];
  onSend?: (text: string) => void;
  placeholder?: string;
  inputDisabled?: boolean;
  timerSeconds?: number;
  timerUrgent?: boolean;
  timerTick?: boolean;
}

export function ChatWindow({
  messages,
  onSend,
  placeholder = 'Введите сообщение…',
  inputDisabled = false,
  timerSeconds = 420,
  timerUrgent = false,
  timerTick = true,
}: ChatWindowProps) {
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const submit = () => {
    if (inputDisabled) return;
    const text = draft.trim();
    if (!text) return;
    onSend?.(text);
    setDraft('');
  };

  const resolvedPlaceholder = inputDisabled ? 'ОЖИДАНИЕ ДЕЙСТВИЯ...' : placeholder;

  return (
    <div className="absolute top-1/2 left-1/2 z-[38] flex h-[44vh] w-[72%] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-green-500/20 bg-black/70 p-4 backdrop-blur-md">
      <div className="relative mb-3 shrink-0 border-b border-bunker-border/40 pb-2 pr-16">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.22em] text-bunker-neon/90">
          Глобальный канал
        </h2>
        <div className="absolute right-0 top-0 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-bunker-muted">
          <span className="opacity-60">⏱</span>
          <RoundTimer
            secondsRemaining={timerSeconds}
            isUrgent={timerUrgent}
            tick={timerTick}
            compact
          />
        </div>
      </div>

      <div
        ref={listRef}
        className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1"
      >
        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}
      </div>

      <div className="mt-3 flex shrink-0 items-center gap-3 border-t border-bunker-border/30 pt-3">
        <input
          type="text"
          value={draft}
          readOnly={inputDisabled}
          onChange={(event) => !inputDisabled && setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
          placeholder={resolvedPlaceholder}
          className={`flex-1 border-0 border-b border-bunker-border/50 bg-transparent px-0 py-2 font-mono text-sm text-bunker-text placeholder:text-bunker-muted focus:border-bunker-neon/50 focus:outline-none focus:ring-0 ${
            inputDisabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={inputDisabled}
          className="flex items-center gap-1 rounded border border-bunker-neon/30 bg-bunker-neon/5 px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-widest text-bunker-neon/80 transition hover:border-bunker-neon/60 hover:text-bunker-neon disabled:pointer-events-none disabled:opacity-30"
        >
          <Send className="h-3 w-3" />
          SEND
        </button>
      </div>
    </div>
  );
}
