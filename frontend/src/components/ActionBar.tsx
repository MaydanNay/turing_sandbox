import { Megaphone, MessageSquare, Send, Vote } from 'lucide-react';
import { useState } from 'react';

import { mapFrontendPhase } from '@/config/env';
import { MATCH_PHASE_ORDER } from '@/data/gamePhaseConfig';
import { getPhaseMeta } from '@/data/gamePhaseConfig';
import type { GamePhase } from '@/types/game';

function canSpeak(phase: GamePhase): boolean {
  const format = getPhaseMeta(phase).format;
  return format === 'table';
}

function canVote(phase: GamePhase): boolean {
  return phase === 'VOTE' || phase === 'CONFLICT' || phase === 'REVISION' || phase === 'TURING';
}

interface ActionBarProps {
  gameState: GamePhase;
  connected: boolean;
  selectedPlayerId: string | null;
  onSendChat: (text: string) => void;
  onPitch: (text: string) => void;
  onVote: (targetId: string) => void;
  onAdvancePhase?: () => void;
  mockMode?: boolean;
  onMockPhase?: () => void;
}

export function ActionBar({
  gameState,
  connected,
  selectedPlayerId,
  onSendChat,
  onPitch,
  onVote,
  onAdvancePhase,
  mockMode = false,
  onMockPhase,
}: ActionBarProps) {
  const [text, setText] = useState('');
  const speaking = canSpeak(gameState);
  const voting = canVote(gameState);
  const disabled = !connected && !mockMode;

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (gameState === 'PITCH') {
      onPitch(trimmed);
    } else {
      onSendChat(trimmed);
    }
    setText('');
  };

  return (
    <div className="rounded-xl border border-bunker-border bg-bunker-panel/95 p-3 backdrop-blur">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-bunker-muted">
          Фаза: <span className="text-bunker-neon">{getPhaseMeta(gameState).title}</span>
        </span>
        {!connected && mockMode && (
          <span className="rounded bg-bunker-amber/20 px-2 py-0.5 font-mono text-[10px] text-bunker-amber">
            MOCK
          </span>
        )}
        {connected && (
          <span className="rounded bg-bunker-neon/10 px-2 py-0.5 font-mono text-[10px] text-bunker-neon">
            LIVE
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          disabled={disabled || (!speaking && !voting)}
          placeholder={
            voting
              ? 'Комментарий к голосованию (опционально)...'
              : speaking
                ? 'Введите сообщение...'
                : 'Канал закрыт для этой фазы'
          }
          className="flex-1 rounded-lg border border-bunker-border bg-bunker-bg px-3 py-2 font-mono text-sm text-bunker-text placeholder:text-bunker-muted focus:border-bunker-neon focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || (!speaking && !voting) || !text.trim()}
          className="flex items-center gap-1 rounded-lg border border-bunker-neon/40 bg-bunker-neon/10 px-3 py-2 font-mono text-xs text-bunker-neon transition hover:bg-bunker-neon/20 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          Отправить
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {gameState === 'PITCH' && (
          <button
            type="button"
            disabled={disabled || !text.trim()}
            onClick={() => {
              onPitch(text.trim());
              setText('');
            }}
            className="flex items-center gap-1 rounded-lg border border-bunker-neon/30 px-3 py-1.5 font-mono text-xs text-bunker-neon hover:bg-bunker-neon/10 disabled:opacity-40"
          >
            <Megaphone className="h-3.5 w-3.5" />
            Опубликовать Питч
          </button>
        )}

        {gameState === 'VOTE' && (
          <button
            type="button"
            disabled={disabled || !selectedPlayerId}
            onClick={() => selectedPlayerId && onVote(selectedPlayerId)}
            className="flex items-center gap-1 rounded-lg border border-bunker-danger/40 px-3 py-1.5 font-mono text-xs text-bunker-danger hover:bg-bunker-danger/10 disabled:opacity-40"
          >
            <Vote className="h-3.5 w-3.5" />
            Голосовать за изгнание
          </button>
        )}

        {(gameState === 'CONFLICT' ||
          gameState === 'PITCH' ||
          gameState === 'REVISION' ||
          gameState === 'TURING') && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSendChat(text.trim() || '...')}
            className="flex items-center gap-1 rounded-lg border border-bunker-border px-3 py-1.5 font-mono text-xs text-bunker-text hover:bg-bunker-border/30 disabled:opacity-40"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Чат
          </button>
        )}

        {connected && onAdvancePhase && (() => {
          const index = MATCH_PHASE_ORDER.indexOf(gameState);
          const next = MATCH_PHASE_ORDER[(index + 1) % MATCH_PHASE_ORDER.length] ?? 'INIT';
          return (
          <button
            type="button"
            onClick={onAdvancePhase}
            className="ml-auto rounded-lg border border-bunker-border px-3 py-1.5 font-mono text-[10px] text-bunker-muted hover:text-bunker-neon"
          >
            След. фаза → {mapFrontendPhase(next)}
          </button>
          );
        })()}

        {mockMode && onMockPhase && (
          <button
            type="button"
            onClick={onMockPhase}
            className="ml-auto rounded-lg border border-bunker-amber/40 px-3 py-1.5 font-mono text-[10px] text-bunker-amber hover:bg-bunker-amber/10"
          >
            [Mock] Сменить фазу
          </button>
        )}
      </div>
    </div>
  );
}
