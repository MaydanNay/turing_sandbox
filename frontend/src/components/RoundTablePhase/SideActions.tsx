interface SideActionsProps {
  onVoteEvict?: () => void;
  onSkip?: () => void;
}

export function SideActions({ onVoteEvict, onSkip }: SideActionsProps) {
  return (
    <div className="pointer-events-auto absolute top-1/2 right-8 z-[40] flex -translate-y-1/2 flex-col gap-4">
      <button
        type="button"
        onClick={onVoteEvict}
        className="rounded border border-bunker-danger/40 bg-black/70 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-bunker-danger backdrop-blur-sm transition hover:border-bunker-danger hover:bg-bunker-danger/15 hover:shadow-danger"
      >
        VOTE TO EVICT
      </button>
      <button
        type="button"
        onClick={onSkip}
        className="rounded border border-bunker-border/80 bg-black/70 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-bunker-muted backdrop-blur-sm transition hover:border-bunker-neon/50 hover:text-bunker-neon"
      >
        SKIP
      </button>
    </div>
  );
}
