import type { FurnitureLayout } from '@/data/outpostFurniture';
import { serializeFurniture, toPrettyJson } from '@/utils/sceneEditorSerialize';
import { SEAT_BASE_WIDTH } from '@/utils/seatPositions';
import {
  scenePosToSeatLocal,
  seatLayoutToScenePos,
} from '@/utils/seatPositions';

export type FurnitureSelection =
  | { kind: 'group' }
  | { kind: 'table' }
  | { kind: 'seat'; index: number };

export function formatFurnitureExport(layout: FurnitureLayout): string {
  return toPrettyJson(serializeFurniture(layout));
}

export function seatHitRadiusScene(
  scale: number,
  groupW: number,
): number {
  return Math.max(2.5, (SEAT_BASE_WIDTH * scale * groupW) / 200);
}

export function tableHalfSizeScene(
  widthPercent: number,
  groupW: number,
): number {
  return (widthPercent / 2 / 100) * groupW;
}

export function hitFurniture(
  p: { x: number; y: number },
  layout: FurnitureLayout,
): FurnitureSelection | null {
  const { group, seats, table } = layout;

  for (let i = seats.length - 1; i >= 0; i--) {
    const seat = seats[i]!;
    const c = seatLayoutToScenePos(seat, group);
    const r = seatHitRadiusScene(seat.scale, group.widthPercent);
    if (Math.hypot(p.x - c.x, p.y - c.y) <= r) {
      return { kind: 'seat', index: i };
    }
  }

  const tLocal = {
    x: table.x + (table.offsetX ?? 0),
    y: table.y + (table.offsetY ?? 0),
  };
  const tc = seatLayoutToScenePos(tLocal, group);
  const th = tableHalfSizeScene(table.widthPercent, group.widthPercent);
  if (Math.hypot(p.x - tc.x, p.y - tc.y) <= th * 0.85) {
    return { kind: 'table' };
  }

  const half = group.widthPercent / 2;
  if (
    p.x >= group.x - half &&
    p.x <= group.x + half &&
    p.y >= group.y - half &&
    p.y <= group.y + half
  ) {
    return { kind: 'group' };
  }

  return null;
}

export function furnitureSelectionSceneBox(
  sel: FurnitureSelection,
  layout: FurnitureLayout,
): { x: number; y: number; w: number; h: number } {
  const { group, seats, table } = layout;
  if (sel.kind === 'group') {
    const half = group.widthPercent / 2;
    return {
      x: group.x - half,
      y: group.y - half,
      w: group.widthPercent,
      h: group.widthPercent,
    };
  }
  if (sel.kind === 'table') {
    const tLocal = {
      x: table.x + (table.offsetX ?? 0),
      y: table.y + (table.offsetY ?? 0),
    };
    const c = seatLayoutToScenePos(tLocal, group);
    const half = tableHalfSizeScene(table.widthPercent, group.widthPercent);
    return { x: c.x - half, y: c.y - half, w: half * 2, h: half * 2 };
  }
  const seat = seats[sel.index]!;
  const c = seatLayoutToScenePos(seat, group);
  const r = seatHitRadiusScene(seat.scale, group.widthPercent);
  return { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 };
}

export function applyFurnitureDrag(
  _layout: FurnitureLayout,
  sel: FurnitureSelection,
  startScene: { x: number; y: number },
  nowScene: { x: number; y: number },
  orig: FurnitureLayout,
): FurnitureLayout {
  const dx = nowScene.x - startScene.x;
  const dy = nowScene.y - startScene.y;
  const next = {
    group: { ...orig.group },
    seats: orig.seats.map((s) => ({ ...s })),
    table: { ...orig.table },
  };

  if (sel.kind === 'group') {
    next.group.x = orig.group.x + dx;
    next.group.y = orig.group.y + dy;
    return next;
  }

  if (sel.kind === 'table') {
    const local0 = scenePosToSeatLocal(startScene, orig.group);
    const local1 = scenePosToSeatLocal(nowScene, orig.group);
    next.table.x = orig.table.x + (local1.x - local0.x);
    next.table.y = orig.table.y + (local1.y - local0.y);
    return next;
  }

  const seat0 = orig.seats[sel.index]!;
  const local0 = scenePosToSeatLocal(startScene, orig.group);
  const local1 = scenePosToSeatLocal(nowScene, orig.group);
  next.seats[sel.index] = {
    ...seat0,
    x: seat0.x + (local1.x - local0.x),
    y: seat0.y + (local1.y - local0.y),
  };
  return next;
}

/** SE corner drag → scale table width or seat scale / group size */
export function applyFurnitureResize(
  _layout: FurnitureLayout,
  sel: FurnitureSelection,
  nowScene: { x: number; y: number },
  orig: FurnitureLayout,
): FurnitureLayout {
  const next = {
    group: { ...orig.group },
    seats: orig.seats.map((s) => ({ ...s })),
    table: { ...orig.table },
  };

  if (sel.kind === 'group') {
    const halfX = Math.abs(nowScene.x - orig.group.x);
    const halfY = Math.abs(nowScene.y - orig.group.y);
    next.group.widthPercent = Math.max(40, Math.min(120, Math.max(halfX, halfY) * 2));
    return next;
  }

  if (sel.kind === 'table') {
    const tLocal = {
      x: orig.table.x + (orig.table.offsetX ?? 0),
      y: orig.table.y + (orig.table.offsetY ?? 0),
    };
    const c = seatLayoutToScenePos(tLocal, orig.group);
    const dist = Math.hypot(nowScene.x - c.x, nowScene.y - c.y);
    const widthPercent = Math.max(
      16,
      Math.min(70, ((dist * 2) / orig.group.widthPercent) * 100),
    );
    next.table.widthPercent = widthPercent;
    return next;
  }

  const seat = orig.seats[sel.index]!;
  const c = seatLayoutToScenePos(seat, orig.group);
  const dist = Math.hypot(nowScene.x - c.x, nowScene.y - c.y);
  const scale =
    (dist * 200) / (SEAT_BASE_WIDTH * orig.group.widthPercent);
  next.seats[sel.index] = {
    ...seat,
    scale: Math.max(0.5, Math.min(1.4, scale)),
  };
  return next;
}
