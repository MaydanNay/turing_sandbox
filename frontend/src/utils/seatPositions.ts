import {
  OUTPOST_FURNITURE_GROUP,
  OUTPOST_FURNITURE_SEATS,
  OUTPOST_FURNITURE_TABLE,
  type FurnitureSeatLayout,
  type FurnitureTableLayout,
} from '@/data/outpostFurniture';
import { getActiveFurniture } from '@/utils/furnitureRuntime';
import { OUTPOST_SCENE_ASPECT } from '@/utils/sceneCover';
import { getActiveStandingSpots } from '@/utils/standingSpotsRuntime';

/** Координаты % внутри группы сцены (стол + кольцо стульев) */
export interface SeatLayout {
  x: number;
  y: number;
  scale: number;
  /** true — стул за столом (задний слой) */
  behindTable?: boolean;
}

export interface TableLayout {
  x: number;
  y: number;
  widthPercent: number;
  offsetX?: number;
  offsetY?: number;
}

/** File defaults (seed). Prefer getSceneGroup() / getSceneLayout() for live editor. */
export const SCENE_GROUP = OUTPOST_FURNITURE_GROUP;

/** Базовая ширина спрайта стула, % от ширины SCENE_GROUP */
export const SEAT_BASE_WIDTH = 12;
/** Anchor Y for seat sprites — keep in sync with SeatSprite transform */
export const SEAT_ANCHOR_Y = 0.88;
/** empty/occupied seat PNG 174×214 */
export const SEAT_SPRITE_ASPECT = 214 / 174;
/** table.png 608×349 */
export const TABLE_SPRITE_ASPECT = 349 / 608;

export const PREVIEW_EMPTY_SEATS = false;
export const PREVIEW_OUTPOST_STANDING = false;
export const OUTPOST_BASE_WIDTH = 9;

/** @deprecated Prefer getActiveStandingSpots() / getOutpostSpot() */
export const OUTPOST_LAYOUT = {
  get spots() {
    return getActiveStandingSpots();
  },
} as const;

export function getOutpostSpot(seatNumber: number): SeatLayout {
  const spots = getActiveStandingSpots();
  const index = seatNumber - 1;
  return spots[index] ?? spots[0] ?? { x: 50, y: 50, scale: 0.9 };
}

export function getSceneGroup(): {
  x: number;
  y: number;
  widthPercent: number;
} {
  return getActiveFurniture().group;
}

export function getSceneLayout(): {
  seats: readonly SeatLayout[];
  table: TableLayout;
} {
  const { seats, table } = getActiveFurniture();
  return { seats, table };
}

/** @deprecated Prefer getSceneLayout() — static file snapshot only */
export const SCENE_LAYOUT = {
  seats: OUTPOST_FURNITURE_SEATS as SeatLayout[],
  table: OUTPOST_FURNITURE_TABLE as TableLayout,
} as const;

/**
 * Group is a CSS square (width = widthPercent of scene width).
 * Scene Y% must scale by aspect so 1% group-Y maps to the same pixels as 1% group-X.
 */
export function seatLayoutToScenePos(
  seat: { x: number; y: number },
  group: { x: number; y: number; widthPercent: number } = getSceneGroup(),
): { x: number; y: number } {
  const w = group.widthPercent;
  return {
    x: group.x + (seat.x / 100 - 0.5) * w,
    y: group.y + (seat.y / 100 - 0.5) * w * OUTPOST_SCENE_ASPECT,
  };
}

export function scenePosToSeatLocal(
  scene: { x: number; y: number },
  group: { x: number; y: number; widthPercent: number } = getSceneGroup(),
): { x: number; y: number } {
  const w = group.widthPercent;
  return {
    x: ((scene.x - group.x) / w + 0.5) * 100,
    y: ((scene.y - group.y) / (w * OUTPOST_SCENE_ASPECT) + 0.5) * 100,
  };
}

export function depthZ(sceneY: number, tieBreak = 0): number {
  return Math.round(sceneY * 10) * 100 + tieBreak;
}

/** Soft wander box for AI / clicks (% of scene). Keep >= walkable polygon bbox. */
export const OUTPOST_WANDER_BOUNDS = {
  minX: 0,
  maxX: 95,
  minY: 22,
  maxY: 108,
} as const;

export function getSeatLayout(seatNumber: number): SeatLayout {
  const seats = getSceneLayout().seats;
  const index = seatNumber - 1;
  return seats[index] ?? seats[0] ?? { x: 50, y: 50, scale: 0.9 };
}

export function seatZIndex(layout: SeatLayout): number {
  const pos = seatLayoutToScenePos(layout);
  return depthZ(pos.y, layout.behindTable ? -150 : 150);
}

export function tableZIndex(): number {
  const { table } = getSceneLayout();
  const pos = seatLayoutToScenePos({ x: table.x, y: table.y });
  return depthZ(pos.y, 0);
}

export function clampSuspicion(score: number): number {
  return Math.max(0, Math.min(100, score));
}

export type { FurnitureSeatLayout, FurnitureTableLayout };
