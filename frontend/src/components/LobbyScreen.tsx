import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { createSession } from '@/api/sessions';
import { playUiSound } from '@/audio/uiSounds';
import { ASSETS } from '@/config/assets';
import { generateClientId } from '@/config/env';

interface LobbyScreenProps {
  onJoinMock: () => void;
  onJoinLive: (roomId: string, clientId: string) => void;
  error: string | null;
}

type MenuAction = 'mock' | 'live';

interface MenuItem {
  id: MenuAction;
  label: string;
}

const MENU_ITEMS: MenuItem[] = [
  { id: 'mock', label: 'New Game' },
  { id: 'live', label: 'Live Session' },
];

function MenuDiamond({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rotate-45 transition-all duration-200 ${
        active
          ? 'scale-100 bg-amber-200 opacity-100 shadow-[0_0_10px_rgba(251,191,36,0.95),0_0_18px_rgba(251,191,36,0.45)]'
          : 'scale-75 bg-transparent opacity-0'
      }`}
      aria-hidden
    />
  );
}

function MenuRow({
  label,
  selected,
  loading,
  onSelect,
  onHover,
}: {
  label: string;
  selected: boolean;
  loading?: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onMouseEnter={onHover}
      disabled={loading}
      className="group relative flex w-full items-center justify-end gap-4 py-1.5 text-right focus:outline-none disabled:cursor-wait"
    >
      <span
        className={`pointer-events-none absolute inset-y-0 -left-6 right-0 transition-all duration-200 sm:-left-10 ${
          selected
            ? 'bg-gradient-to-l from-amber-300/35 via-amber-200/20 to-transparent'
            : 'bg-transparent group-hover:from-white/5 group-hover:via-white/5 group-hover:to-transparent'
        }`}
        aria-hidden
      />

      <MenuDiamond active={selected} />

      <span
        className={`relative z-10 min-w-[9rem] font-menu text-xl font-light tracking-[0.06em] transition-colors duration-200 sm:min-w-[11rem] sm:text-2xl ${
          selected ? 'text-white' : 'text-white/72 group-hover:text-white/90'
        }`}
      >
        {loading ? (
          <span className="inline-flex items-center justify-end gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-amber-200" />
            Connecting…
          </span>
        ) : (
          label
        )}
      </span>
    </button>
  );
}

export function LobbyScreen({ onJoinMock, onJoinLive, error }: LobbyScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loadingLive, setLoadingLive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayError = error ?? localError;

  const runAction = useCallback(
    async (action: MenuAction) => {
      playUiSound('table');

      if (action === 'mock') {
        onJoinMock();
        return;
      }

      setLoadingLive(true);
      setLocalError(null);
      try {
        const clientId = generateClientId();
        const session = await createSession();
        onJoinLive(session.room_id, clientId);
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : 'Connection failed');
      } finally {
        setLoadingLive(false);
      }
    },
    [onJoinMock, onJoinLive],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (loadingLive) return;

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((i) => {
          const next = (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
          playUiSound('character');
          return next;
        });
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((i) => {
          const next = (i + 1) % MENU_ITEMS.length;
          playUiSound('character');
          return next;
        });
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const item = MENU_ITEMS[selectedIndex];
        if (item) void runAction(item.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadingLive, runAction, selectedIndex]);

  return (
    <div className="relative h-full min-h-screen w-full overflow-hidden bg-black text-white">
      <img
        src={ASSETS.locations.menu}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        width={1920}
        height={1080}
        draggable={false}
      />

      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/25 via-transparent to-black/15"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] bg-gradient-to-t from-black/55 via-black/20 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 flex h-full min-h-screen flex-col">
        <div className="flex flex-1 flex-col justify-end pb-16 pl-8 sm:pb-20 sm:pl-14 md:pl-20 lg:pb-24">
          <div className="max-w-2xl">
            <p className="font-menu text-base font-light italic tracking-[0.28em] text-white/80 sm:text-lg">
              The Outpost
            </p>
            <h1 className="mt-3 font-title text-5xl font-semibold leading-[0.92] tracking-[0.04em] text-white drop-shadow-[0_4px_28px_rgba(0,0,0,0.5)] sm:text-6xl md:text-7xl lg:text-[5.25rem]">
              Turing
              <br />
              Station
            </h1>
          </div>
        </div>

        <nav
          className="absolute right-8 top-[42%] w-[min(92vw,320px)] -translate-y-1/2 sm:right-12 sm:w-[min(40vw,360px)] md:right-16 lg:right-20"
          aria-label="Main menu"
        >
          <ul className="flex flex-col items-end gap-3 sm:gap-4">
            {MENU_ITEMS.map((item, index) => (
              <li key={item.id} className="w-full">
                <MenuRow
                  label={item.label}
                  selected={selectedIndex === index}
                  loading={item.id === 'live' && loadingLive}
                  onHover={() => {
                    if (selectedIndex !== index) {
                      playUiSound('character');
                      setSelectedIndex(index);
                    }
                  }}
                  onSelect={() => {
                    setSelectedIndex(index);
                    void runAction(item.id);
                  }}
                />
              </li>
            ))}
          </ul>

          {displayError && (
            <p className="mt-6 text-right font-mono text-xs text-red-300/90">{displayError}</p>
          )}
        </nav>

        <footer className="mt-auto flex items-end justify-between px-6 pb-5 sm:px-10 sm:pb-7">
          <p className="font-mono text-[10px] text-white/35 sm:text-[11px]">
            social deduction · terminal MVP
          </p>

          <div className="text-right font-mono text-[10px] text-white/55 sm:text-[11px]">
            <p>
              <kbd className="rounded border border-white/25 px-1.5 py-0.5 text-white/70">↑</kbd>{' '}
              <kbd className="rounded border border-white/25 px-1.5 py-0.5 text-white/70">↓</kbd>{' '}
              navigate
            </p>
            <p className="mt-1">
              <kbd className="rounded border border-white/25 px-1.5 py-0.5 text-white/70">Enter</kbd>{' '}
              select
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
