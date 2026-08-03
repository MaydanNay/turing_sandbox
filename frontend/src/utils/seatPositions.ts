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
  spots: [
    { x: 12, y: 40, scale: 0.95 },  // 01 vance
    { x: 40, y: 23, scale: 0.92 },  // 02 cole
    { x: 70, y: 38, scale: 0.9 },   // 03 martha
    { x: 67, y: 52, scale: 0.88 },  // 04 penny
    { x: 60, y: 68, scale: 0.93 },  // 05 gwen
    { x: 78, y: 62, scale: 0.9 },   // 06 logan
    { x: 18, y: 56, scale: 0.85 },  // 07 chester
    { x: 38, y: 65, scale: 0.88 },  // 08 roxy
  ] satisfies SeatLayout[],
} as const;

export function getOutpostSpot(seatNumber: number): SeatLayout {
  const index = seatNumber - 1;
  return OUTPOST_LAYOUT.spots[index] ?? OUTPOST_LAYOUT.spots[0] ?? { x: 50, y: 50, scale: 0.9 };
}

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
  return layout.behindTable ? 8 : 30;
}

export function tableZIndex(): number {
  return 20;
}

export function clampSuspicion(score: number): number {
  return Math.max(0, Math.min(100, score));
}
