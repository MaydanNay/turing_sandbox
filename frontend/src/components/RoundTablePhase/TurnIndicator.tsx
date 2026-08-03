interface TurnIndicatorProps {
  visible?: boolean;
}

/** Минималистичная подсказка над веером карт */
export function TurnIndicator({ visible = false }: TurnIndicatorProps) {
  if (!visible) return null;

  return (
    <p className="pointer-events-none absolute -top-12 left-1/2 w-max -translate-x-1/2 text-sm uppercase tracking-widest text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]">
      Ваш ход — выберите карту
    </p>
  );
}
