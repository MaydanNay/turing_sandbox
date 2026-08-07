/** Ground ellipse + nameplate tone for hover / select on outpost chibis. */

export type PlayerMarkTone = 'idle' | 'hover' | 'selected';

export function playerMarkTone(opts: {
  isSelf: boolean;
  alive: boolean;
  hovered: boolean;
  selected: boolean;
}): PlayerMarkTone {
  if (opts.isSelf || !opts.alive) return 'idle';
  if (opts.selected) return 'selected';
  if (opts.hovered) return 'hover';
  return 'idle';
}

const OVAL: Record<PlayerMarkTone, string> = {
  idle: 'opacity-0 scale-90',
  hover:
    'opacity-100 scale-100 bg-[rgba(57,255,20,0.28)] shadow-[0_0_10px_rgba(57,255,20,0.35)]',
  selected:
    'opacity-100 scale-100 bg-[rgba(239,68,68,0.32)] shadow-[0_0_12px_rgba(239,68,68,0.4)]',
};

const PLATE: Record<PlayerMarkTone, string> = {
  idle: 'border border-transparent bg-black/80 text-bunker-text',
  hover:
    'border border-bunker-neon/55 bg-black/90 text-bunker-neon shadow-[0_0_8px_rgba(57,255,20,0.25)]',
  selected:
    'border border-bunker-danger/65 bg-black/90 text-bunker-danger shadow-[0_0_8px_rgba(239,68,68,0.3)]',
};

/** Ellipse under feet — sits behind the sprite art. */
export function PlayerFootOval({ tone }: { tone: PlayerMarkTone }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute bottom-[-8%] left-1/2 z-0 h-[11%] w-[78%] -translate-x-1/2 rounded-[50%] transition-[opacity,transform] duration-150 ease-out ${OVAL[tone]}`}
    />
  );
}

export function playerNameplateClass(tone: PlayerMarkTone): string {
  return `inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-display text-[9px] font-semibold backdrop-blur-sm transition-[color,box-shadow,border-color,background-color] duration-150 sm:text-[10px] ${PLATE[tone]}`;
}
