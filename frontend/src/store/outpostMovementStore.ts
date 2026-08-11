import { create } from 'zustand';

import {
  clampToWanderBounds,
  ensureOutsideFurniture,
  findOutpostPath,
  getOutpostObstacles,
  lastWalkableAlongRay,
  pointInWalkable,
  pushOutOfObstacles,
  standUpSpawnForSeat,
  type CircleObstacle,
} from '@/utils/outpostCollision';
import { getOutpostSpot } from '@/utils/seatPositions';

export interface OutpostPos {
  x: number;
  y: number;
  scale: number;
}

/** In-flight lerp for one player — used to sample real feet mid-move. */
export interface MoveAnim {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAt: number;
  durationMs: number;
}

const MOVE_SPEED_PCT_PER_S = 20;
const MOVE_DURATION_MIN_S = 0.35;
const MOVE_DURATION_MAX_S = 2.4;
const NEAR_EPS = 0.08;
/** How far ahead (%) WASD aims each refresh — ~0.2s at walk speed */
const STEER_LOOKAHEAD_PCT = MOVE_SPEED_PCT_PER_S * 0.2;

export function moveDurationSeconds(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  opts?: { preciseTiming?: boolean },
): number {
  const d = Math.hypot(toX - fromX, toY - fromY);
  const raw = d / MOVE_SPEED_PCT_PER_S;
  if (opts?.preciseTiming) {
    return Math.min(MOVE_DURATION_MAX_S, Math.max(0.05, raw));
  }
  return Math.min(
    MOVE_DURATION_MAX_S,
    Math.max(MOVE_DURATION_MIN_S, raw),
  );
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

interface OutpostMovementState {
  /** Animation target (current waypoint) in % of full scene */
  positions: Record<string, OutpostPos>;
  /** Remaining waypoints after current `positions` target */
  remainingPath: Record<string, { x: number; y: number }[]>;
  /** True while sprite is lerping toward current waypoint */
  inMotion: Record<string, boolean>;
  /** Active lerp — pathfinding samples feet from this on re-click */
  moveAnim: Record<string, MoveAnim>;
  /** After walking to own chair, call gather */
  pendingSitPlayerId: string | null;
  /** Visual feet right now (mid-lerp aware) */
  getFeet: (playerId: string) => { x: number; y: number } | null;
  initFromPlayers: (
    players: { id: string; characterId: string; tablePosition: number }[],
  ) => void;
  /** Force everyone to safe stand-up spots (match start / leave table). */
  respawnOutsideFurniture: (
    players: { id: string; tablePosition: number }[],
  ) => void;
  /** Push all current positions into walkable + outside furniture. */
  sanitizeAllPositions: () => void;
  hydratePositions: (positions: Record<string, OutpostPos>) => void;
  isMoving: (playerId: string) => boolean;
  setTarget: (
    playerId: string,
    x: number,
    y: number,
    opts?: {
      passThroughSeat?: number;
      preciseTiming?: boolean;
      /** WASD: clamp along ray, no pathfinding detours */
      directAlongRay?: boolean;
    },
  ) => void;
  /**
   * Continuous WASD steer: aim a short walkable point in `dir` from current feet.
   * Returns the goal used, or null if no move.
   */
  steer: (
    playerId: string,
    dirX: number,
    dirY: number,
  ) => { x: number; y: number } | null;
  /** Advance to next waypoint. Returns true if arrived at final destination. */
  advancePath: (playerId: string) => boolean;
  setPendingSit: (playerId: string | null) => void;
  clearPendingSit: () => void;
  reset: () => void;
}

function safeSpawnPos(tablePosition: number): OutpostPos {
  const seatNumber = tablePosition + 1;
  const preferred = getOutpostSpot(seatNumber);
  const stand = standUpSpawnForSeat(seatNumber);
  const fromLayout = ensureOutsideFurniture({ x: preferred.x, y: preferred.y });
  const useLayout =
    pointInWalkable(fromLayout) &&
    Math.hypot(fromLayout.x - preferred.x, fromLayout.y - preferred.y) < 1.5;
  const point = useLayout ? fromLayout : ensureOutsideFurniture(stand);
  return {
    x: point.x,
    y: point.y,
    scale: preferred.scale,
  };
}

/** Keep movement scale in sync with standing-spot layout (editor saves). */
function withSpotScale(pos: OutpostPos, tablePosition: number): OutpostPos {
  const spot = getOutpostSpot(tablePosition + 1);
  return { ...pos, scale: spot.scale };
}

function sanitizePos(pos: OutpostPos): OutpostPos {
  const cleared = clampToWanderBounds({ x: pos.x, y: pos.y });
  return { ...pos, x: cleared.x, y: cleared.y };
}

function sampleFeet(
  playerId: string,
  positions: Record<string, OutpostPos>,
  moveAnim: Record<string, MoveAnim>,
  inMotion: Record<string, boolean>,
): { x: number; y: number } | null {
  const pos = positions[playerId];
  if (!pos) return null;
  const anim = moveAnim[playerId];
  if (!anim || !inMotion[playerId]) return { x: pos.x, y: pos.y };
  const u = Math.min(
    1,
    Math.max(0, (performance.now() - anim.startedAt) / Math.max(1, anim.durationMs)),
  );
  return {
    x: anim.fromX + (anim.toX - anim.fromX) * u,
    y: anim.fromY + (anim.toY - anim.fromY) * u,
  };
}

function beginAnim(
  from: { x: number; y: number },
  to: { x: number; y: number },
  opts?: { preciseTiming?: boolean },
): MoveAnim {
  const durationMs =
    moveDurationSeconds(from.x, from.y, to.x, to.y, opts) * 1000;
  return {
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    startedAt: performance.now(),
    durationMs,
  };
}

export const useOutpostMovementStore = create<OutpostMovementState>((set, get) => ({
  positions: {},
  remainingPath: {},
  inMotion: {},
  moveAnim: {},
  pendingSitPlayerId: null,

  getFeet: (playerId) => {
    const s = get();
    return sampleFeet(playerId, s.positions, s.moveAnim, s.inMotion);
  },

  initFromPlayers: (players) => {
    const { positions } = get();
    const next = { ...positions };
    let changed = false;
    for (const p of players) {
      if (next[p.id]) {
        const cleaned = withSpotScale(sanitizePos(next[p.id]!), p.tablePosition);
        const prev = next[p.id]!;
        if (
          Math.abs(cleaned.x - prev.x) > 0.05 ||
          Math.abs(cleaned.y - prev.y) > 0.05 ||
          Math.abs(cleaned.scale - prev.scale) > 0.001
        ) {
          next[p.id] = cleaned;
          changed = true;
        }
        continue;
      }
      next[p.id] = safeSpawnPos(p.tablePosition);
      changed = true;
    }
    if (changed) set({ positions: next });
  },

  respawnOutsideFurniture: (players) => {
    const next: Record<string, OutpostPos> = {};
    for (const p of players) {
      next[p.id] = safeSpawnPos(p.tablePosition);
    }
    set({
      positions: next,
      remainingPath: {},
      inMotion: {},
      moveAnim: {},
      pendingSitPlayerId: null,
    });
  },

  sanitizeAllPositions: () => {
    const { positions } = get();
    const next: Record<string, OutpostPos> = {};
    let changed = false;
    for (const [id, pos] of Object.entries(positions)) {
      const cleaned = sanitizePos(pos);
      next[id] = cleaned;
      if (
        Math.abs(cleaned.x - pos.x) > 0.05 ||
        Math.abs(cleaned.y - pos.y) > 0.05
      ) {
        changed = true;
      }
    }
    if (changed) {
      set({ positions: next, remainingPath: {}, inMotion: {}, moveAnim: {} });
    }
  },

  hydratePositions: (incoming) => {
    const next: Record<string, OutpostPos> = {};
    for (const [id, pos] of Object.entries(incoming)) {
      next[id] = sanitizePos(pos);
    }
    set({
      positions: next,
      remainingPath: {},
      inMotion: {},
      moveAnim: {},
      pendingSitPlayerId: null,
    });
  },

  isMoving: (playerId) => {
    if (get().inMotion[playerId]) return true;
    const rest = get().remainingPath[playerId];
    return Boolean(rest && rest.length > 0);
  },

  setTarget: (playerId, x, y, opts) => {
    const state = get();
    const prev = state.positions[playerId];
    const scale = prev?.scale ?? 0.9;
    const dynamicObstacles: CircleObstacle[] = [];
    for (const [otherId, pos] of Object.entries(state.positions)) {
      if (otherId === playerId) continue;
      
      const path = state.remainingPath[otherId];
      let obsX = pos.x;
      let obsY = pos.y;
      if (path && path.length > 0) {
        const last = path[path.length - 1];
        if (last) {
          obsX = last.x;
          obsY = last.y;
        }
      }
      dynamicObstacles.push({
        id: `player_${otherId}`,
        cx: obsX,
        cy: obsY,
        r: 3.5,
      });
    }

    const optsWithDyn = { ...opts, dynamicObstacles };
    const obstacles = getOutpostObstacles(optsWithDyn);

    // Path from where the sprite actually is, not the unfinished waypoint
    const feet =
      sampleFeet(playerId, state.positions, state.moveAnim, state.inMotion) ??
      (prev ? { x: prev.x, y: prev.y } : { x, y });
    const from = pushOutOfObstacles(feet, obstacles);

    let waypoints: { x: number; y: number }[];

    if (opts?.directAlongRay) {
      const goal = lastWalkableAlongRay(from, { x, y }, obstacles);
      if (dist(from.x, from.y, goal.x, goal.y) <= NEAR_EPS) {
        const { [playerId]: _drop, ...restAnim } = state.moveAnim;
        set({
          positions: {
            ...state.positions,
            [playerId]: { x: from.x, y: from.y, scale },
          },
          remainingPath: { ...state.remainingPath, [playerId]: [] },
          inMotion: { ...state.inMotion, [playerId]: false },
          moveAnim: restAnim,
        });
        return;
      }
      waypoints = [goal];
    } else {
      const goal =
        opts?.passThroughSeat != null
          ? { x, y }
          : pushOutOfObstacles({ x, y }, obstacles);

      waypoints = findOutpostPath(from, goal, optsWithDyn);
      if (waypoints.length === 0) {
        // Keep current walk — a failed repath must not freeze mid-step
        return;
      }
    }

    // Drop micro leading points so the sprite still gets a real move / complete event
    while (
      waypoints.length > 0 &&
      dist(waypoints[0]!.x, waypoints[0]!.y, from.x, from.y) <= NEAR_EPS
    ) {
      waypoints = waypoints.slice(1);
    }
    if (waypoints.length === 0) {
      const { [playerId]: _drop, ...restAnim } = state.moveAnim;
      set({
        positions: {
          ...state.positions,
          [playerId]: { x: from.x, y: from.y, scale },
        },
        remainingPath: { ...state.remainingPath, [playerId]: [] },
        inMotion: { ...state.inMotion, [playerId]: false },
        moveAnim: restAnim,
      });
      return;
    }

    const first = waypoints[0]!;
    const rest = waypoints.slice(1);
    const anim = beginAnim(from, first, {
      preciseTiming: opts?.preciseTiming,
    });

    set({
      positions: {
        ...get().positions,
        [playerId]: { x: first.x, y: first.y, scale },
      },
      remainingPath: {
        ...get().remainingPath,
        [playerId]: rest,
      },
      inMotion: {
        ...get().inMotion,
        [playerId]: true,
      },
      moveAnim: {
        ...get().moveAnim,
        [playerId]: anim,
      },
    });
  },

  steer: (playerId, dirX, dirY) => {
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-6) return null;
    const nx = dirX / len;
    const ny = dirY / len;
    const feet = get().getFeet(playerId);
    if (!feet) return null;
    const goal = {
      x: feet.x + nx * STEER_LOOKAHEAD_PCT,
      y: feet.y + ny * STEER_LOOKAHEAD_PCT,
    };
    get().setTarget(playerId, goal.x, goal.y, {
      preciseTiming: true,
      directAlongRay: true,
    });
    const state = get();
    const pos = state.positions[playerId];
    if (!pos) return null;
    const path = state.remainingPath[playerId];
    const final =
      path && path.length > 0
        ? path[path.length - 1]!
        : { x: pos.x, y: pos.y };
    if (dist(feet.x, feet.y, final.x, final.y) <= NEAR_EPS) return null;
    return final;
  },

  advancePath: (playerId) => {
    const rest = get().remainingPath[playerId] ?? [];
    if (rest.length === 0) {
      const { [playerId]: _drop, ...restAnim } = get().moveAnim;
      set({
        inMotion: { ...get().inMotion, [playerId]: false },
        moveAnim: restAnim,
      });
      return true;
    }
    const [next, ...tail] = rest;
    if (!next) {
      const { [playerId]: _drop, ...restAnim } = get().moveAnim;
      set({
        inMotion: { ...get().inMotion, [playerId]: false },
        moveAnim: restAnim,
      });
      return true;
    }
    const prev = get().positions[playerId];
    const scale = prev?.scale ?? 0.9;
    const from = prev ? { x: prev.x, y: prev.y } : next;
    const anim = beginAnim(from, next);
    set({
      positions: {
        ...get().positions,
        [playerId]: { x: next.x, y: next.y, scale },
      },
      remainingPath: {
        ...get().remainingPath,
        [playerId]: tail,
      },
      inMotion: {
        ...get().inMotion,
        [playerId]: true,
      },
      moveAnim: {
        ...get().moveAnim,
        [playerId]: anim,
      },
    });
    return false;
  },

  setPendingSit: (playerId) => set({ pendingSitPlayerId: playerId }),
  clearPendingSit: () => set({ pendingSitPlayerId: null }),

  reset: () =>
    set({
      positions: {},
      remainingPath: {},
      inMotion: {},
      moveAnim: {},
      pendingSitPlayerId: null,
    }),
}));
