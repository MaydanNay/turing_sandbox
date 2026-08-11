import type { SceneObjectPlacement } from '@/data/outpostSceneObjects';
import { OUTPOST_SCENE_OBJECTS } from '@/data/outpostSceneObjects';

let liveObjects: SceneObjectPlacement[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function setLiveSceneObjects(objects: SceneObjectPlacement[]): void {
  liveObjects = objects.map((o) => ({ ...o }));
  emit();
}

export function clearLiveSceneObjects(): void {
  liveObjects = null;
  emit();
}

export function getSceneObjects(): SceneObjectPlacement[] {
  return liveObjects ?? OUTPOST_SCENE_OBJECTS;
}

export function subscribeSceneObjects(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSceneObjectsVersion(): number {
  return version;
}
