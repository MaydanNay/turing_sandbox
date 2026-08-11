import {
  cloneFurnitureLayout,
  OUTPOST_FURNITURE,
  type FurnitureLayout,
} from '@/data/outpostFurniture';

let live: FurnitureLayout | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function setLiveFurniture(layout: FurnitureLayout): void {
  live = cloneFurnitureLayout(layout);
  emit();
}

export function clearLiveFurniture(): void {
  live = null;
  emit();
}

export function getActiveFurniture(): FurnitureLayout {
  return live ?? OUTPOST_FURNITURE;
}

export function subscribeFurniture(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getFurnitureVersion(): number {
  return version;
}
