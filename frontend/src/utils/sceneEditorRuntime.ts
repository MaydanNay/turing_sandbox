/** Dev scene-editor UI flags (live while WalkEditorOverlay is mounted). */

export type SceneEditorMode = 'props' | 'polygons' | 'characters';

let showPlayers = true;
let editorMode: SceneEditorMode = 'props';
let version = 0;
const listeners = new Set<() => void>();

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function setEditorShowPlayers(show: boolean): void {
  if (showPlayers === show) return;
  showPlayers = show;
  emit();
}

export function getEditorShowPlayers(): boolean {
  return showPlayers;
}

export function setEditorMode(mode: SceneEditorMode): void {
  if (editorMode === mode) return;
  editorMode = mode;
  emit();
}

export function getEditorMode(): SceneEditorMode {
  return editorMode;
}

export function resetEditorUiFlags(): void {
  showPlayers = true;
  editorMode = 'props';
  emit();
}

export function subscribeEditorUi(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getEditorUiVersion(): number {
  return version;
}
