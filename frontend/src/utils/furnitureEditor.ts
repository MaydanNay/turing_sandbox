import type { FurnitureLayout } from '@/data/outpostFurniture';
import { OUTPOST_SCENE_ASPECT } from '@/utils/sceneCover';
import { serializeFurniture, toPrettyJson } from '@/utils/sceneEditorSerialize';
import {
  SEAT_ANCHOR_Y,
  SEAT_BASE_WIDTH,
  SEAT_SPRITE_ASPECT,
  TABLE_SPRITE_ASPECT,
  scenePosToSeatLocal,
  seatLayoutToScenePos,
} from '@/utils/seatPositions';

/** width% → height% on 16:9 scene cover */
function spriteHeightScene(widthScene: number, pngHw: number): number {
  return widthScene * pngHw * OUTPOST_SCENE_ASPECT;
}

export type FurnitureSelection =
  | { kind: 'group' }
  | { kind: 'table' }
  | { kind: 'seat'; index: number };

export function formatFurnitureExport(layout: FurnitureLayout): string {
  return toPrettyJson(serializeFurniture(layout));
}

function seatSpriteSizeScene(
  scale: number,
  groupW: number,
): { w: number; h: number } {
  const w = (SEAT_BASE_WIDTH * scale * groupW) / 100;
  return { w, h: spriteHeightScene(w, SEAT_SPRITE_ASPECT) };
}

function tableSpriteSizeScene(
  widthPercent: number,
  groupW: number,
): { w: number; h: number } {
  const w = (widthPercent / 100) * groupW;
  return { w, h: spriteHeightScene(w, TABLE_SPRITE_ASPECT) };
}

export function seatHitRadiusScene(
  scale: number,
  groupW: number,
): number {
  const { w, h } = seatSpriteSizeScene(scale, groupW);
  return Math.max(2.5, Math.hypot(w / 2, h * SEAT_ANCHOR_Y) * 0.55);
}

export function tableHalfSizeScene(
  widthPercent: number,
  groupW: number,
): number {
  return tableSpriteSizeScene(widthPercent, groupW).w / 2;
}

function pointInBox(
  p: { x: number; y: number },
  box: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    p.x >= box.x &&
    p.x <= box.x + box.w &&
    p.y >= box.y &&
    p.y <= box.y + box.h
  );
}

export function hitFurniture(
  p: { x: number; y: number },
  layout: FurnitureLayout,
): FurnitureSelection | null {
  const { group, seats } = layout;

  for (let i = seats.length - 1; i >= 0; i--) {
    const box = furnitureSelectionSceneBox({ kind: 'seat', index: i }, layout);
    if (pointInBox(p, box)) {
      return { kind: 'seat', index: i };
    }
  }

  const tableBox = furnitureSelectionSceneBox({ kind: 'table' }, layout);
  if (pointInBox(p, tableBox)) {
    return { kind: 'table' };
  }

  const half = group.widthPercent / 2;
  const halfY = half * OUTPOST_SCENE_ASPECT;
  if (
    p.x >= group.x - half &&
    p.x <= group.x + half &&
    p.y >= group.y - halfY &&
    p.y <= group.y + halfY
  ) {
    return { kind: 'group' };
  }

  return null;
}

/**
 * Scene-% AABB matching how table/chairs are actually drawn
 * (width + sprite aspect + anchor).
 */
export function furnitureSelectionSceneBox(
  sel: FurnitureSelection,
  layout: FurnitureLayout,
): { x: number; y: number; w: number; h: number } {
  const { group, seats, table } = layout;
  if (sel.kind === 'group') {
    const half = group.widthPercent / 2;
    const halfY = half * OUTPOST_SCENE_ASPECT;
    return {
      x: group.x - half,
      y: group.y - halfY,
      w: group.widthPercent,
      h: group.widthPercent * OUTPOST_SCENE_ASPECT,
    };
  }
  if (sel.kind === 'table') {
    const tLocal = {
      x: table.x + (table.offsetX ?? 0),
      y: table.y + (table.offsetY ?? 0),
    };
    const c = seatLayoutToScenePos(tLocal, group);
    const { w, h } = tableSpriteSizeScene(
      table.widthPercent,
      group.widthPercent,
    );
    // Table uses transform: translate(-50%, -50%)
    return { x: c.x - w / 2, y: c.y - h / 2, w, h };
  }
  const seat = seats[sel.index]!;
  const c = seatLayoutToScenePos(seat, group);
  const { w, h } = seatSpriteSizeScene(seat.scale, group.widthPercent);
  // Seat uses translateX(-50%) translateY(-88%)
  return {
    x: c.x - w / 2,
    y: c.y - SEAT_ANCHOR_Y * h,
    w,
    h,
  };
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
    const halfY = Math.abs(nowScene.y - orig.group.y) / OUTPOST_SCENE_ASPECT;
    next.group.widthPercent = Math.max(
      40,
      Math.min(120, Math.max(halfX, halfY) * 2),
    );
    return next;
  }

  if (sel.kind === 'table') {
    const tLocal = {
      x: orig.table.x + (orig.table.offsetX ?? 0),
      y: orig.table.y + (orig.table.offsetY ?? 0),
    };
    const c = seatLayoutToScenePos(tLocal, orig.group);
    // SE handle → map to half-width (height% already includes scene aspect)
    const dx = Math.abs(nowScene.x - c.x);
    const dy = Math.abs(nowScene.y - c.y);
    const hPerW = TABLE_SPRITE_ASPECT * OUTPOST_SCENE_ASPECT;
    const halfW = Math.max(dx, dy / Math.max(0.05, hPerW));
    const widthPercent = Math.max(
      16,
      Math.min(70, ((halfW * 2) / orig.group.widthPercent) * 100),
    );
    next.table.widthPercent = widthPercent;
    return next;
  }

  const seat = orig.seats[sel.index]!;
  const c = seatLayoutToScenePos(seat, orig.group);
  // Anchor at (50%, 88%): SE is (+w/2, +(1-0.88)h) from anchor
  const dx = Math.max(0.01, nowScene.x - c.x);
  const dy = Math.max(0.01, nowScene.y - c.y);
  const hPerW = SEAT_SPRITE_ASPECT * OUTPOST_SCENE_ASPECT;
  const wFromX = dx * 2;
  const wFromY = dy / Math.max(0.05, (1 - SEAT_ANCHOR_Y) * hPerW);
  const w = Math.max(wFromX, wFromY);
  const scale = (w * 100) / (SEAT_BASE_WIDTH * orig.group.widthPercent);
  next.seats[sel.index] = {
    ...seat,
    scale: Math.max(0.5, Math.min(1.4, scale)),
  };
  return next;
}
