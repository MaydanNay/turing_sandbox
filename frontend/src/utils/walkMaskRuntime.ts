import {
  OUTPOST_BLOCK_POLYGONS,
  OUTPOST_WALK_POLYGONS,
  type WalkPoint,
} from '@/data/outpostWalkMask';

/** Live override while scene editor is open — playtest polys before Copy JSON. */
let liveWalk: WalkPoint[][] | null = null;
let liveBlock: WalkPoint[][] | null = null;

export function setLiveWalkMask(
  walk: WalkPoint[][],
  block: WalkPoint[][],
): void {
  liveWalk = walk.map((poly) => poly.map((p) => ({ ...p })));
  liveBlock = block.map((poly) => poly.map((p) => ({ ...p })));
}

export function clearLiveWalkMask(): void {
  liveWalk = null;
  liveBlock = null;
}

export function getActiveWalkPolygons(): WalkPoint[][] {
  return liveWalk ?? OUTPOST_WALK_POLYGONS;
}

export function getActiveBlockPolygons(): WalkPoint[][] {
  return liveBlock ?? OUTPOST_BLOCK_POLYGONS;
}
