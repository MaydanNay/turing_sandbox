import {
  cloneStandingSpots,
  OUTPOST_STANDING_SPOTS,
  type StandingSpot,
} from '@/data/outpostStandingSpots';

let live: StandingSpot[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function setLiveStandingSpots(spots: StandingSpot[]): void {
  live = cloneStandingSpots(spots);
  emit();
}

export function clearLiveStandingSpots(): void {
  live = null;
  emit();
}

export function getActiveStandingSpots(): StandingSpot[] {
  return live ?? OUTPOST_STANDING_SPOTS;
}

export function subscribeStandingSpots(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getStandingSpotsVersion(): number {
  return version;
}
