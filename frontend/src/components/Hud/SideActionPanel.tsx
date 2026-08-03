interface SideActionPanelProps {
  onVoteEvict?: () => void;
  onSkip?: () => void;
}

export function SideActionPanel({ onVoteEvict, onSkip }: SideActionPanelProps) {
  const btnClass =
    'pointer-events-auto rounded-lg bg-black/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-yellow-500/90 transition hover:bg-black/85 hover:text-yellow-300';

  return (
    <div className="pointer-events-auto absolute right-6 top-1/2 flex -translate-y-1/2 flex-col gap-3">
      <button type="button" className={btnClass} onClick={onVoteEvict}>
        Vote to Evict
      </button>
      <button type="button" className={btnClass} onClick={onSkip}>
        Skip
      </button>
    </div>
  );
}
