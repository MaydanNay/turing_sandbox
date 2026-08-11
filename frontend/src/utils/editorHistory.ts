import { cloneFurnitureLayout, type FurnitureLayout } from '@/data/outpostFurniture';
import {
  cloneStandingSpots,
  type StandingSpot,
} from '@/data/outpostStandingSpots';
import type { SceneObjectPlacement } from '@/data/outpostSceneObjects';
import type { WalkPoint } from '@/data/outpostWalkMask';

export interface EditorHistorySnapshot {
  walkClosed: WalkPoint[][];
  blockClosed: WalkPoint[][];
  draft: WalkPoint[];
  objects: SceneObjectPlacement[];
  furniture: FurnitureLayout;
  standingSpots: StandingSpot[];
}

const MAX_HISTORY = 80;

function clonePolys(polys: WalkPoint[][]): WalkPoint[][] {
  return polys.map((poly) => poly.map((p) => ({ ...p })));
}

export function cloneEditorSnapshot(
  snap: EditorHistorySnapshot,
): EditorHistorySnapshot {
  return {
    walkClosed: clonePolys(snap.walkClosed),
    blockClosed: clonePolys(snap.blockClosed),
    draft: snap.draft.map((p) => ({ ...p })),
    objects: snap.objects.map((o) => ({ ...o })),
    furniture: cloneFurnitureLayout(snap.furniture),
    standingSpots: cloneStandingSpots(snap.standingSpots),
  };
}

export function createEditorHistory() {
  const past: EditorHistorySnapshot[] = [];
  const future: EditorHistorySnapshot[] = [];

  return {
    push(current: EditorHistorySnapshot) {
      past.push(cloneEditorSnapshot(current));
      if (past.length > MAX_HISTORY) past.shift();
      future.length = 0;
    },
    undo(current: EditorHistorySnapshot): EditorHistorySnapshot | null {
      if (past.length === 0) return null;
      future.push(cloneEditorSnapshot(current));
      return past.pop() ?? null;
    },
    redo(current: EditorHistorySnapshot): EditorHistorySnapshot | null {
      if (future.length === 0) return null;
      past.push(cloneEditorSnapshot(current));
      return future.pop() ?? null;
    },
    clear() {
      past.length = 0;
      future.length = 0;
    },
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
  };
}

export type EditorHistory = ReturnType<typeof createEditorHistory>;
