/**
 * Standing spawn spots (full-scene %) — size via scale.
 * Data: outpostStandingSpots.json — edit via /scene-editor → Персонажи.
 */
import raw from '@/data/outpostStandingSpots.json';

export interface StandingSpot {
  x: number;
  y: number;
  scale: number;
  behindTable?: boolean;
}

export const OUTPOST_STANDING_SPOTS: StandingSpot[] = raw as StandingSpot[];

export function cloneStandingSpots(
  spots: readonly StandingSpot[] = OUTPOST_STANDING_SPOTS,
): StandingSpot[] {
  return spots.map((s) => ({
    x: s.x,
    y: s.y,
    scale: s.scale,
    ...(s.behindTable ? { behindTable: true as const } : {}),
  }));
}

export function clampStandingScale(scale: number): number {
  return Math.min(1.4, Math.max(0.5, Math.round(scale * 100) / 100));
}
