import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { createSession, joinSessionByInvite } from '@/api/sessions';
import { playUiSound, refreshUiSoundMaster } from '@/audio/uiSounds';
import { ASSETS } from '@/config/assets';
import { generateClientId } from '@/config/env';
import { useT } from '@/i18n';
import { useSettingsStore, type AppLanguage } from '@/store/settingsStore';

interface LobbyScreenProps {
  onJoinLive: (
    roomId: string,
    clientId: string,
    options?: { seatToken?: string | null },
  ) => void;
  onContinue?: () => void;
  onOpenHistory?: () => void;
  canContinue?: boolean;
  error: string | null;
  /** Prefill join-code view (e.g. from ?invite=) */
  initialInviteCode?: string | null;
}

type MenuAction =
  | 'continue'
  | 'new_game'
  | 'create_room'
  | 'join_code'
  | 'history'
  | 'settings';
type LobbyView = 'main' | 'new_game' | 'create_room' | 'join_code' | 'settings';

type MenuItem = {
  id: MenuAction;
  label: string;
};

export type MatchDurationMinutes = 7 | 15 | 30;

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
  onHover,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={onHover}
      onClick={onSelect}
      className={`group relative flex w-full items-center justify-end gap-3 py-2.5 pr-1 text-right focus:outline-none ${
        selected ? 'text-white' : 'text-white/70 hover:text-white/90'
      }`}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 -left-6 right-0 transition-all duration-200 sm:-left-10 ${
          selected
            ? 'bg-gradient-to-l from-amber-300/35 via-amber-200/20 to-transparent'
            : 'bg-transparent group-hover:from-white/5 group-hover:via-white/5 group-hover:to-transparent'
        }`}
        aria-hidden
      />
      <span className="relative z-10 flex items-center gap-3">
        <MenuDiamond active={selected} />
        <span className="font-menu text-2xl font-light tracking-[0.06em] sm:text-3xl">
          {label}
        </span>
      </span>
    </button>
  );
}

function ModePicker({
  modeIndex,
  setModeIndex,
  loadingLive,
  modes,
}: {
  modeIndex: number;
  setModeIndex: (i: number) => void;
  loadingLive: boolean;
  modes: { minutes: MatchDurationMinutes; title: string; subtitle: string }[];
}) {
  return (
    <ul className="flex w-full flex-col items-end gap-2">
      {modes.map((mode, index) => {
        const selected = modeIndex === index;
        return (
          <li key={mode.minutes} className="w-full">
            <button
              type="button"
              disabled={loadingLive}
              onClick={() => {
                if (modeIndex === index) return;
                playUiSound('character');
                setModeIndex(index);
              }}
              className={`group relative flex w-full flex-col items-end gap-0.5 py-2 pr-1 text-right focus:outline-none disabled:cursor-wait ${
                selected ? 'text-white' : 'text-white/65 hover:text-white/85'
              }`}
            >
              <span
                className={`pointer-events-none absolute inset-y-0 -left-6 right-0 transition-all duration-200 sm:-left-10 ${
                  selected
                    ? 'bg-gradient-to-l from-amber-300/35 via-amber-200/20 to-transparent'
                    : 'bg-transparent group-hover:from-white/5 group-hover:via-white/5 group-hover:to-transparent'
                }`}
                aria-hidden
              />
              <span className="relative z-10 flex items-center gap-3">
                <MenuDiamond active={selected} />
                <span className="font-menu text-xl font-light tracking-[0.06em] sm:text-2xl">
                  {mode.title}
                </span>
              </span>
              <span className="relative z-10 font-mono text-[10px] uppercase tracking-wider text-white/45">
                {mode.subtitle}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function LanguageOption({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative flex w-full items-center justify-end gap-3 py-2.5 pr-1 text-right focus:outline-none ${
        active ? 'text-white' : 'text-white/65 hover:text-white/85'
      }`}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 -left-6 right-0 transition-all duration-200 sm:-left-10 ${
          active
            ? 'bg-gradient-to-l from-amber-300/35 via-amber-200/20 to-transparent'
            : 'bg-transparent'
        }`}
        aria-hidden
      />
      <span className="relative z-10 flex items-center gap-3">
        <MenuDiamond active={active} />
        <span className="font-menu text-xl font-light tracking-[0.06em] sm:text-2xl">
          {label}
        </span>
      </span>
    </button>
  );
}

export function LobbyScreen({
  onJoinLive,
  onContinue,
  onOpenHistory,
  canContinue = false,
  error,
  initialInviteCode = null,
}: LobbyScreenProps) {
  const t = useT();
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const soundVolume = useSettingsStore((s) => s.soundVolume);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const setSoundVolume = useSettingsStore((s) => s.setSoundVolume);

  const matchModes = useMemo(
    () =>
      [
        { minutes: 7 as const, title: t('mode.quick'), subtitle: t('mode.quickSub') },
        { minutes: 15 as const, title: t('mode.medium'), subtitle: t('mode.mediumSub') },
        { minutes: 30 as const, title: t('mode.long'), subtitle: t('mode.longSub') },
      ] as const,
    [t],
  );

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [];
    if (canContinue) items.push({ id: 'continue', label: t('menu.continue') });
    items.push(
      { id: 'new_game', label: t('menu.newGame') },
      { id: 'create_room', label: t('menu.createRoom') },
      { id: 'join_code', label: t('menu.joinCode') },
      { id: 'settings', label: t('menu.settings') },
      { id: 'history', label: t('menu.history') },
    );
    return items;
  }, [canContinue, t]);

  const [view, setView] = useState<LobbyView>(
    initialInviteCode ? 'join_code' : 'main',
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [modeIndex, setModeIndex] = useState(1);
  const [loadingLive, setLoadingLive] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState(
    (initialInviteCode ?? '').toUpperCase(),
  );

  const displayError = error ?? localError;
  const selectedMode = matchModes[modeIndex] ?? matchModes[1]!;

  useEffect(() => {
    setSelectedIndex(0);
  }, [canContinue, language]);

  useEffect(() => {
    if (initialInviteCode) {
      setInviteInput(initialInviteCode.toUpperCase());
      setView('join_code');
    }
  }, [initialInviteCode]);

  const startPublicMatch = useCallback(
    async (minutes: MatchDurationMinutes) => {
      setLoadingLive(true);
      setLocalError(null);
      try {
        const clientId = generateClientId();
        const session = await createSession({ matchDurationMinutes: minutes });
        onJoinLive(session.room_id, clientId, { seatToken: session.seat_token });
      } catch (e) {
        setLocalError(
          e instanceof Error ? e.message : t('lobby.connectionFailed'),
        );
      } finally {
        setLoadingLive(false);
      }
    },
    [onJoinLive, t],
  );

  const startPrivateRoom = useCallback(
    async (minutes: MatchDurationMinutes) => {
      setLoadingLive(true);
      setLocalError(null);
      try {
        const clientId = generateClientId();
        const session = await createSession({
          matchDurationMinutes: minutes,
          private: true,
        });
        onJoinLive(session.room_id, clientId, { seatToken: session.seat_token });
      } catch (e) {
        setLocalError(
          e instanceof Error ? e.message : t('lobby.connectionFailed'),
        );
      } finally {
        setLoadingLive(false);
      }
    },
    [onJoinLive, t],
  );

  const joinByCode = useCallback(async () => {
    const code = inviteInput.trim().toUpperCase();
    if (code.length < 4) {
      setLocalError(t('lobby.enterCode'));
      return;
    }
    setLoadingLive(true);
    setLocalError(null);
    try {
      const clientId = generateClientId();
      const session = await joinSessionByInvite(code);
      onJoinLive(session.room_id, clientId, { seatToken: session.seat_token });
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : t('lobby.joinFailed'));
    } finally {
      setLoadingLive(false);
    }
  }, [inviteInput, onJoinLive, t]);

  const pickLanguage = useCallback(
    (next: AppLanguage) => {
      playUiSound('character');
      setLanguage(next);
    },
    [setLanguage],
  );

  const runAction = useCallback(
    async (action: MenuAction) => {
      playUiSound('table');

      if (action === 'continue') {
        onContinue?.();
        return;
      }

      if (action === 'history') {
        onOpenHistory?.();
        return;
      }

      if (action === 'settings') {
        setView('settings');
        setLocalError(null);
        return;
      }

      if (action === 'new_game') {
        setView('new_game');
        setLocalError(null);
        return;
      }

      if (action === 'create_room') {
        setView('create_room');
        setLocalError(null);
        return;
      }

      if (action === 'join_code') {
        setView('join_code');
        setLocalError(null);
      }
    },
    [onContinue, onOpenHistory],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (loadingLive) return;

      if (view === 'settings') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('main');
          return;
        }
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          pickLanguage(language === 'en' ? 'ru' : 'en');
          return;
        }
        return;
      }

      if (view === 'join_code') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('main');
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          void joinByCode();
        }
        return;
      }

      if (view === 'new_game' || view === 'create_room') {
        if (event.key === 'Escape') {
          event.preventDefault();
          setView('main');
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setModeIndex((i) => {
            const next = (i - 1 + matchModes.length) % matchModes.length;
            playUiSound('character');
            return next;
          });
          return;
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setModeIndex((i) => {
            const next = (i + 1) % matchModes.length;
            playUiSound('character');
            return next;
          });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          const mode = matchModes[modeIndex];
          if (!mode) return;
          if (view === 'create_room') void startPrivateRoom(mode.minutes);
          else void startPublicMatch(mode.minutes);
        }
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((i) => {
          const next = (i - 1 + menuItems.length) % menuItems.length;
          playUiSound('character');
          return next;
        });
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((i) => {
          const next = (i + 1) % menuItems.length;
          playUiSound('character');
          return next;
        });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const item = menuItems[selectedIndex];
        if (item) void runAction(item.id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    loadingLive,
    runAction,
    selectedIndex,
    menuItems,
    view,
    modeIndex,
    startPublicMatch,
    startPrivateRoom,
    joinByCode,
    matchModes,
    language,
    pickLanguage,
  ]);

  const modeTitle =
    view === 'create_room' ? t('lobby.createRoomTitle') : t('lobby.matchMode');
  const startLabel = view === 'create_room' ? t('lobby.create') : t('lobby.start');

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-white">
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

      <div className="relative z-10 flex h-full w-full flex-col">
        <div className="flex flex-1 flex-col justify-end pb-14 pl-8 sm:pb-16 sm:pl-14 md:pl-20 lg:pb-20">
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
          className={
            view === 'settings'
              ? 'absolute bottom-8 right-6 top-6 z-20 flex w-[min(92vw,400px)] flex-col sm:right-10 md:right-14 lg:right-16'
              : 'absolute right-8 top-[42%] w-[min(92vw,340px)] -translate-y-1/2 sm:right-12 sm:w-[min(42vw,380px)] md:right-16 lg:right-20'
          }
          aria-label="Main menu"
        >
          {view === 'main' ? (
            <ul className="flex flex-col items-end gap-3 sm:gap-4">
              {menuItems.map((item, index) => (
                <li key={item.id} className="w-full">
                  <MenuRow
                    label={item.label}
                    selected={selectedIndex === index}
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
          ) : view === 'settings' ? (
            <div className="flex min-h-0 flex-1 flex-col items-end gap-2.5 overflow-y-auto overscroll-contain pb-2 pr-1">
              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200/80">
                {t('settings.title')}
              </p>

              <p className="shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                {t('settings.language')}
              </p>
              <ul className="flex w-full shrink-0 flex-col items-end gap-0.5">
                <li className="w-full">
                  <LanguageOption
                    active={language === 'en'}
                    label={t('settings.english')}
                    onSelect={() => pickLanguage('en')}
                  />
                </li>
                <li className="w-full">
                  <LanguageOption
                    active={language === 'ru'}
                    label={t('settings.russian')}
                    onSelect={() => pickLanguage('ru')}
                  />
                </li>
              </ul>

              <div className="mt-1 w-full shrink-0 border-t border-white/10 pt-3">
                <p className="text-right font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
                  {t('settings.sound')}
                </p>

                <div className="mt-2 flex w-full justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSoundEnabled(true);
                      refreshUiSoundMaster();
                      playUiSound('character');
                    }}
                    className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
                      soundEnabled
                        ? 'border-amber-300/45 bg-amber-500/20 text-amber-100'
                        : 'border-white/15 bg-white/5 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {t('settings.soundOn')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSoundEnabled(false);
                      refreshUiSoundMaster();
                    }}
                    className={`rounded-md border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition ${
                      !soundEnabled
                        ? 'border-amber-300/45 bg-amber-500/20 text-amber-100'
                        : 'border-white/15 bg-white/5 text-white/50 hover:text-white/80'
                    }`}
                  >
                    {t('settings.soundOff')}
                  </button>
                </div>

                <label className="mt-3 flex w-full flex-col items-end gap-1.5">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/45">
                    {t('settings.volume')} · {Math.round(soundVolume * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(soundVolume * 100)}
                    disabled={!soundEnabled}
                    onChange={(e) => {
                      const next = Number(e.target.value) / 100;
                      setSoundVolume(next);
                      refreshUiSoundMaster();
                    }}
                    onMouseUp={() => {
                      if (soundEnabled) playUiSound('table');
                    }}
                    onTouchEnd={() => {
                      if (soundEnabled) playUiSound('table');
                    }}
                    className="h-1.5 w-full max-w-[260px] cursor-pointer appearance-none rounded-full bg-white/15 accent-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                  />
                </label>

                <button
                  type="button"
                  disabled={!soundEnabled || soundVolume <= 0}
                  onClick={() => playUiSound('table')}
                  className="mt-2 font-mono text-[10px] uppercase tracking-wider text-amber-200/70 transition hover:text-amber-100 disabled:opacity-30"
                >
                  {t('settings.testSound')}
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  playUiSound('character');
                  setView('main');
                }}
                className="mt-auto shrink-0 pt-3 font-mono text-[10px] uppercase tracking-wider text-white/40 transition hover:text-white/70"
              >
                {t('menu.back')}
              </button>
            </div>
          ) : view === 'join_code' ? (
            <div className="flex flex-col items-end gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200/80">
                {t('lobby.roomCode')}
              </p>
              <input
                value={inviteInput}
                onChange={(e) =>
                  setInviteInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                maxLength={8}
                placeholder="XXXXXX"
                autoFocus
                className="w-full rounded-md border border-white/20 bg-black/50 px-4 py-3 text-center font-mono text-2xl tracking-[0.35em] text-amber-50 placeholder:text-white/25 focus:border-amber-300/50 focus:outline-none"
              />
              <div className="mt-2 flex w-full flex-col items-end gap-2">
                <button
                  type="button"
                  disabled={loadingLive}
                  onClick={() => {
                    playUiSound('table');
                    void joinByCode();
                  }}
                  className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-md border border-amber-300/45 bg-amber-500/15 px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingLive ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('lobby.joining')}
                    </>
                  ) : (
                    t('lobby.join')
                  )}
                </button>
                <button
                  type="button"
                  disabled={loadingLive}
                  onClick={() => {
                    playUiSound('character');
                    setView('main');
                  }}
                  className="font-mono text-[10px] uppercase tracking-wider text-white/40 transition hover:text-white/70"
                >
                  {t('menu.back')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-amber-200/80">
                {modeTitle}
              </p>
              <ModePicker
                modeIndex={modeIndex}
                setModeIndex={setModeIndex}
                loadingLive={loadingLive}
                modes={[...matchModes]}
              />

              <div className="mt-5 flex w-full flex-col items-end gap-2">
                <button
                  type="button"
                  disabled={loadingLive}
                  onClick={() => {
                    playUiSound('table');
                    if (view === 'create_room') {
                      void startPrivateRoom(selectedMode.minutes);
                    } else {
                      void startPublicMatch(selectedMode.minutes);
                    }
                  }}
                  className="inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-md border border-amber-300/45 bg-amber-500/15 px-5 py-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-500/25 disabled:cursor-wait disabled:opacity-60"
                >
                  {loadingLive ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {t('lobby.starting')}
                    </>
                  ) : (
                    startLabel
                  )}
                </button>
                <button
                  type="button"
                  disabled={loadingLive}
                  onClick={() => {
                    playUiSound('character');
                    setView('main');
                  }}
                  className="font-mono text-[10px] uppercase tracking-wider text-white/40 transition hover:text-white/70"
                >
                  {t('menu.back')}
                </button>
              </div>
            </div>
          )}

          {displayError && view === 'main' && (
            <p className="mt-6 text-right font-mono text-xs text-red-300/90">
              {displayError}
            </p>
          )}
        </nav>

        {displayError && view !== 'main' && (
          <p className="pointer-events-none absolute bottom-16 left-8 right-[min(92vw,420px)] z-20 max-w-md font-mono text-xs text-red-300/90 sm:left-14">
            {displayError}
          </p>
        )}

        <footer className="pointer-events-none absolute bottom-4 left-6 z-10 sm:bottom-5 sm:left-10">
          <p className="font-mono text-[10px] text-white/35 sm:text-[11px]">
            social deduction · helixa · maydi
          </p>
        </footer>
      </div>
    </div>
  );
}
