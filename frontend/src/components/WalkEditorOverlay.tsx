import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  OUTPOST_BLOCK_POLYGONS,
  OUTPOST_WALK_POLYGONS,
  type WalkPoint,
} from '@/data/outpostWalkMask';
import { setLiveWalkMask, clearLiveWalkMask } from '@/utils/walkMaskRuntime';

const STORAGE_KEY = 'turing_walk_edit';
/** Hit radius in scene % for grabbing a vertex */
const VERTEX_HIT_PCT = 2.2;

type EditMode = 'walk' | 'block';

export function isWalkEditEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get('walkEdit') === '1') return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function roundPt(p: WalkPoint): WalkPoint {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

function formatExport(walk: WalkPoint[][], block: WalkPoint[][]): string {
  const walkBody = JSON.stringify(
    walk.map((poly) => poly.map(roundPt)),
    null,
    2,
  );
  const blockBody = JSON.stringify(
    block.map((poly) => poly.map(roundPt)),
    null,
    2,
  );
  return `export interface WalkPoint {
  x: number;
  y: number;
}

/**
 * Walkable floor polygons in full-scene % coords (yellow).
 * Edit via ?walkEdit=1 → Copy JSON → paste here.
 */
export const OUTPOST_WALK_POLYGONS: WalkPoint[][] = ${walkBody};

/**
 * Blocked / no-walk polygons (red holes), e.g. table silhouette.
 * Point is walkable only if inside a walk poly AND outside all block polys.
 */
export const OUTPOST_BLOCK_POLYGONS: WalkPoint[][] = ${blockBody};
`;
}

function clientToPct(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): WalkPoint {
  const rect = el.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

type DragTarget =
  | { kind: 'draft'; index: number }
  | { kind: 'walk'; poly: number; index: number }
  | { kind: 'block'; poly: number; index: number };

export function WalkEditorOverlay() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<EditMode>('walk');
  const [draft, setDraft] = useState<WalkPoint[]>([]);
  const [walkClosed, setWalkClosed] = useState<WalkPoint[][]>(() =>
    OUTPOST_WALK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
  );
  const [blockClosed, setBlockClosed] = useState<WalkPoint[][]>(() =>
    OUTPOST_BLOCK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
  );
  const [status, setStatus] = useState(
    'Жёлтый = можно · Красный = нельзя · Close poly = готово',
  );
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const didDrag = useRef(false);

  // Editor polys drive gameplay immediately (before Copy JSON → file)
  useEffect(() => {
    setLiveWalkMask(walkClosed, blockClosed);
    return () => clearLiveWalkMask();
  }, [walkClosed, blockClosed]);

  const findVertexAt = useCallback(
    (p: WalkPoint): DragTarget | null => {
      for (let i = 0; i < draft.length; i++) {
        const v = draft[i]!;
        if (Math.hypot(v.x - p.x, v.y - p.y) <= VERTEX_HIT_PCT) {
          return { kind: 'draft', index: i };
        }
      }
      for (let pi = 0; pi < walkClosed.length; pi++) {
        const poly = walkClosed[pi]!;
        for (let i = 0; i < poly.length; i++) {
          const v = poly[i]!;
          if (Math.hypot(v.x - p.x, v.y - p.y) <= VERTEX_HIT_PCT) {
            return { kind: 'walk', poly: pi, index: i };
          }
        }
      }
      for (let pi = 0; pi < blockClosed.length; pi++) {
        const poly = blockClosed[pi]!;
        for (let i = 0; i < poly.length; i++) {
          const v = poly[i]!;
          if (Math.hypot(v.x - p.x, v.y - p.y) <= VERTEX_HIT_PCT) {
            return { kind: 'block', poly: pi, index: i };
          }
        }
      }
      return null;
    },
    [blockClosed, draft, walkClosed],
  );

  const moveVertex = useCallback((target: DragTarget, p: WalkPoint) => {
    const pt = roundPt(p);
    if (target.kind === 'draft') {
      setDraft((prev) => prev.map((v, i) => (i === target.index ? pt : v)));
      return;
    }
    if (target.kind === 'walk') {
      setWalkClosed((prev) =>
        prev.map((poly, pi) =>
          pi !== target.poly
            ? poly
            : poly.map((v, i) => (i === target.index ? pt : v)),
        ),
      );
      return;
    }
    setBlockClosed((prev) =>
      prev.map((poly, pi) =>
        pi !== target.poly
          ? poly
          : poly.map((v, i) => (i === target.index ? pt : v)),
      ),
    );
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const el = surfaceRef.current;
    if (!el) return;
    const p = clientToPct(event.clientX, event.clientY, el);
    const hit = findVertexAt(p);
    didDrag.current = false;
    if (hit) {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      setDrag(hit);
      setStatus('Тяни точку…');
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !surfaceRef.current) return;
    didDrag.current = true;
    const p = clientToPct(event.clientX, event.clientY, surfaceRef.current);
    moveVertex(drag, p);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = surfaceRef.current;
    if (el?.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }

    if (drag) {
      setDrag(null);
      setStatus(
        didDrag.current
          ? 'Точка сдвинута'
          : `Вершин: ${draft.length || 'closed'}`,
      );
      return;
    }

    if (event.button !== 0 || !el) return;
    const p = roundPt(clientToPct(event.clientX, event.clientY, el));
    setDraft((prev) => {
      const next = [...prev, p];
      setStatus(
        mode === 'block'
          ? `Красный · точек: ${next.length} · Close poly`
          : `Жёлтый · точек: ${next.length} · Close poly`,
      );
      return next;
    });
  };

  const undo = useCallback(() => {
    setDraft((prev) => prev.slice(0, -1));
  }, []);

  const switchMode = (next: EditMode) => {
    if (next === mode) return;
    if (draft.length > 0) {
      setDraft([]);
    }
    setMode(next);
    setStatus(
      next === 'block'
        ? 'Режим ЗАПРЕТ (красный) · обведи стол / ящики'
        : 'Режим ПОЛ (жёлтый) · обведи walkable',
    );
  };

  const closePoly = () => {
    if (draft.length < 3) {
      setStatus('Нужно ≥ 3 точки');
      return;
    }
    if (mode === 'walk') {
      // One floor mask at a time — replace, don't stack duplicates
      setWalkClosed([draft]);
    } else {
      setBlockClosed((prev) => [...prev, draft]);
    }
    setDraft([]);
    setStatus(
      mode === 'block'
        ? 'Красная зона готова · можно ещё или Copy JSON'
        : 'Жёлтая зона готова · Copy JSON → в файл',
    );
  };

  const clearMode = () => {
    setDraft([]);
    if (mode === 'walk') setWalkClosed([]);
    else setBlockClosed([]);
    setStatus(mode === 'block' ? 'Красные очищены' : 'Жёлтые очищены');
  };

  const resetToFile = () => {
    setWalkClosed(OUTPOST_WALK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))));
    setBlockClosed(
      OUTPOST_BLOCK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
    );
    setDraft([]);
    setStatus('Сброс к файлу');
  };

  const copyJson = async () => {
    let walk = walkClosed;
    let block = blockClosed;
    if (draft.length >= 3) {
      if (mode === 'walk') walk = [...walkClosed, draft];
      else block = [...blockClosed, draft];
    }
    if (walk.length === 0) {
      setStatus('Нужен хотя бы один жёлтый полигон');
      return;
    }
    if (walk.some((p) => p.length < 3) || block.some((p) => p.length < 3)) {
      setStatus('Все полигоны ≥ 3 точек');
      return;
    }
    const text = formatExport(walk, block);
    try {
      await navigator.clipboard.writeText(text);
      setStatus('Скопировано → замени весь outpostWalkMask.ts');
    } catch {
      setStatus('Clipboard fail — смотри console');
      console.log(text);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo]);

  const draftStroke =
    mode === 'block' ? 'rgba(248,113,113,0.95)' : 'rgba(57,255,20,0.95)';
  const draftFill =
    mode === 'block' ? 'rgba(248,113,113,0.25)' : 'rgba(57,255,20,0.2)';
  const draftDot = mode === 'block' ? 'bg-red-400' : 'bg-[#39ff14]';

  return (
    <div className="pointer-events-none absolute inset-0 z-[80]">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {walkClosed.map((poly, idx) => {
          if (poly.length < 2) return null;
          return (
            <polygon
              key={`w-${idx}`}
              points={poly.map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="rgba(250,204,21,0.22)"
              stroke="rgba(250,204,21,0.9)"
              strokeWidth={0.4}
            />
          );
        })}
        {blockClosed.map((poly, idx) => {
          if (poly.length < 2) return null;
          return (
            <polygon
              key={`b-${idx}`}
              points={poly.map((pt) => `${pt.x},${pt.y}`).join(' ')}
              fill="rgba(248,113,113,0.35)"
              stroke="rgba(248,113,113,0.95)"
              strokeWidth={0.45}
            />
          );
        })}
        {draft.length >= 2 && (
          <polygon
            points={draft.map((pt) => `${pt.x},${pt.y}`).join(' ')}
            fill={draftFill}
            stroke={draftStroke}
            strokeWidth={0.45}
          />
        )}
      </svg>

      <div
        ref={surfaceRef}
        className="pointer-events-auto absolute inset-0 z-[1] touch-none"
        style={{ cursor: drag ? 'grabbing' : 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {walkClosed.flatMap((poly, pi) =>
          poly.map((p, i) => (
            <div
              key={`wv-${pi}-${i}`}
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-amber-300 shadow"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          )),
        )}
        {blockClosed.flatMap((poly, pi) =>
          poly.map((p, i) => (
            <div
              key={`bv-${pi}-${i}`}
              className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-red-400 shadow"
              style={{ left: `${p.x}%`, top: `${p.y}%` }}
            />
          )),
        )}
        {draft.map((p, i) => (
          <div
            key={`d-${i}`}
            className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black shadow ${draftDot}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          />
        ))}
      </div>

      <div className="pointer-events-auto absolute bottom-20 left-1/2 z-[2] flex max-w-[95vw] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-lg border border-amber-300/40 bg-black/90 px-3 py-2 font-mono text-[10px] text-amber-100 shadow-lg backdrop-blur-md">
        <span className="text-amber-300/90">WALK EDIT</span>
        <button
          type="button"
          className={`rounded border px-2 py-1 ${
            mode === 'walk'
              ? 'border-amber-300/70 bg-amber-500/25 text-amber-100'
              : 'border-white/20 hover:bg-white/10'
          }`}
          onClick={() => switchMode('walk')}
        >
          Пол
        </button>
        <button
          type="button"
          className={`rounded border px-2 py-1 ${
            mode === 'block'
              ? 'border-red-400/70 bg-red-500/25 text-red-100'
              : 'border-white/20 hover:bg-white/10'
          }`}
          onClick={() => switchMode('block')}
        >
          Запрет
        </button>
        <span className="max-w-[36vw] truncate text-neutral-400">{status}</span>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={undo}
        >
          Undo
        </button>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={closePoly}
        >
          Close poly
        </button>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={clearMode}
        >
          Clear
        </button>
        <button
          type="button"
          className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
          onClick={resetToFile}
        >
          Reset
        </button>
        <button
          type="button"
          className="rounded border border-amber-300/50 bg-amber-500/20 px-2 py-1 font-semibold text-amber-100 hover:bg-amber-500/30"
          onClick={() => void copyJson()}
        >
          Copy JSON
        </button>
      </div>
    </div>
  );
}
