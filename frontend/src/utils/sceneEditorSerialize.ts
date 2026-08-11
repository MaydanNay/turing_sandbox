import type { FurnitureLayout } from '@/data/outpostFurniture';
import type { SceneObjectPlacement } from '@/data/outpostSceneObjects';
import type { WalkPoint } from '@/data/outpostWalkMask';

export interface WalkMaskFile {
  walk: WalkPoint[][];
  block: WalkPoint[][];
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPoint(p: unknown): p is WalkPoint {
  return (
    typeof p === 'object' &&
    p !== null &&
    isNum((p as WalkPoint).x) &&
    isNum((p as WalkPoint).y)
  );
}

function isPoly(poly: unknown): poly is WalkPoint[] {
  return Array.isArray(poly) && poly.every(isPoint);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function roundPt(p: WalkPoint): WalkPoint {
  return { x: round1(p.x), y: round1(p.y) };
}

export function serializeWalkMask(
  walk: WalkPoint[][],
  block: WalkPoint[][],
): WalkMaskFile {
  return {
    walk: walk.map((poly) => poly.map(roundPt)),
    block: block.map((poly) => poly.map(roundPt)),
  };
}

export function serializeFurniture(layout: FurnitureLayout): FurnitureLayout {
  return {
    group: {
      x: round1(layout.group.x),
      y: round1(layout.group.y),
      widthPercent: round1(layout.group.widthPercent),
    },
    seats: layout.seats.map((s) => {
      const row: FurnitureLayout['seats'][number] = {
        x: round1(s.x),
        y: round1(s.y),
        scale: round1(s.scale),
      };
      if (s.behindTable) row.behindTable = true;
      return row;
    }),
    table: {
      x: round1(layout.table.x),
      y: round1(layout.table.y),
      widthPercent: round1(layout.table.widthPercent),
      offsetX: round1(layout.table.offsetX ?? 0),
      offsetY: round1(layout.table.offsetY ?? 0),
    },
  };
}

export function serializeSceneObjects(
  objects: SceneObjectPlacement[],
): SceneObjectPlacement[] {
  return objects.map((o) => ({
    ...o,
    x: round1(o.x),
    y: round1(o.y),
    w: round1(o.w),
    h: round1(o.h),
  }));
}

export function toPrettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function validateWalkMaskData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'walk: root must be object';
  const d = data as WalkMaskFile;
  if (!Array.isArray(d.walk) || !Array.isArray(d.block)) {
    return 'walk: need walk[] and block[]';
  }
  if (d.walk.length < 1) return 'walk: need ≥1 yellow polygon';
  if (!d.walk.every(isPoly) || !d.block.every(isPoly)) {
    return 'walk: invalid point arrays';
  }
  if (d.walk.some((p) => p.length < 3)) return 'walk: each poly needs ≥3 points';
  return null;
}

export function validateFurnitureData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'furniture: root must be object';
  const d = data as FurnitureLayout;
  if (!d.group || !isNum(d.group.x) || !isNum(d.group.y) || !isNum(d.group.widthPercent)) {
    return 'furniture: invalid group';
  }
  if (!d.table || !isNum(d.table.x) || !isNum(d.table.y) || !isNum(d.table.widthPercent)) {
    return 'furniture: invalid table';
  }
  if (!Array.isArray(d.seats) || d.seats.length !== 8) {
    return 'furniture: need exactly 8 seats';
  }
  for (const s of d.seats) {
    if (!isNum(s.x) || !isNum(s.y) || !isNum(s.scale)) {
      return 'furniture: invalid seat';
    }
  }
  return null;
}

export function validateSceneObjectsData(data: unknown): string | null {
  if (!Array.isArray(data)) return 'objects: root must be array';
  for (const o of data) {
    if (typeof o !== 'object' || o === null) return 'objects: invalid item';
    const item = o as SceneObjectPlacement;
    if (typeof item.id !== 'string' || typeof item.type !== 'string') {
      return 'objects: id/type required';
    }
    if (!isNum(item.x) || !isNum(item.y) || !isNum(item.w) || !isNum(item.h)) {
      return 'objects: x/y/w/h must be numbers';
    }
  }
  return null;
}
