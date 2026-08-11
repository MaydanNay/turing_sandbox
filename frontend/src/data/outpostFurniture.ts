/**
 * Table + chairs layout (group-local % for seats/table).
 * Data: outpostFurniture.json — edit via /scene-editor → Сохранить.
 */
import raw from '@/data/outpostFurniture.json';

export interface FurnitureSeatLayout {
  x: number;
  y: number;
  scale: number;
  behindTable?: boolean;
}

export interface FurnitureTableLayout {
  x: number;
  y: number;
  widthPercent: number;
  offsetX?: number;
  offsetY?: number;
}

export interface FurnitureGroupLayout {
  x: number;
  y: number;
  widthPercent: number;
}

export interface FurnitureLayout {
  group: FurnitureGroupLayout;
  seats: FurnitureSeatLayout[];
  table: FurnitureTableLayout;
}

export const OUTPOST_FURNITURE: FurnitureLayout = raw as FurnitureLayout;

export const OUTPOST_FURNITURE_GROUP = OUTPOST_FURNITURE.group;
export const OUTPOST_FURNITURE_SEATS = OUTPOST_FURNITURE.seats;
export const OUTPOST_FURNITURE_TABLE = OUTPOST_FURNITURE.table;

export function cloneFurnitureLayout(
  src: FurnitureLayout = OUTPOST_FURNITURE,
): FurnitureLayout {
  return {
    group: { ...src.group },
    seats: src.seats.map((s) => ({ ...s })),
    table: { ...src.table },
  };
}
