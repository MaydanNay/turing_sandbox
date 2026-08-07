import { type WalkPoint } from '@/data/outpostWalkMask';
import {
  OUTPOST_WANDER_BOUNDS,
  SCENE_GROUP,
  SCENE_LAYOUT,
  seatLayoutToScenePos,
} from '@/utils/seatPositions';
import {
  getActiveBlockPolygons,
  getActiveWalkPolygons,
} from '@/utils/walkMaskRuntime';

export interface Point {
  x: number;
  y: number;
}

export interface CircleObstacle {
  id: string;
  cx: number;
  cy: number;
  r: number;
}

const TABLE_RADIUS_PAD = 1.55;
const SEAT_RADIUS_SCENE = 5.5;
/** Extra clearance so chibis never spawn visually “in” the table ring */
const FURNITURE_SPAWN_PAD = 5.5;
const RING_SAMPLES = 16;
const PATH_MARGIN = 0.85;

function tableCenterScene(): Point {
  const { table } = SCENE_LAYOUT;
  return seatLayoutToScenePos({
    x: table.x + (table.offsetX ?? 0),
    y: table.y + (table.offsetY ?? 0),
    scale: 1,
  });
}

function tableRadiusScene(): number {
  return (SCENE_LAYOUT.table.widthPercent / 2 / 100) * SCENE_GROUP.widthPercent * TABLE_RADIUS_PAD;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Ray-cast point-in-polygon. */
export function pointInPolygon(p: Point, polygon: WalkPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i]!;
    const pj = polygon[j]!;
    const intersect =
      pi.y > p.y !== pj.y > p.y &&
      p.x < ((pj.x - pi.x) * (p.y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getWalkPolygons(): WalkPoint[][] {
  return getActiveWalkPolygons();
}

export function getBlockPolygons(): WalkPoint[][] {
  return getActiveBlockPolygons();
}

export function pointInWalkable(p: Point): boolean {
  const walks = getWalkPolygons();
  const blocks = getBlockPolygons();
  if (blocks.some((poly) => pointInPolygon(p, poly))) return false;
  if (walks.length === 0) return true;
  return walks.some((poly) => pointInPolygon(p, poly));
}

function closestPointOnSegment(p: Point, a: Point, b: Point): Point {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * abx, y: a.y + t * aby };
}

function closestPointOnPolyBoundary(p: Point, poly: WalkPoint[]): Point {
  let best: Point = poly[0] ?? p;
  let bestD = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = closestPointOnSegment(p, a, b);
    const d = dist(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function polyCentroid(poly: WalkPoint[]): Point {
  let x = 0;
  let y = 0;
  for (const v of poly) {
    x += v.x;
    y += v.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

/** Push a boundary point slightly outside a block poly (away from centroid). */
function outsideBlock(edgePt: Point, poly: WalkPoint[], pad = 0.75): Point {
  const c = polyCentroid(poly);
  const dx = edgePt.x - c.x;
  const dy = edgePt.y - c.y;
  const len = Math.hypot(dx, dy) || 1;
  return {
    x: edgePt.x + (dx / len) * pad,
    y: edgePt.y + (dy / len) * pad,
  };
}

/**
 * If outside walkable mask (or inside a red block), snap to a valid floor point.
 */
export function clampToWalkable(p: Point): Point {
  if (pointInWalkable(p)) return p;

  const blocks = getBlockPolygons();
  for (const poly of blocks) {
    if (poly.length < 3 || !pointInPolygon(p, poly)) continue;
    const onEdge = closestPointOnPolyBoundary(p, poly);
    const out = outsideBlock(onEdge, poly);
    if (pointInWalkable(out)) return out;
    // try a few pads
    for (const pad of [1.2, 2, 3.5]) {
      const q = outsideBlock(onEdge, poly, pad);
      if (pointInWalkable(q)) return q;
    }
  }

  const walks = getWalkPolygons();
  if (walks.length === 0) return p;

  let best: Point = p;
  let bestD = Infinity;
  for (const poly of walks) {
    if (poly.length < 2) continue;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const c = closestPointOnSegment(p, a, b);
      const d = dist(p, c);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
  }

  if (pointInWalkable(best)) return best;

  // Walk-edge sample landed in a block — nudge candidates along the edge neighborhood
  for (const poly of blocks) {
    if (poly.length < 3 || !pointInPolygon(best, poly)) continue;
    const out = outsideBlock(best, poly, 1.5);
    if (pointInWalkable(out)) return out;
  }
  return best;
}

function boxWander(p: Point): Point {
  const { minX, maxX, minY, maxY } = OUTPOST_WANDER_BOUNDS;
  return {
    x: Math.min(maxX, Math.max(minX, p.x)),
    y: Math.min(maxY, Math.max(minY, p.y)),
  };
}

/** Soft AABB then walkable polygon. */
export function clampToWanderBounds(p: Point): Point {
  return clampToWalkable(boxWander(p));
}

/** One fat circle covering table + all chairs (for spawn / stand-up). */
export function getFurnitureBlob(): CircleObstacle {
  const center = tableCenterScene();
  let r = tableRadiusScene();
  for (const seat of SCENE_LAYOUT.seats) {
    const p = seatLayoutToScenePos(seat);
    r = Math.max(r, dist(center, p) + SEAT_RADIUS_SCENE);
  }
  return {
    id: 'furniture',
    cx: center.x,
    cy: center.y,
    r: r + FURNITURE_SPAWN_PAD,
  };
}

/** Never stand on/inside the table ring; stay on walkable floor. */
export function ensureOutsideFurniture(p: Point): Point {
  return resolveOutsideObstacles(boxWander(p), [getFurnitureBlob()]);
}

function clearOfObstacles(p: Point, obstacles: CircleObstacle[]): boolean {
  return !obstacles.some((o) => pointInCircle(p, o, PATH_MARGIN));
}

/**
 * Push out of circles, then keep on walkable without pulling back into obstacles
 * (naive clampToWalkable can snap across the table).
 */
function resolveOutsideObstacles(p: Point, obstacles: CircleObstacle[]): Point {
  let q = pushOutOfObstaclesRaw(boxWander(p), obstacles);
  q = boxWander(q);

  if (pointInWalkable(q) && clearOfObstacles(q, obstacles)) {
    return q;
  }

  // Prefer ring samples around the largest / first obstacle (furniture blob)
  const primary = obstacles[0] ?? getFurnitureBlob();
  let best: Point | null = null;
  let bestD = Infinity;
  const samples = 36;
  const r = primary.r + PATH_MARGIN + 0.5;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const cand = boxWander({
      x: primary.cx + Math.cos(a) * r,
      y: primary.cy + Math.sin(a) * r,
    });
    if (!pointInWalkable(cand) || !clearOfObstacles(cand, obstacles)) continue;
    const d = dist(p, cand);
    if (d < bestD) {
      bestD = d;
      best = cand;
    }
  }
  if (best) return best;

  // Last resort: walkable clamp then push again once
  q = pushOutOfObstaclesRaw(clampToWalkable(boxWander(p)), obstacles);
  return boxWander(q);
}

/**
 * Spot just outside your chair (away from table center) — used on stand-up / match start.
 */
export function standUpSpawnForSeat(seatNumber: number): Point {
  const seat = SCENE_LAYOUT.seats[seatNumber - 1];
  const blob = getFurnitureBlob();
  if (!seat) {
    return ensureOutsideFurniture({ x: blob.cx + blob.r + 2, y: blob.cy });
  }
  const seatPos = seatLayoutToScenePos(seat);
  const dx = seatPos.x - blob.cx;
  const dy = seatPos.y - blob.cy;
  const len = Math.hypot(dx, dy) || 1;
  return ensureOutsideFurniture({
    x: blob.cx + (dx / len) * (blob.r + 1.2),
    y: blob.cy + (dy / len) * (blob.r + 1.2),
  });
}

/**
 * Circle blockers for pathfinding.
 * Empty on purpose — walkability is owned by OUTPOST_WALK_POLYGONS only
 * (edit via ?walkEdit=1). Table/chairs are not circle-blocked.
 */
export function getOutpostObstacles(_opts?: {
  /** kept for call-site compat (sit path) */
  passThroughSeat?: number;
}): CircleObstacle[] {
  return [];
}

/**
 * Soft clamp for player floor clicks: keep raw point when inside walk poly,
 * otherwise snap to nearest walkable.
 */
export function clampPlayerClick(p: Point): Point {
  if (isWalkableOutpostPoint(p)) return p;
  return clampToWanderBounds(p);
}

function pointInCircle(p: Point, c: CircleObstacle, pad = 0): boolean {
  return dist(p, { x: c.cx, y: c.cy }) < c.r + pad;
}

function distPointToSegment(p: Point, a: Point, b: Point): number {
  return dist(p, closestPointOnSegment(p, a, b));
}

function segmentHitsObstacle(a: Point, b: Point, obstacle: CircleObstacle): boolean {
  return distPointToSegment({ x: obstacle.cx, y: obstacle.cy }, a, b) < obstacle.r + PATH_MARGIN;
}

function segmentStaysWalkable(a: Point, b: Point): boolean {
  if (!pointInWalkable(a) || !pointInWalkable(b)) return false;
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (!pointInWalkable(p)) return false;
  }
  return true;
}

function lineOfSight(a: Point, b: Point, obstacles: CircleObstacle[]): boolean {
  if (!segmentStaysWalkable(a, b)) return false;
  return !obstacles.some((o) => segmentHitsObstacle(a, b, o));
}

function pushOutOfObstaclesRaw(p: Point, obstacles: CircleObstacle[]): Point {
  let x = p.x;
  let y = p.y;
  for (let iter = 0; iter < 6; iter++) {
    let moved = false;
    for (const o of obstacles) {
      const dx = x - o.cx;
      const dy = y - o.cy;
      const d = Math.hypot(dx, dy);
      const need = o.r + PATH_MARGIN + 0.15;
      if (d < need) {
        if (d < 1e-4) {
          x = o.cx + need;
          y = o.cy;
        } else {
          const s = need / d;
          x = o.cx + dx * s;
          y = o.cy + dy * s;
        }
        moved = true;
      }
    }
    if (!moved) break;
  }
  return { x, y };
}

/** Push a point outside all obstacles, then keep on walkable floor. */
export function pushOutOfObstacles(p: Point, obstacles: CircleObstacle[]): Point {
  return resolveOutsideObstacles(p, obstacles);
}

function ringPoints(obstacle: CircleObstacle): Point[] {
  const r = obstacle.r + PATH_MARGIN + 0.4;
  const pts: Point[] = [];
  for (let i = 0; i < RING_SAMPLES; i++) {
    const a = (i / RING_SAMPLES) * Math.PI * 2;
    pts.push({
      x: obstacle.cx + Math.cos(a) * r,
      y: obstacle.cy + Math.sin(a) * r,
    });
  }
  return pts;
}

function blockDetourNodes(): Point[] {
  const nodes: Point[] = [];
  for (const poly of getBlockPolygons()) {
    if (poly.length < 3) continue;
    const c = polyCentroid(poly);
    for (let i = 0; i < poly.length; i++) {
      const v = poly[i]!;
      const next = poly[(i + 1) % poly.length]!;
      for (const pad of [1.0, 2.0]) {
        const outV = outsideBlock(v, poly, pad);
        if (pointInWalkable(outV)) nodes.push(outV);
        const mid = { x: (v.x + next.x) / 2, y: (v.y + next.y) / 2 };
        const dx = mid.x - c.x;
        const dy = mid.y - c.y;
        const len = Math.hypot(dx, dy) || 1;
        const outM = {
          x: mid.x + (dx / len) * pad,
          y: mid.y + (dy / len) * pad,
        };
        if (pointInWalkable(outM)) nodes.push(outM);
      }
    }
  }
  return nodes;
}

/**
 * Walk around blocked polys. Returns waypoints after `from` (does not include start).
 */
export function findOutpostPath(
  from: Point,
  to: Point,
  opts?: { passThroughSeat?: number },
): Point[] {
  const obstacles = getOutpostObstacles(opts);
  let start = pushOutOfObstacles(from, obstacles);
  if (!pointInWalkable(start)) start = clampToWanderBounds(start);

  let goal = to;
  if (opts?.passThroughSeat != null) {
    const tableOnly = obstacles.filter((o) => o.id === 'table');
    if (tableOnly[0] && pointInCircle(goal, tableOnly[0], 0)) {
      goal = pushOutOfObstacles(goal, tableOnly);
    } else {
      goal = clampToWanderBounds(goal);
    }
  } else {
    goal = pushOutOfObstacles(to, obstacles);
  }
  if (!pointInWalkable(goal)) goal = clampToWanderBounds(goal);

  if (dist(start, goal) < 0.35) {
    return pointInWalkable(goal) ? [goal] : [];
  }

  if (lineOfSight(start, goal, obstacles)) {
    return [goal];
  }

  const nodes: Point[] = [start, goal];
  for (const o of obstacles) {
    for (const p of ringPoints(o)) {
      const n = pushOutOfObstacles(p, obstacles);
      if (pointInWalkable(n)) nodes.push(n);
    }
  }
  for (const n of blockDetourNodes()) nodes.push(n);

  const unique: Point[] = [];
  for (const n of nodes) {
    if (unique.every((u) => dist(u, n) > 0.8)) unique.push(n);
  }

  const n = unique.length;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (lineOfSight(unique[i]!, unique[j]!, obstacles)) {
        adj[i]!.push(j);
        adj[j]!.push(i);
      }
    }
  }

  const startIdx = 0;
  const goalIdx = 1;
  const prev = new Int32Array(n).fill(-1);
  const best = new Float64Array(n).fill(Infinity);
  best[startIdx] = 0;
  const used = new Uint8Array(n);

  for (let iter = 0; iter < n; iter++) {
    let u = -1;
    let bu = Infinity;
    for (let i = 0; i < n; i++) {
      if (!used[i] && best[i]! < bu) {
        bu = best[i]!;
        u = i;
      }
    }
    if (u < 0 || bu === Infinity) break;
    used[u] = 1;
    if (u === goalIdx) break;
    for (const v of adj[u]!) {
      const w = dist(unique[u]!, unique[v]!);
      const nd = best[u]! + w;
      if (nd < best[v]!) {
        best[v] = nd;
        prev[v] = u;
      }
    }
  }

  if ((prev[goalIdx] ?? -1) < 0) {
    // No safe path — do not lerp through blocked floor
    return [];
  }

  const rev: Point[] = [];
  for (let cur = goalIdx; cur !== startIdx; cur = prev[cur]!) {
    if (cur < 0) break;
    rev.push(unique[cur]!);
  }
  rev.reverse();
  if (rev.length === 0 || dist(rev[rev.length - 1]!, goal) > 0.2) {
    rev.push(goal);
  }
  const cleaned: Point[] = [];
  for (const p of rev) {
    if (cleaned.length === 0 || dist(cleaned[cleaned.length - 1]!, p) > 0.4) {
      cleaned.push(p);
    }
  }
  return cleaned;
}

export function isWalkableOutpostPoint(p: Point, _opts?: { passThroughSeat?: number }): boolean {
  return pointInWalkable(p);
}

export function randomWalkableWanderPoint(maxTries = 40): Point {
  const { minX, maxX, minY, maxY } = OUTPOST_WANDER_BOUNDS;
  for (let i = 0; i < maxTries; i++) {
    const p = {
      x: minX + Math.random() * (maxX - minX),
      y: minY + Math.random() * (maxY - minY),
    };
    if (pointInWalkable(p)) return p;
  }
  return clampToWanderBounds({
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  });
}
