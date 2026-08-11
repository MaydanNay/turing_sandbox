import { Pencil, X } from 'lucide-react';

import { ASSETS } from '@/config/assets';
import {
  genderLabel,
  type CharacterDefinition,
} from '@/data/characters';

interface CharacterInfoModalProps {
  character: CharacterDefinition;
  scale: number;
  onScaleChange: (scale: number) => void;
  onScaleGestureStart?: () => void;
  onClose: () => void;
  onEditAssets: () => void;
}

export function CharacterInfoModal({
  character,
  scale,
  onScaleChange,
  onScaleGestureStart,
  onClose,
  onEditAssets,
}: CharacterInfoModalProps) {
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="char-info-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-amber-300/35 bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <img
            src={ASSETS.characters.chibi(character.id)}
            alt=""
            className="h-16 w-16 rounded-lg border border-white/15 object-contain bg-black/40"
            onError={(e) => {
              e.currentTarget.src = ASSETS.characters.default;
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
              Персонаж
            </p>
            <h2
              id="char-info-title"
              className="truncate text-lg font-semibold text-amber-50"
            >
              {character.displayName}
            </h2>
            <p className="font-mono text-[11px] text-neutral-400">{character.id}</p>
          </div>
          <button
            type="button"
            className="rounded border border-white/15 p-1.5 text-neutral-300 hover:bg-white/10"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="size-4" />
          </button>
        </div>

        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 px-4 py-4 font-mono text-[12px]">
          <dt className="text-neutral-500">Роль</dt>
          <dd className="text-amber-100">{character.role}</dd>
          <dt className="text-neutral-500">Пол</dt>
          <dd className="text-amber-100">{genderLabel(character.gender)}</dd>
          <dt className="text-neutral-500">Возраст</dt>
          <dd className="text-amber-100">
            {character.ageMin}–{character.ageMax}
          </dd>
          <dt className="text-neutral-500">Место</dt>
          <dd className="text-amber-100">Стул {character.seat}</dd>
          <dt className="text-neutral-500 self-center">Размер</dt>
          <dd className="text-amber-100">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] text-neutral-400">
                {Math.round(scale * 100)}%
              </span>
              <input
                type="range"
                min={50}
                max={140}
                step={1}
                value={Math.round(scale * 100)}
                onPointerDown={() => onScaleGestureStart?.()}
                onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-violet-300"
              />
            </label>
          </dd>
        </dl>

        <div className="flex items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
          <p className="font-mono text-[10px] text-neutral-500">
            Ракурсы и картинки
          </p>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded border border-amber-300/50 bg-amber-500/20 text-amber-100 hover:bg-amber-500/30"
            onClick={onEditAssets}
            title="Редактировать ассеты"
            aria-label="Редактировать ассеты"
          >
            <Pencil className="size-4" strokeWidth={2.25} />
          </button>
        </div>
      </div>
    </div>
  );
}
