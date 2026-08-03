import type { GlobalChatLine } from '@/types/roundTablePhase';

interface ChatMessageProps {
  message: GlobalChatLine;
}

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.type === 'system_reveal') {
    const playerName = message.playerName ?? '???';
    const cardTitle = message.cardTitle ?? '???';

    return (
      <div className="rounded-r border-l-2 border-green-500 bg-green-500/10 px-3 py-2 font-mono text-sm leading-relaxed text-bunker-text/90">
        <span className="font-semibold text-bunker-neon">[Система]</span>
        <span className="text-bunker-muted">: Игрок </span>
        <span className="font-semibold text-bunker-amber">{playerName}</span>
        <span className="text-bunker-muted"> раскрывает карту: </span>
        <span className="font-semibold text-bunker-neon">{cardTitle}</span>
      </div>
    );
  }

  const nameColor = message.senderColor ?? '#39ff14';

  return (
    <p className="font-mono text-sm leading-relaxed">
      <span className="font-semibold" style={{ color: nameColor }}>
        [{message.sender}]
      </span>
      <span className="text-bunker-muted">: </span>
      <span className="text-bunker-text/90">{message.text}</span>
    </p>
  );
}
