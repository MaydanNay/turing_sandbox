/** Outpost background is 1920×1080 — all scene % coords are in this space. */
export const OUTPOST_SCENE_ASPECT = 16 / 9;

/**
 * Size of a centered cover frame that fills `parentW×parentH` the same way
 * CSS `object-fit: cover` would scale a rectangle of the given aspect.
 */
export function getCoverFrameSize(
  parentW: number,
  parentH: number,
  aspect: number = OUTPOST_SCENE_ASPECT,
): { width: number; height: number } {
  if (parentW <= 0 || parentH <= 0) {
    return { width: 0, height: 0 };
  }
  let width = parentW;
  let height = parentW / aspect;
  if (height < parentH) {
    height = parentH;
    width = parentH * aspect;
  }
  return { width, height };
}
