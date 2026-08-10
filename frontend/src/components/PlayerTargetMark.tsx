/** Ground ellipse + nameplate tone for hover / select on outpost chibis. */

export type PlayerMarkTone = 'idle' | 'self' | 'hover' | 'selected';

export function playerMarkTone(opts: {
  isSelf: boolean;
  alive: boolean;
  hovered: boolean;
  selected: boolean;
}): PlayerMarkTone {
  if (!opts.alive) return 'idle';
  if (opts.isSelf) return 'self';
  if (opts.selected) return 'selected';
  if (opts.hovered) return 'hover';
  return 'idle';
}

const OVAL: Record<PlayerMarkTone, string> = {
  // Soft ground contact — always on for weight; hover/select tint over it
  idle: 'opacity-100 scale-100 bg-black/25',
  // Local player: crisp light ring on the floor — not a sprite glow
  self:
    'opacity-100 scale-100 bg-black/30 shadow-[0_0_0_1.5px_rgba(255,255,255,0.7),0_0_0_3px_rgba(0,0,0,0.35)]',
  hover:
    'opacity-100 scale-100 bg-[rgba(57,255,20,0.28)] shadow-[0_0_10px_rgba(57,255,20,0.35)]',
  selected:
    'opacity-100 scale-100 bg-[rgba(239,68,68,0.32)] shadow-[0_0_12px_rgba(239,68,68,0.4)]',
};

const PLATE: Record<PlayerMarkTone, string> = {
  idle: 'border border-transparent bg-black/80 text-bunker-text',
  self: 'border border-white/55 bg-black/85 text-white',
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
      className={`pointer-events-none absolute bottom-[-8%] left-1/2 z-0 h-[11%] w-[78%] -translate-x-1/2 rounded-[50%] transition-[opacity,transform,background-color,box-shadow] duration-150 ease-out ${OVAL[tone]}`}
    />
  );
}

/** Soft bobbing chevron above the local player — readable without lighting up the sprite. */
export function SelfPlayerMarker() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[-2%] z-[2] -translate-x-1/2 -translate-y-full"
    >
      <div className="animate-self-marker text-[10px] leading-none text-white/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)] sm:text-[11px]">
        ▼
      </div>
    </div>
  );
}

export function playerNameplateClass(tone: PlayerMarkTone): string {
  return `inline-block whitespace-nowrap rounded px-1.5 py-0.5 font-display text-[9px] font-semibold backdrop-blur-sm transition-[color,box-shadow,border-color,background-color] duration-150 sm:text-[10px] ${PLATE[tone]}`;
}

export function playerNameplateLabel(name: string, tone: PlayerMarkTone): string {
  return tone === 'self' ? `${name} · вы` : name;
}
