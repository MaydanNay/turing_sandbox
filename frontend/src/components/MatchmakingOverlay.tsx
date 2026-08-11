import { useCallback, useState } from 'react';

import { useDeadlineCountdown } from '@/hooks/usePhaseCountdown';
import { useStagedLobbyFill } from '@/hooks/useStagedLobbyFill';
import { useT } from '@/i18n';
import { useWebSocket } from '@/providers/WebSocketProvider';
import { useGameStore } from '@/store/gameStore';

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function inviteLink(code: string): string {
  const url = new URL(window.location.href);
  url.searchParams.set('invite', code);
  return url.toString();
}

interface MatchmakingOverlayProps {
  onLeave?: () => void;
}

/** Public search timer, or private lobby with invite code + host start. */
export function MatchmakingOverlay({ onLeave }: MatchmakingOverlayProps) {
  const t = useT();
  const matchmakingDeadlineTs = useGameStore((s) => s.matchmakingDeadlineTs);
  const players = useGameStore((s) => s.players);
  const isPrivate = useGameStore((s) => s.isPrivate);
  const inviteCode = useGameStore((s) => s.inviteCode);
  const hostClientId = useGameStore((s) => s.hostClientId);
  const clientId = useGameStore((s) => s.clientId);
  const remaining = useDeadlineCountdown(matchmakingDeadlineTs);
  const { send } = useWebSocket();
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [starting, setStarting] = useState(false);

  const humanCount = players.filter(
    (p) => !p.is_ai && p.is_alive !== false,
  ).length;
  const capacity = 8;
  const isHost = Boolean(clientId && hostClientId && clientId === hostClientId);

  const { displayCount, lastJoinName } = useStagedLobbyFill(
    humanCount,
    capacity,
    remaining,
    isPrivate ? null : matchmakingDeadlineTs,
  );

  const copy = useCallback(async (kind: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1600);
    } catch {
      /* ignore */
    }
  }, []);

  const startMatch = useCallback(() => {
    if (starting) return;
    setStarting(true);
    send({ action: 'start_match' });
  }, [send, starting]);

  if (isPrivate) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-[11000] flex flex-col bg-black/90 px-6">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300/70">
            {t('mm.privateTitle')}
          </p>
          <h2 className="mt-4 font-serif text-3xl text-amber-50 sm:text-4xl">
            {t('mm.privateHeadline')}
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
            {t('mm.privateBody')}
          </p>

          {inviteCode && (
            <div className="mt-10 flex flex-col items-center gap-3">
              <p className="font-mono text-4xl tracking-[0.35em] text-amber-100 sm:text-5xl">
                {inviteCode}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy('code', inviteCode)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-neutral-300 transition hover:border-white/30 hover:bg-white/10"
                >
                  {copied === 'code' ? t('mm.copied') : t('mm.copyCode')}
                </button>
                <button
                  type="button"
                  onClick={() => void copy('link', inviteLink(inviteCode))}
                  className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-amber-100 transition hover:border-amber-300/50 hover:bg-amber-500/20"
                >
                  {copied === 'link' ? t('mm.linkCopied') : t('mm.copyLink')}
                </button>
              </div>
            </div>
          )}

          <p className="mt-8 font-mono text-sm text-neutral-300">
            {t('mm.inRoom')}{' '}
            <span className="text-amber-100">
              {humanCount}/{capacity}
            </span>
          </p>
          {!isHost && (
            <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-600">
              {t('mm.waitingHost')}
            </p>
          )}
        </div>

        <div className="mx-auto flex w-full max-w-sm flex-col gap-2 pb-10">
          {isHost && (
            <button
              type="button"
              disabled={starting}
              onClick={startMatch}
              className="w-full rounded-lg border border-amber-300/45 bg-amber-500/20 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-amber-50 transition hover:bg-amber-500/30 disabled:opacity-60"
            >
              {starting ? t('mm.starting') : t('mm.startMatch')}
            </button>
          )}
          {onLeave && (
            <button
              type="button"
              onClick={onLeave}
              className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 transition hover:border-white/30 hover:bg-white/10"
            >
              {t('mm.leave')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-[11000] flex flex-col bg-black/90 px-6">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.35em] text-amber-300/70">
          {t('mm.searchTitle')}
        </p>
        <h2 className="mt-4 font-serif text-3xl text-amber-50 sm:text-4xl">
          {t('mm.searchHeadline')}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-neutral-400">
          {t('mm.searchBody')}
        </p>

        <p className="mt-10 font-mono text-5xl tabular-nums text-amber-200/90">
          {formatCountdown(remaining)}
        </p>
        <p className="mt-2 text-[11px] uppercase tracking-wider text-neutral-600">
          {t('mm.untilAutostart')}
        </p>

        <p className="mt-8 font-mono text-sm text-neutral-300">
          {t('mm.inRoom')}{' '}
          <span className="text-amber-100">
            {displayCount}/{capacity}
          </span>
        </p>
        <p
          className={`mt-3 h-5 font-mono text-[11px] uppercase tracking-wider transition ${
            lastJoinName ? 'text-emerald-300/80 opacity-100' : 'opacity-0'
          }`}
          aria-live="polite"
        >
          {lastJoinName ? `${t('mm.joined')}: ${lastJoinName}` : '·'}
        </p>
      </div>

      {onLeave && (
        <div className="mx-auto w-full max-w-sm pb-10">
          <button
            type="button"
            onClick={onLeave}
            className="w-full rounded-lg border border-white/15 bg-white/5 px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-neutral-300 transition hover:border-white/30 hover:bg-white/10"
          >
            {t('mm.cancelSearch')}
          </button>
        </div>
      )}
    </div>
  );
}
