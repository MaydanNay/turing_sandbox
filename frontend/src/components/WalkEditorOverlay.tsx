/**
 * Dev scene editor tools: walk/block polygons + placeable props (brig).
 * Mounted on /scene-editor (DEV) → password from VITE_SCENE_EDITOR_PASSWORD.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { CharacterAssetEditor } from '@/components/sceneEditor/CharacterAssetEditor';
import { CharacterInfoModal } from '@/components/sceneEditor/CharacterInfoModal';
import { ASSETS } from '@/config/assets';
import {
  CHARACTERS,
  type CharacterDefinition,
} from '@/data/characters';
import {
  OUTPOST_BLOCK_POLYGONS,
  OUTPOST_WALK_POLYGONS,
  type WalkPoint,
} from '@/data/outpostWalkMask';
import {
  OUTPOST_SCENE_OBJECTS,
  SCENE_OBJECT_DEFS,
  type SceneObjectPlacement,
  type SceneObjectType,
} from '@/data/outpostSceneObjects';
import {
  cloneFurnitureLayout,
  type FurnitureLayout,
} from '@/data/outpostFurniture';
import {
  applyFurnitureDrag,
  applyFurnitureResize,
  formatFurnitureExport,
  furnitureSelectionSceneBox,
  hitFurniture,
  type FurnitureSelection,
} from '@/utils/furnitureEditor';
import {
  clearLiveFurniture,
  setLiveFurniture,
} from '@/utils/furnitureRuntime';
import {
  cloneEditorSnapshot,
  createEditorHistory,
  type EditorHistorySnapshot,
} from '@/utils/editorHistory';
import {
  clearLiveSceneObjects,
  setLiveSceneObjects,
} from '@/utils/sceneObjectsRuntime';
import {
  getEditorShowPlayers,
  getEditorUiVersion,
  resetEditorUiFlags,
  setEditorShowPlayers,
  subscribeEditorUi,
} from '@/utils/sceneEditorRuntime';
import {
  clearLiveWalkMask,
  setLiveWalkMask,
} from '@/utils/walkMaskRuntime';
import {
  serializeFurniture,
  serializeSceneObjects,
  serializeWalkMask,
  toPrettyJson,
} from '@/utils/sceneEditorSerialize';

const AUTH_KEY = 'turing_scene_editor_auth';
const VERTEX_HIT_PCT = 2.2;
const HANDLE_HIT_PCT = 2.8;

type EditMode = 'props' | 'polygons' | 'characters';
type PropsPaint = 'objects' | 'furniture';
type PolyPaint = 'walk' | 'block';
type CharacterPanel = 'info' | 'assets' | null;
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se';

type DragTarget =
  | { kind: 'draft'; index: number }
  | { kind: 'walk'; poly: number; index: number }
  | { kind: 'block'; poly: number; index: number }
  | {
      kind: 'object-move';
      id: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: 'object-resize';
      id: string;
      handle: ResizeHandle;
      startX: number;
      startY: number;
      orig: SceneObjectPlacement;
    }
  | {
      kind: 'furniture-move';
      sel: FurnitureSelection;
      startX: number;
      startY: number;
      orig: FurnitureLayout;
    }
  | {
      kind: 'furniture-resize';
      sel: FurnitureSelection;
      startX: number;
      startY: number;
      orig: FurnitureLayout;
    };

function sameFurnitureSel(
  a: FurnitureSelection | null,
  b: FurnitureSelection | null,
): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'seat' && b.kind === 'seat') return a.index === b.index;
  return true;
}

function editorPassword(): string {
  return import.meta.env.VITE_SCENE_EDITOR_PASSWORD?.trim() || 'admin123';
}

function isEditorAuthed(): boolean {
  try {
    return sessionStorage.getItem(AUTH_KEY) === '1';
  } catch {
    return false;
  }
}

function setEditorAuthed(ok: boolean): void {
  try {
    if (ok) sessionStorage.setItem(AUTH_KEY, '1');
    else sessionStorage.removeItem(AUTH_KEY);
  } catch {
    /* ignore */
  }
}

function roundPt(p: WalkPoint): WalkPoint {
  return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
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

function hitObject(
  p: WalkPoint,
  objects: SceneObjectPlacement[],
): SceneObjectPlacement | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i]!;
    if (p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h) {
      return o;
    }
  }
  return null;
}

function hitResizeHandle(
  p: WalkPoint,
  o: SceneObjectPlacement,
): ResizeHandle | null {
  const corners: { h: ResizeHandle; x: number; y: number }[] = [
    { h: 'nw', x: o.x, y: o.y },
    { h: 'ne', x: o.x + o.w, y: o.y },
    { h: 'sw', x: o.x, y: o.y + o.h },
    { h: 'se', x: o.x + o.w, y: o.y + o.h },
  ];
  for (const c of corners) {
    if (Math.hypot(c.x - p.x, c.y - p.y) <= HANDLE_HIT_PCT) return c.h;
  }
  return null;
}

function applyResize(
  orig: SceneObjectPlacement,
  handle: ResizeHandle,
  p: WalkPoint,
): SceneObjectPlacement {
  const minSize = 4;
  let { x, y, w, h } = orig;
  const right = orig.x + orig.w;
  const bottom = orig.y + orig.h;

  if (handle === 'se') {
    w = Math.max(minSize, p.x - orig.x);
    h = Math.max(minSize, p.y - orig.y);
  } else if (handle === 'sw') {
    const nx = Math.min(p.x, right - minSize);
    w = right - nx;
    x = nx;
    h = Math.max(minSize, p.y - orig.y);
  } else if (handle === 'ne') {
    w = Math.max(minSize, p.x - orig.x);
    const ny = Math.min(p.y, bottom - minSize);
    h = bottom - ny;
    y = ny;
  } else {
    const nx = Math.min(p.x, right - minSize);
    const ny = Math.min(p.y, bottom - minSize);
    w = right - nx;
    h = bottom - ny;
    x = nx;
    y = ny;
  }

  x = clamp(x, 0, 100 - minSize);
  y = clamp(y, 0, 100 - minSize);
  w = clamp(w, minSize, 100 - x);
  h = clamp(h, minSize, 100 - y);

  return { ...orig, x, y, w, h };
}

function EditorAuthGate({ onUnlock }: { onUnlock: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (password === editorPassword()) {
      setEditorAuthed(true);
      onUnlock();
      return;
    }
    setError('Неверный пароль');
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4">
      <form
        className="w-full max-w-sm rounded-xl border border-amber-300/30 bg-black/95 p-5 shadow-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-amber-300/80">
          Редактор сцены
        </p>
        <p className="mt-2 text-sm text-neutral-400">
          Введите пароль, чтобы править проходку и объекты.
        </p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
          placeholder="Пароль"
          className="mt-4 w-full rounded-md border border-white/20 bg-black/60 px-3 py-2 font-mono text-sm text-amber-50 focus:border-amber-300/50 focus:outline-none"
        />
        {error && (
          <p className="mt-2 font-mono text-[11px] text-red-300">{error}</p>
        )}
        <button
          type="submit"
          className="mt-4 w-full rounded-md border border-amber-300/45 bg-amber-500/20 px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-100 hover:bg-amber-500/30"
        >
          Войти
        </button>
      </form>
    </div>
  );
}

export function WalkEditorOverlay() {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [authed, setAuthed] = useState(() => isEditorAuthed());
  const [mode, setMode] = useState<EditMode>('props');
  const [propsPaint, setPropsPaint] = useState<PropsPaint>('objects');
  const [polyPaint, setPolyPaint] = useState<PolyPaint>('walk');
  const [characterFocus, setCharacterFocus] = useState<CharacterDefinition | null>(
    null,
  );
  const [characterPanel, setCharacterPanel] = useState<CharacterPanel>(null);
  const [draft, setDraft] = useState<WalkPoint[]>([]);
  const [walkClosed, setWalkClosed] = useState<WalkPoint[][]>(() =>
    OUTPOST_WALK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
  );
  const [blockClosed, setBlockClosed] = useState<WalkPoint[][]>(() =>
    OUTPOST_BLOCK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
  );
  const [objects, setObjects] = useState<SceneObjectPlacement[]>(() =>
    OUTPOST_SCENE_OBJECTS.map((o) => ({ ...o })),
  );
  const [furniture, setFurniture] = useState<FurnitureLayout>(() =>
    cloneFurnitureLayout(),
  );
  const [furnitureSel, setFurnitureSel] = useState<FurnitureSelection | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState(
    'Объекты: добавить → тянуть → углы для размера',
  );
  const [drag, setDrag] = useState<DragTarget | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [histRev, setHistRev] = useState(0);
  const historyRef = useRef(createEditorHistory());
  const gestureHistoryPushed = useRef(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({
    walkClosed,
    blockClosed,
    draft,
    objects,
    furniture,
  });
  stateRef.current = {
    walkClosed,
    blockClosed,
    draft,
    objects,
    furniture,
  };

  const captureSnapshot = useCallback((): EditorHistorySnapshot => {
    return cloneEditorSnapshot(stateRef.current);
  }, []);

  const applySnapshot = useCallback((snap: EditorHistorySnapshot) => {
    setWalkClosed(snap.walkClosed);
    setBlockClosed(snap.blockClosed);
    setDraft(snap.draft);
    setObjects(snap.objects);
    setFurniture(snap.furniture);
    setDrag(null);
    setSelectedId(null);
    setFurnitureSel(null);
  }, []);

  const pushHistory = useCallback(() => {
    historyRef.current.push(captureSnapshot());
    setHistRev((n) => n + 1);
  }, [captureSnapshot]);

  const undo = useCallback(() => {
    const snap = historyRef.current.undo(captureSnapshot());
    if (!snap) {
      setStatus('Нечего отменять');
      return;
    }
    applySnapshot(snap);
    setHistRev((n) => n + 1);
    setStatus('Шаг назад');
  }, [applySnapshot, captureSnapshot]);

  const redo = useCallback(() => {
    const snap = historyRef.current.redo(captureSnapshot());
    if (!snap) {
      setStatus('Нечего вернуть');
      return;
    }
    applySnapshot(snap);
    setHistRev((n) => n + 1);
    setStatus('Шаг вперёд');
  }, [applySnapshot, captureSnapshot]);

  const canUndo = histRev >= 0 && historyRef.current.canUndo;
  const canRedo = histRev >= 0 && historyRef.current.canRedo;

  useSyncExternalStore(subscribeEditorUi, getEditorUiVersion, getEditorUiVersion);
  const showPlayers = getEditorShowPlayers();

  useEffect(() => {
    setLiveWalkMask(walkClosed, blockClosed);
  }, [walkClosed, blockClosed]);

  useEffect(() => {
    setLiveSceneObjects(objects);
  }, [objects]);

  useEffect(() => {
    setLiveFurniture(furniture);
  }, [furniture]);

  useEffect(() => {
    return () => {
      clearLiveWalkMask();
      clearLiveSceneObjects();
      clearLiveFurniture();
      resetEditorUiFlags();
    };
  }, []);

  const selected = useMemo(
    () => objects.find((o) => o.id === selectedId) ?? null,
    [objects, selectedId],
  );

  const furnitureBox = useMemo(() => {
    if (!furnitureSel) return null;
    return furnitureSelectionSceneBox(furnitureSel, furniture);
  }, [furnitureSel, furniture]);

  const togglePlayers = () => {
    setEditorShowPlayers(!showPlayers);
  };

  const editingObjects = mode === 'props' && propsPaint === 'objects';
  const editingFurniture = mode === 'props' && propsPaint === 'furniture';

  const switchMode = (next: EditMode) => {
    setMode(next);
    setDraft([]);
    setDrag(null);
    setSelectedId(null);
    setFurnitureSel(null);
    setCharacterFocus(null);
    setCharacterPanel(null);
    if (next === 'props') {
      setStatus(
        propsPaint === 'furniture'
          ? 'Основа: группа / стол / стулья · угол = размер'
          : 'Карцер: добавить → тянуть → углы для размера',
      );
    } else if (next === 'characters') {
      setStatus('Персонажи: клик по имени → инфо → карандаш для ассетов');
    } else {
      setStatus(
        polyPaint === 'block'
          ? 'Красный = нельзя · Закрыть полигон = готово'
          : 'Жёлтый = можно · Закрыть полигон = готово',
      );
    }
  };

  const switchPropsPaint = (next: PropsPaint) => {
    if (next === propsPaint) return;
    setPropsPaint(next);
    setDrag(null);
    setSelectedId(null);
    setFurnitureSel(null);
    setStatus(
      next === 'furniture'
        ? 'Основа: группа / стол / стулья · угол = размер'
        : 'Карцер: добавить → тянуть → углы для размера',
    );
  };

  const switchPolyPaint = (next: PolyPaint) => {
    if (next === polyPaint) return;
    setPolyPaint(next);
    setDraft([]);
    setDrag(null);
    setStatus(
      next === 'block'
        ? 'Красный = нельзя · Закрыть полигон = готово'
        : 'Жёлтый = можно · Закрыть полигон = готово',
    );
  };

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
    [draft, walkClosed, blockClosed],
  );

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!surfaceRef.current || !authed) return;
    if (mode === 'characters') return;
    const p = clientToPct(e.clientX, e.clientY, surfaceRef.current);
    gestureHistoryPushed.current = false;

    if (editingFurniture) {
      if (furnitureSel && furnitureBox) {
        const hx = furnitureBox.x + furnitureBox.w;
        const hy = furnitureBox.y + furnitureBox.h;
        if (Math.hypot(hx - p.x, hy - p.y) <= HANDLE_HIT_PCT) {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            kind: 'furniture-resize',
            sel: furnitureSel,
            startX: p.x,
            startY: p.y,
            orig: cloneFurnitureLayout(furniture),
          });
          return;
        }
      }
      const hit = hitFurniture(p, furniture);
      if (hit) {
        setFurnitureSel(hit);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({
          kind: 'furniture-move',
          sel: hit,
          startX: p.x,
          startY: p.y,
          orig: cloneFurnitureLayout(furniture),
        });
        return;
      }
      setFurnitureSel(null);
      return;
    }

    if (editingObjects) {
      for (let i = objects.length - 1; i >= 0; i--) {
        const o = objects[i]!;
        const handle = hitResizeHandle(p, o);
        if (handle) {
          setSelectedId(o.id);
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag({
            kind: 'object-resize',
            id: o.id,
            handle,
            startX: p.x,
            startY: p.y,
            orig: { ...o },
          });
          return;
        }
      }
      const hit = hitObject(p, objects);
      if (hit) {
        setSelectedId(hit.id);
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({
          kind: 'object-move',
          id: hit.id,
          startX: p.x,
          startY: p.y,
          origX: hit.x,
          origY: hit.y,
        });
        return;
      }
      setSelectedId(null);
      return;
    }

    const vertex = findVertexAt(p);
    if (vertex) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag(vertex);
      return;
    }
    pushHistory();
    setDraft((d) => [...d, roundPt(p)]);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag || !surfaceRef.current) return;
    if (!gestureHistoryPushed.current) {
      pushHistory();
      gestureHistoryPushed.current = true;
    }
    const p = clientToPct(e.clientX, e.clientY, surfaceRef.current);

    if (drag.kind === 'furniture-move') {
      setFurniture(
        applyFurnitureDrag(furniture, drag.sel, { x: drag.startX, y: drag.startY }, p, drag.orig),
      );
      return;
    }
    if (drag.kind === 'furniture-resize') {
      setFurniture(applyFurnitureResize(furniture, drag.sel, p, drag.orig));
      return;
    }

    if (drag.kind === 'object-move') {
      const dx = p.x - drag.startX;
      const dy = p.y - drag.startY;
      setObjects((list) =>
        list.map((o) => {
          if (o.id !== drag.id) return o;
          return {
            ...o,
            x: clamp(drag.origX + dx, 0, 100 - o.w),
            y: clamp(drag.origY + dy, 0, 100 - o.h),
          };
        }),
      );
      return;
    }
    if (drag.kind === 'object-resize') {
      setObjects((list) =>
        list.map((o) =>
          o.id === drag.id ? applyResize(drag.orig, drag.handle, p) : o,
        ),
      );
      return;
    }

    const next = roundPt(p);
    if (drag.kind === 'draft') {
      setDraft((d) => d.map((pt, i) => (i === drag.index ? next : pt)));
    } else if (drag.kind === 'walk') {
      setWalkClosed((polys) =>
        polys.map((poly, pi) =>
          pi === drag.poly
            ? poly.map((pt, i) => (i === drag.index ? next : pt))
            : poly,
        ),
      );
    } else if (drag.kind === 'block') {
      setBlockClosed((polys) =>
        polys.map((poly, pi) =>
          pi === drag.poly
            ? poly.map((pt, i) => (i === drag.index ? next : pt))
            : poly,
        ),
      );
    }
  };

  const onPointerUp = () => {
    gestureHistoryPushed.current = false;
    setDrag(null);
  };

  const closePoly = () => {
    if (draft.length < 3) {
      setStatus('Нужно ≥ 3 точки');
      return;
    }
    pushHistory();
    if (polyPaint === 'walk') setWalkClosed((w) => [...w, draft]);
    else setBlockClosed((b) => [...b, draft]);
    setDraft([]);
    setStatus('Полигон закрыт');
  };

  const addObject = (type: SceneObjectType) => {
    const def = SCENE_OBJECT_DEFS.find((d) => d.type === type);
    if (!def) return;
    const count = objects.filter((o) => o.type === type).length + 1;
    const id = `${type}-${count}-${Date.now().toString(36).slice(-4)}`;
    const next: SceneObjectPlacement = {
      id,
      type,
      x: 50 - def.defaultW / 2,
      y: 50 - def.defaultH / 2,
      w: def.defaultW,
      h: def.defaultH,
    };
    pushHistory();
    setObjects((list) => [...list, next]);
    setSelectedId(id);
    setMode('props');
    setPropsPaint('objects');
    setStatus(`Добавлен: ${def.label} ${count}`);
  };

  const clearMode = () => {
    if (mode === 'characters') {
      setCharacterFocus(null);
      setCharacterPanel(null);
      setStatus('Персонажи: выбор сброшен');
      return;
    }
    pushHistory();
    if (editingObjects) {
      setObjects([]);
      setSelectedId(null);
      setStatus('Карцер очищен');
      return;
    }
    if (editingFurniture) {
      setFurniture(cloneFurnitureLayout());
      setFurnitureSel(null);
      setStatus('Основа сброшена к файлу');
      return;
    }
    setDraft([]);
    if (polyPaint === 'walk') setWalkClosed([]);
    else setBlockClosed([]);
    setStatus(polyPaint === 'walk' ? 'Разрешённые очищены' : 'Запрещённые очищены');
  };

  const resetToFile = () => {
    pushHistory();
    setWalkClosed(OUTPOST_WALK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))));
    setBlockClosed(
      OUTPOST_BLOCK_POLYGONS.map((p) => p.map((pt) => ({ ...pt }))),
    );
    setObjects(OUTPOST_SCENE_OBJECTS.map((o) => ({ ...o })));
    setFurniture(cloneFurnitureLayout());
    setFurnitureSel(null);
    setDraft([]);
    setSelectedId(null);
    setStatus('Сброс к файлу');
  };

  const downloadJsonFile = (filename: string, text: string) => {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadWalkJson = () => {
    let walk = walkClosed;
    let block = blockClosed;
    if (draft.length >= 3) {
      if (polyPaint === 'walk') walk = [...walkClosed, draft];
      else block = [...blockClosed, draft];
    }
    if (walk.length === 0) {
      setStatus('Нужен хотя бы один жёлтый полигон');
      return;
    }
    downloadJsonFile(
      'outpostWalkMask.json',
      toPrettyJson(serializeWalkMask(walk, block)),
    );
    setStatus('Скачан outpostWalkMask.json (вся проходка)');
  };

  const downloadObjectsJson = () => {
    downloadJsonFile(
      'outpostSceneObjects.json',
      toPrettyJson(serializeSceneObjects(objects)),
    );
    setStatus(
      objects.length === 0
        ? 'Скачан outpostSceneObjects.json (пусто)'
        : `Скачан outpostSceneObjects.json (все объекты: ${objects.length})`,
    );
  };

  const downloadFurnitureJson = () => {
    downloadJsonFile('outpostFurniture.json', formatFurnitureExport(furniture));
    setStatus('Скачан outpostFurniture.json (вся мебель)');
  };

  const downloadCurrentMode = () => {
    if (mode === 'characters') {
      setStatus('Скачивание персонажей — через редактор ассетов');
      return;
    }
    if (editingObjects) downloadObjectsJson();
    else if (editingFurniture) downloadFurnitureJson();
    else downloadWalkJson();
  };

  useEffect(() => {
    if (!actionsOpen && !modeOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (actionsMenuRef.current?.contains(target)) return;
      if (modeMenuRef.current?.contains(target)) return;
      setActionsOpen(false);
      setModeOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActionsOpen(false);
        setModeOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [actionsOpen, modeOpen]);

  const modeLabel =
    mode === 'props' ? 'Объекты' : mode === 'characters' ? 'Персонажи' : 'Полигоны';

  const modeButtonClass =
    mode === 'characters'
      ? 'border-violet-300/70 bg-violet-500/25 text-violet-100'
      : mode === 'props' && propsPaint === 'furniture'
        ? 'border-sky-300/70 bg-sky-500/25 text-sky-100'
        : mode === 'polygons' && polyPaint === 'block'
          ? 'border-red-400/70 bg-red-500/25 text-red-100'
          : 'border-amber-300/70 bg-amber-500/25 text-amber-100';

  const saveAllToDisk = useCallback(async () => {
    if (saving) return;

    if (furniture.seats.length !== 8) {
      setStatus('Мебель повреждена: нужно ровно 8 стульев');
      return;
    }

    let walk = walkClosed;
    let block = blockClosed;
    if (draft.length >= 3 && mode === 'polygons') {
      if (polyPaint === 'walk') walk = [...walkClosed, draft];
      else block = [...blockClosed, draft];
    }

    const payload: {
      password: string;
      walk?: ReturnType<typeof serializeWalkMask>;
      objects: ReturnType<typeof serializeSceneObjects>;
      furniture: ReturnType<typeof serializeFurniture>;
    } = {
      password: editorPassword(),
      objects: serializeSceneObjects(objects),
      furniture: serializeFurniture(furniture),
    };

    if (walk.length > 0) {
      payload.walk = serializeWalkMask(walk, block);
    }

    setSaving(true);
    try {
      const res = await fetch('/__scene-editor/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let data: { ok?: boolean; written?: string[]; error?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setStatus(
          res.status === 404
            ? 'Сохранение недоступно — перезапустите npm run dev'
            : `Ошибка сохранения (${res.status})`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus(data.error ?? `Ошибка сохранения (${res.status})`);
        return;
      }
      const names = (data.written ?? [])
        .map((p) => p.split('/').pop())
        .filter(Boolean)
        .join(', ');
      if (!payload.walk) {
        setStatus(
          `Сохранено: ${names} · проходка не тронута (нужен ≥1 жёлтый полигон)`,
        );
      } else {
        setStatus(`Сохранено на диск: ${names}`);
      }
    } catch (err) {
      setStatus(
        err instanceof Error
          ? `Сохранение недоступно: ${err.message}`
          : 'Сохранение недоступно — перезапустите npm run dev',
      );
    } finally {
      setSaving(false);
    }
  }, [saving, furniture, walkClosed, blockClosed, draft, mode, polyPaint, objects]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void saveAllToDisk();
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'y' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        redo();
        return;
      }
      if (e.key === 'z' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (editingObjects && selectedId) {
          e.preventDefault();
          pushHistory();
          setObjects((list) => list.filter((o) => o.id !== selectedId));
          setSelectedId(null);
        }
      }
      if (e.key === 'Escape') {
        if (characterPanel) {
          if (characterPanel === 'assets') setCharacterPanel('info');
          else {
            setCharacterPanel(null);
            setCharacterFocus(null);
          }
          return;
        }
        setSelectedId(null);
        setFurnitureSel(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, mode, selectedId, saveAllToDisk, pushHistory, characterPanel]);

  if (!authed) {
    return createPortal(
      <EditorAuthGate onUnlock={() => setAuthed(true)} />,
      document.body,
    );
  }

  const draftStroke =
    polyPaint === 'block' ? 'rgba(248,113,113,0.95)' : 'rgba(57,255,20,0.95)';
  const draftFill =
    polyPaint === 'block' ? 'rgba(248,113,113,0.25)' : 'rgba(57,255,20,0.2)';
  const draftDot = polyPaint === 'block' ? 'bg-red-400' : 'bg-[#39ff14]';

  const cursor =
    drag?.kind === 'object-move' || drag?.kind === 'furniture-move'
      ? 'grabbing'
      : drag?.kind === 'object-resize' || drag?.kind === 'furniture-resize'
        ? 'nwse-resize'
        : editingObjects || editingFurniture || mode === 'characters'
          ? 'default'
          : drag
            ? 'grabbing'
            : 'crosshair';

  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-[80]">
        {mode === 'polygons' && (
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
        )}

        {editingObjects && selected && (
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div
              className="absolute border-2 border-amber-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{
                left: `${selected.x}%`,
                top: `${selected.y}%`,
                width: `${selected.w}%`,
                height: `${selected.h}%`,
              }}
            >
              {(['nw', 'ne', 'sw', 'se'] as ResizeHandle[]).map((h) => (
                <div
                  key={h}
                  className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black bg-amber-300"
                  style={{
                    left: h === 'nw' || h === 'sw' ? '0%' : '100%',
                    top: h === 'nw' || h === 'ne' ? '0%' : '100%',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {editingFurniture && furnitureBox && (
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div
              className="absolute border-2 border-sky-300/90 shadow-[0_0_0_1px_rgba(0,0,0,0.5)]"
              style={{
                left: `${furnitureBox.x}%`,
                top: `${furnitureBox.y}%`,
                width: `${furnitureBox.w}%`,
                height: `${furnitureBox.h}%`,
              }}
            >
              <div
                className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-black bg-sky-300"
                style={{ left: '100%', top: '100%' }}
              />
            </div>
          </div>
        )}

        <div
          ref={surfaceRef}
          className="pointer-events-auto absolute inset-0 z-[2] touch-none"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {mode === 'polygons' &&
            walkClosed.flatMap((poly, pi) =>
              poly.map((p, i) => (
                <div
                  key={`wv-${pi}-${i}`}
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-amber-300 shadow"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                />
              )),
            )}
          {mode === 'polygons' &&
            blockClosed.flatMap((poly, pi) =>
              poly.map((p, i) => (
                <div
                  key={`bv-${pi}-${i}`}
                  className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black bg-red-400 shadow"
                  style={{ left: `${p.x}%`, top: `${p.y}%` }}
                />
              )),
            )}
          {mode === 'polygons' &&
            draft.map((p, i) => (
              <div
                key={`d-${i}`}
                className={`pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black shadow ${draftDot}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
              />
            ))}
        </div>
      </div>

      {createPortal(
        <>
          <button
            type="button"
            className={`pointer-events-auto fixed right-4 top-4 z-[100] rounded-lg border px-3 py-2 font-mono text-[11px] shadow-lg backdrop-blur-md ${
              showPlayers
                ? 'border-emerald-400/50 bg-black/90 text-emerald-100 hover:bg-emerald-500/15'
                : 'border-amber-300/40 bg-black/90 text-amber-100 hover:bg-amber-500/15'
            }`}
            onClick={togglePlayers}
          >
            {showPlayers ? 'Скрыть игроков' : 'Показать игроков'}
          </button>

          {mode === 'characters' && (
            <div className="pointer-events-auto fixed left-4 top-4 z-[100] flex w-60 flex-col gap-2 rounded-lg border border-violet-300/35 bg-black/90 p-2.5 font-mono text-[11px] text-amber-50 shadow-lg backdrop-blur-md">
              <p className="px-1 uppercase tracking-wider text-violet-300/80">
                Персонажи
              </p>
              <div className="max-h-[min(70vh,28rem)] space-y-1 overflow-y-auto">
                {CHARACTERS.map((character) => (
                  <button
                    key={character.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${
                      characterFocus?.id === character.id
                        ? 'bg-violet-500/25 text-violet-100'
                        : 'text-neutral-300 hover:bg-white/10'
                    }`}
                    onClick={() => {
                      setCharacterFocus(character);
                      setCharacterPanel('info');
                    }}
                  >
                    <img
                      src={ASSETS.characters.chibi(character.id)}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded border border-white/15 object-contain bg-black/30"
                      onError={(e) => {
                        e.currentTarget.src = ASSETS.characters.default;
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {character.displayName}
                      <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                        {character.role} · стул {character.seat}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {editingObjects && (
            <div className="pointer-events-auto fixed left-4 top-4 z-[100] flex w-56 flex-col gap-2 rounded-lg border border-amber-300/35 bg-black/90 p-2.5 font-mono text-[11px] text-amber-50 shadow-lg backdrop-blur-md">
              <p className="px-1 uppercase tracking-wider text-amber-300/80">
                Карцер
              </p>
              {SCENE_OBJECT_DEFS.map((def) => (
                <button
                  key={def.type}
                  type="button"
                  className="rounded border border-white/15 px-2 py-1.5 text-left hover:border-amber-300/40 hover:bg-amber-500/15"
                  onClick={() => addObject(def.type)}
                >
                  + {def.label}
                </button>
              ))}
              <div className="mt-1 max-h-40 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
                {objects.length === 0 && (
                  <p className="px-1 text-neutral-500">Пока пусто</p>
                )}
                {objects.map((o) => {
                  const label =
                    SCENE_OBJECT_DEFS.find((d) => d.type === o.type)?.label ??
                    o.type;
                  const n =
                    objects.filter((x) => x.type === o.type).indexOf(o) + 1;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left ${
                        selectedId === o.id
                          ? 'bg-amber-500/25 text-amber-100'
                          : 'text-neutral-300 hover:bg-white/10'
                      }`}
                      onClick={() => setSelectedId(o.id)}
                    >
                      {label} {n}
                    </button>
                  );
                })}
              </div>
              {selected && (
                <button
                  type="button"
                  className="rounded border border-red-400/40 px-2 py-1 text-red-200 hover:bg-red-500/15"
                  onClick={() => {
                    pushHistory();
                    setObjects((list) =>
                      list.filter((o) => o.id !== selected.id),
                    );
                    setSelectedId(null);
                  }}
                >
                  Удалить выбранный
                </button>
              )}
            </div>
          )}

          {editingFurniture && (
            <div className="pointer-events-auto fixed left-4 top-4 z-[100] flex w-56 flex-col gap-2 rounded-lg border border-sky-300/35 bg-black/90 p-2.5 font-mono text-[11px] text-amber-50 shadow-lg backdrop-blur-md">
              <p className="px-1 uppercase tracking-wider text-sky-300/80">
                Основа
              </p>
              <button
                type="button"
                className={`w-full rounded px-2 py-1 text-left ${
                  sameFurnitureSel(furnitureSel, { kind: 'group' })
                    ? 'bg-sky-500/25 text-sky-100'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
                onClick={() => setFurnitureSel({ kind: 'group' })}
              >
                Группа
              </button>
              <button
                type="button"
                className={`w-full rounded px-2 py-1 text-left ${
                  sameFurnitureSel(furnitureSel, { kind: 'table' })
                    ? 'bg-sky-500/25 text-sky-100'
                    : 'text-neutral-300 hover:bg-white/10'
                }`}
                onClick={() => setFurnitureSel({ kind: 'table' })}
              >
                Стол
              </button>
              <div className="max-h-52 space-y-1 overflow-y-auto border-t border-white/10 pt-2">
                {furniture.seats.map((seat, index) => {
                  const character = CHARACTERS.find((c) => c.seat === index + 1);
                  const sel: FurnitureSelection = { kind: 'seat', index };
                  return (
                    <button
                      key={index}
                      type="button"
                      className={`w-full rounded px-2 py-1 text-left ${
                        sameFurnitureSel(furnitureSel, sel)
                          ? 'bg-sky-500/25 text-sky-100'
                          : 'text-neutral-300 hover:bg-white/10'
                      }`}
                      onClick={() => setFurnitureSel(sel)}
                    >
                      Стул {index + 1}
                      {character ? ` · ${character.displayName}` : ''}
                      {seat.behindTable ? ' · зад' : ''}
                    </button>
                  );
                })}
              </div>
              {furnitureSel?.kind === 'seat' && (
                <button
                  type="button"
                  className="rounded border border-white/20 px-2 py-1 hover:bg-white/10"
                  onClick={() => {
                    const i = furnitureSel.index;
                    pushHistory();
                    setFurniture((f) => ({
                      ...f,
                      seats: f.seats.map((s, idx) =>
                        idx === i
                          ? { ...s, behindTable: !s.behindTable }
                          : s,
                      ),
                    }));
                  }}
                >
                  {furniture.seats[furnitureSel.index]?.behindTable
                    ? 'Убрать «за столом»'
                    : 'Пометить «за столом»'}
                </button>
              )}
            </div>
          )}

          <div className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-[min(98vw,1180px)] -translate-x-1/2 flex-col items-stretch gap-1.5">
            <p className="pointer-events-none truncate px-1 text-center font-mono text-[11px] text-amber-100/90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
              {status}
            </p>
            <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-300/40 bg-black/90 px-3 py-2.5 font-mono text-[11px] text-amber-100 shadow-lg backdrop-blur-md">
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  disabled={!canUndo}
                  className="inline-flex size-7 items-center justify-center rounded border border-white/20 hover:bg-white/10 disabled:opacity-40"
                  onClick={undo}
                  title="Назад (Ctrl+Z)"
                  aria-label="Назад"
                >
                  <ArrowLeft className="size-3.5" strokeWidth={2.25} />
                </button>
                <button
                  type="button"
                  disabled={!canRedo}
                  className="inline-flex size-7 items-center justify-center rounded border border-white/20 hover:bg-white/10 disabled:opacity-40"
                  onClick={redo}
                  title="Вперёд (Ctrl+Shift+Z / Ctrl+Y)"
                  aria-label="Вперёд"
                >
                  <ArrowRight className="size-3.5" strokeWidth={2.25} />
                </button>
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                <div className="relative" ref={modeMenuRef}>
                  <button
                    type="button"
                    aria-expanded={modeOpen}
                    aria-haspopup="menu"
                    className={`rounded border px-2.5 py-1 ${modeButtonClass}`}
                    onClick={() => {
                      setModeOpen((open) => !open);
                      setActionsOpen(false);
                    }}
                  >
                    {modeLabel} ▾
                  </button>
                  {modeOpen && (
                    <div
                      role="menu"
                      className="absolute bottom-[calc(100%+6px)] left-1/2 z-[110] min-w-[12rem] -translate-x-1/2 overflow-hidden rounded-lg border border-amber-300/40 bg-black/95 py-1 shadow-xl backdrop-blur-md"
                    >
                      {(
                        [
                          ['props', 'Объекты'],
                          ['characters', 'Персонажи'],
                          ['polygons', 'Полигоны передвижения'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          role="menuitem"
                          className={`block w-full px-3 py-1.5 text-left hover:bg-white/10 ${
                            mode === value
                              ? value === 'characters'
                                ? 'text-violet-200'
                                : 'text-amber-200'
                              : 'text-amber-100'
                          }`}
                          onClick={() => {
                            switchMode(value);
                            setModeOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {mode === 'props' && (
                  <div className="flex overflow-hidden rounded border border-white/20">
                    <button
                      type="button"
                      className={`px-2.5 py-1 ${
                        propsPaint === 'objects'
                          ? 'bg-amber-500/30 text-amber-100'
                          : 'text-amber-100/70 hover:bg-white/10'
                      }`}
                      onClick={() => switchPropsPaint('objects')}
                    >
                      Карцер
                    </button>
                    <button
                      type="button"
                      className={`border-l border-white/20 px-2.5 py-1 ${
                        propsPaint === 'furniture'
                          ? 'bg-sky-500/30 text-sky-100'
                          : 'text-amber-100/70 hover:bg-white/10'
                      }`}
                      onClick={() => switchPropsPaint('furniture')}
                    >
                      Основа
                    </button>
                  </div>
                )}
                {mode === 'polygons' && (
                  <>
                    <div className="flex overflow-hidden rounded border border-white/20">
                      <button
                        type="button"
                        className={`px-2.5 py-1 ${
                          polyPaint === 'walk'
                            ? 'bg-amber-500/30 text-amber-100'
                            : 'text-amber-100/70 hover:bg-white/10'
                        }`}
                        onClick={() => switchPolyPaint('walk')}
                      >
                        Разрешено
                      </button>
                      <button
                        type="button"
                        className={`border-l border-white/20 px-2.5 py-1 ${
                          polyPaint === 'block'
                            ? 'bg-red-500/30 text-red-100'
                            : 'text-amber-100/70 hover:bg-white/10'
                        }`}
                        onClick={() => switchPolyPaint('block')}
                      >
                        Запрещено
                      </button>
                    </div>
                    <button
                      type="button"
                      className="rounded border border-white/20 px-2.5 py-1 hover:bg-white/10"
                      onClick={closePoly}
                    >
                      Закрыть полигон
                    </button>
                  </>
                )}
              </div>

              <div className="relative shrink-0" ref={actionsMenuRef}>
                <button
                  type="button"
                  aria-expanded={actionsOpen}
                  aria-haspopup="menu"
                  className={`rounded border px-2.5 py-1 ${
                    actionsOpen
                      ? 'border-amber-300/70 bg-amber-500/25 text-amber-100'
                      : 'border-white/20 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    setActionsOpen((open) => !open);
                    setModeOpen(false);
                  }}
                >
                  Действия ▾
                </button>
                {actionsOpen && (
                  <div
                    role="menu"
                    className="absolute bottom-[calc(100%+6px)] right-0 z-[110] min-w-[11.5rem] overflow-hidden rounded-lg border border-amber-300/40 bg-black/95 py-1 shadow-xl backdrop-blur-md"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-amber-100 hover:bg-white/10"
                      onClick={() => {
                        clearMode();
                        setActionsOpen(false);
                      }}
                    >
                      Очистить
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-amber-100 hover:bg-white/10"
                      onClick={() => {
                        resetToFile();
                        setActionsOpen(false);
                      }}
                    >
                      Сбросить
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="block w-full px-3 py-1.5 text-left text-amber-100 hover:bg-white/10"
                      onClick={() => {
                        downloadCurrentMode();
                        setActionsOpen(false);
                      }}
                    >
                      Скачать
                      <span className="mt-0.5 block text-[10px] text-amber-100/55">
                        {editingObjects
                          ? 'карцер'
                          : editingFurniture
                            ? 'основа'
                            : mode === 'characters'
                              ? 'персонажи'
                              : 'проходка'}
                      </span>
                    </button>
                    <div className="my-1 border-t border-white/10" />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={saving}
                      className="block w-full px-3 py-1.5 text-left font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50"
                      onClick={() => {
                        setActionsOpen(false);
                        void saveAllToDisk();
                      }}
                    >
                      {saving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {characterFocus && characterPanel === 'info' && (
            <CharacterInfoModal
              character={characterFocus}
              onClose={() => {
                setCharacterPanel(null);
                setCharacterFocus(null);
              }}
              onEditAssets={() => setCharacterPanel('assets')}
            />
          )}
          {characterFocus && characterPanel === 'assets' && (
            <CharacterAssetEditor
              character={characterFocus}
              password={editorPassword()}
              onBack={() => setCharacterPanel('info')}
              onCloseAll={() => {
                setCharacterPanel(null);
                setCharacterFocus(null);
              }}
            />
          )}
        </>,
        document.body,
      )}
    </>
  );
}
