/**
 * Walk / block polygons for the outpost.
 * Data: outpostWalkMask.json — edit via /scene-editor → Сохранить.
 */
import raw from '@/data/outpostWalkMask.json';

export interface WalkPoint {
  x: number;
  y: number;
}

export interface WalkMaskFile {
  walk: WalkPoint[][];
  block: WalkPoint[][];
}

const data = raw as WalkMaskFile;

export const OUTPOST_WALK_POLYGONS: WalkPoint[][] = data.walk;
export const OUTPOST_BLOCK_POLYGONS: WalkPoint[][] = data.block;
