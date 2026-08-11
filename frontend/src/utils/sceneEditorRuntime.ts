/** Dev scene-editor UI flags (live while WalkEditorOverlay is mounted). */

let showPlayers = true;
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

export function resetEditorUiFlags(): void {
  showPlayers = true;
  emit();
}

export function subscribeEditorUi(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getEditorUiVersion(): number {
  return version;
}
