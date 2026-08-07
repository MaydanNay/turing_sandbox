import type { PlayerHandCard } from '@/types/card';
import type { ChatMessage, GamePhase, MyProfile, Player } from '@/types/game';
import type { PrivateChatMessage } from '@/store/privateChatStore';

export type PersistMode = 'mock' | 'live';

export interface ActiveSessionPointer {
  mode: PersistMode;
  roomId: string;
  clientId: string;
  updatedAt: number;
}

export interface UiSnapshot {
  roomId: string;
  mode: PersistMode;
  clientId: string;
  gameState: GamePhase;
  gatheredAtTable: boolean;
  /** Personal sits outside a full meeting (optional for older snapshots). */
  seatedPlayerIds?: string[];
  meetingCallsUsed?: number;
  lastMeetingCallAt?: number | null;
  brigCharacterIds: string[];
  votes: Record<string, string>;
  sessionAges: Record<string, number>;
  players: Player[];
  chat: ChatMessage[];
  myProfile: MyProfile | null;
  myHand?: PlayerHandCard[];
  revealedByPlayer?: Record<string, PlayerHandCard[]>;
  privateThreads: Record<string, PrivateChatMessage[]>;
  privateUnread: Record<string, number>;
  privateSeeded: Record<string, boolean>;
  /** Standing outpost positions in scene % (optional for older snapshots). */
  outpostPositions?: Record<string, { x: number; y: number; scale: number }>;
  updatedAt: number;
}

const ACTIVE_KEY = 'turing_active_session';
const snapshotKey = (roomId: string) => `turing_ui_snapshot:${roomId}`;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function loadActiveSession(): ActiveSessionPointer | null {
  return safeParse<ActiveSessionPointer>(localStorage.getItem(ACTIVE_KEY));
}

export function saveActiveSession(pointer: ActiveSessionPointer): void {
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(pointer));
}

export function clearActiveSession(): void {
  const active = loadActiveSession();
  localStorage.removeItem(ACTIVE_KEY);
  if (active?.roomId) {
    localStorage.removeItem(snapshotKey(active.roomId));
  }
}

export function clearSnapshot(roomId: string): void {
  localStorage.removeItem(snapshotKey(roomId));
}

export function loadUiSnapshot(roomId: string): UiSnapshot | null {
  return safeParse<UiSnapshot>(localStorage.getItem(snapshotKey(roomId)));
}

export function saveUiSnapshot(snapshot: UiSnapshot): void {
  localStorage.setItem(snapshotKey(snapshot.roomId), JSON.stringify(snapshot));
  saveActiveSession({
    mode: snapshot.mode,
    roomId: snapshot.roomId,
    clientId: snapshot.clientId,
    updatedAt: snapshot.updatedAt,
  });
}

export function clearAllSessionPersistence(roomId?: string | null): void {
  if (roomId) clearSnapshot(roomId);
  clearActiveSession();
}

let saveTimer: number | null = null;
let pendingBuild: (() => UiSnapshot | null) | null = null;

function writeSnapshotNow(build: () => UiSnapshot | null): void {
  const snapshot = build();
  if (snapshot) saveUiSnapshot(snapshot);
}

/** Debounced snapshot write — call from App when game is active. */
export function scheduleUiSnapshotSave(
  build: () => UiSnapshot | null,
  delayMs = 400,
): void {
  if (typeof window === 'undefined') return;
  pendingBuild = build;
  if (saveTimer != null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    const fn = pendingBuild;
    pendingBuild = null;
    if (fn) writeSnapshotNow(fn);
  }, delayMs);
}

/** Flush pending debounce immediately (page hide / leave). */
export function flushUiSnapshotSave(build?: () => UiSnapshot | null): void {
  if (typeof window === 'undefined') return;
  if (saveTimer != null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  const fn = build ?? pendingBuild;
  pendingBuild = null;
  if (fn) writeSnapshotNow(fn);
}
