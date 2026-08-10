/** Координаты % внутри группы сцenes (стол + кольцо стульев) */
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

/** Центр всей группы на локации (светлый круг на полу) */
export const SCENE_GROUP = {
  x: 35,
  y: 51,
  widthPercent: 90,
} as const;

/** Базовая ширина спрайта стула, % от ширины SCENE_GROUP */
export const SEAT_BASE_WIDTH = 12;

export const PREVIEW_EMPTY_SEATS = false;
export const PREVIEW_OUTPOST_STANDING = false;
export const OUTPOST_BASE_WIDTH = 9;

export const OUTPOST_LAYOUT = {
  /** Spawn / stand points in full-scene % — must stay outside table+chairs. */
  spots: [
    { x: 10, y: 34, scale: 0.95 },  // 01 vance — left consoles
    { x: 28, y: 18, scale: 0.92 },  // 02 cole — top
    { x: 72, y: 20, scale: 0.9 },   // 03 martha — top-right
    { x: 88, y: 42, scale: 0.88 },  // 04 penny — right
    { x: 86, y: 68, scale: 0.93 },  // 05 gwen — bottom-right
    { x: 58, y: 78, scale: 0.9 },   // 06 logan — bottom
    { x: 12, y: 62, scale: 0.85 },  // 07 chester — bottom-left
    { x: 22, y: 78, scale: 0.88 },  // 08 roxy — bottom-left floor
  ] satisfies SeatLayout[],
} as const;

export function getOutpostSpot(seatNumber: number): SeatLayout {
  const index = seatNumber - 1;
  return OUTPOST_LAYOUT.spots[index] ?? OUTPOST_LAYOUT.spots[0] ?? { x: 50, y: 50, scale: 0.9 };
}

export function seatLayoutToScenePos(seat: { x: number; y: number; [key: string]: any }): { x: number; y: number } {
  const w = SCENE_GROUP.widthPercent;
  return {
    x: SCENE_GROUP.x + (seat.x / 100 - 0.5) * w,
    y: SCENE_GROUP.y + (seat.y / 100 - 0.5) * w,
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

/** 8 стульев у стола — правь здесь */
const SEATS = [
  { x: 68, y: 49, scale: 0.85, behindTable: true },   // 01 vance
  { x: 80, y: 52, scale: 0.88, behindTable: true },  // 02 cole
  { x: 86, y: 58, scale: 0.9, behindTable: true },   // 03 martha
  { x: 81, y: 69, scale: 0.93 },  // 04 penny
  { x: 68, y: 73, scale: 0.95 },  // 05 gwen
  { x: 52, y: 69, scale: 0.93 },  // 06 logan
  { x: 47, y: 58, scale: 0.9, behindTable: true },   // 07 chester
  { x: 54, y: 52, scale: 0.88, behindTable: true },  // 08 roxy
] satisfies SeatLayout[];

function ringCenter(seats: readonly SeatLayout[]): { x: number; y: number } {
  const n = seats.length;
  return {
    x: seats.reduce((sum, s) => sum + s.x, 0) / n,
    y: seats.reduce((sum, s) => sum + s.y, 0) / n,
  };
}

const seatRingCenter = ringCenter(SEATS);

export const SCENE_LAYOUT = {
  seats: SEATS,
  /**
   * Стол: центр кольца seats + твой прежний размер widthPercent: 36.
   * offsetX / offsetY — если PNG чуть смещён.
   */
  table: {
    x: seatRingCenter.x,
    y: seatRingCenter.y,
    widthPercent: 38,
    offsetX: 0,
    offsetY: -2,
  } satisfies TableLayout,
} as const;

export function getSeatLayout(seatNumber: number): SeatLayout {
  const index = seatNumber - 1;
  return SCENE_LAYOUT.seats[index] ?? SCENE_LAYOUT.seats[0] ?? { x: 50, y: 50, scale: 0.9 };
}

export function seatZIndex(layout: SeatLayout): number {
  const pos = seatLayoutToScenePos(layout);
  // tieBreak ensures chairs sort correctly among characters at exactly same Y
  return depthZ(pos.y, layout.behindTable ? -150 : 150);
}

export function tableZIndex(): number {
  const pos = seatLayoutToScenePos({ x: SCENE_LAYOUT.table.x, y: SCENE_LAYOUT.table.y });
  return depthZ(pos.y, 0);
}

export function clampSuspicion(score: number): number {
  return Math.max(0, Math.min(100, score));
}
