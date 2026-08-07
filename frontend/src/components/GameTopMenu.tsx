import { Menu, Wifi, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { formatPhaseLabel } from '@/components/Hud/GameProcessPanel';
import type { GamePhase } from '@/types/game';

interface GameTopMenuProps {
  gameState: GamePhase;
  connected: boolean;
  mockMode?: boolean;
  roomId: string | null;
  onLeave?: () => void;
}

export function GameTopMenu({
  gameState,
  connected,
  mockMode = false,
  roomId,
  onLeave,
}: GameTopMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const linkStatus = connected ? 'LIVE' : mockMode ? 'MOCK' : 'OFF';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-bunker-border/70 bg-black/45 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-bunker-text backdrop-blur-md transition hover:border-bunker-neon/50 hover:text-bunker-neon"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {open ? <X className="h-3.5 w-3.5" /> : <Menu className="h-3.5 w-3.5" />}
        Меню
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-2 min-w-[220px] overflow-hidden rounded-xl border border-bunker-border/70 bg-black/90 shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur-md"
        >
          <div className="border-b border-white/10 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-widest text-bunker-muted">
              Сессия
            </p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wider text-bunker-neon">
              {formatPhaseLabel(gameState)}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
            <span className="font-mono text-[10px] text-bunker-muted">Связь</span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-bunker-text">
              {connected ? (
                <Wifi className="h-3 w-3 text-bunker-neon" />
              ) : (
                <WifiOff className="h-3 w-3 text-bunker-danger" />
              )}
              {linkStatus}
            </span>
          </div>

          {roomId && (
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2.5">
              <span className="font-mono text-[10px] text-bunker-muted">Комната</span>
              <span className="font-mono text-[10px] text-bunker-text">{roomId.slice(0, 8)}</span>
            </div>
          )}

          {onLeave && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onLeave();
              }}
              className="w-full px-3 py-3 text-left font-mono text-[10px] uppercase tracking-widest text-bunker-danger transition hover:bg-bunker-danger/15"
            >
              Покинуть станцию
            </button>
          )}
        </div>
      )}
    </div>
  );
}
