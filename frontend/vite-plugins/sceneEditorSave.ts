import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect, Plugin } from 'vite';

const ALLOWED = {
  walk: 'src/data/outpostWalkMask.json',
  objects: 'src/data/outpostSceneObjects.json',
  furniture: 'src/data/outpostFurniture.json',
} as const;

type SaveKey = keyof typeof ALLOWED;

type RosterEntry = { seat: number; standFacing?: string };

function loadRoster(): { ids: Set<string>; seats: Record<string, number> } {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rosterPath = path.resolve(here, '../src/data/characterRoster.json');
  const raw = JSON.parse(readFileSync(rosterPath, 'utf8')) as Record<
    string,
    RosterEntry
  >;
  const ids = new Set(Object.keys(raw));
  const seats: Record<string, number> = {};
  for (const [id, entry] of Object.entries(raw)) {
    if (!entry || typeof entry.seat !== 'number') {
      throw new Error(`characterRoster.json: invalid seat for ${id}`);
    }
    seats[id] = entry.seat;
  }
  return { ids, seats };
}

const { ids: CHARACTER_IDS, seats: CHARACTER_SEATS } = loadRoster();

const ASSET_SLOTS = new Set([
  'stand_left',
  'stand_right',
  'stand_front',
  'stand_back',
  'seated',
  'chat',
  'card',
]);

const MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function characterAssetRelPath(
  characterId: string,
  slot: string,
  seat: number,
  ext: string,
): string | null {
  switch (slot) {
    case 'stand_left':
      return `assets/characters/poses/${characterId}/left${ext}`;
    case 'stand_right':
      return `assets/characters/poses/${characterId}/right${ext}`;
    case 'stand_front':
      return `assets/characters/poses/${characterId}/front${ext}`;
    case 'stand_back':
      return `assets/characters/poses/${characterId}/back${ext}`;
    case 'seated':
      return `assets/table/seats/occupied/${String(seat).padStart(2, '0')}_${characterId}${ext}`;
    case 'chat':
      return `assets/characters/chat/${characterId}_chat${ext}`;
    case 'card':
      return `assets/cards/characters/${characterId}_card${ext}`;
    default:
      return null;
  }
}

function isNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPoint(p: unknown): boolean {
  return (
    typeof p === 'object' &&
    p !== null &&
    isNum((p as { x: unknown }).x) &&
    isNum((p as { y: unknown }).y)
  );
}

function validateWalk(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'walk: root must be object';
  const d = data as { walk?: unknown; block?: unknown };
  if (!Array.isArray(d.walk) || !Array.isArray(d.block)) {
    return 'walk: need walk[] and block[]';
  }
  if (d.walk.length < 1) return 'walk: need ≥1 yellow polygon';
  for (const poly of d.walk) {
    if (!Array.isArray(poly) || poly.length < 3 || !poly.every(isPoint)) {
      return 'walk: invalid walk polygon';
    }
  }
  for (const poly of d.block) {
    if (!Array.isArray(poly) || !poly.every(isPoint)) {
      return 'walk: invalid block polygon';
    }
  }
  return null;
}

function validateFurniture(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'furniture: root must be object';
  const d = data as {
    group?: { x?: unknown; y?: unknown; widthPercent?: unknown };
    table?: { x?: unknown; y?: unknown; widthPercent?: unknown };
    seats?: unknown;
  };
  if (!d.group || !isNum(d.group.x) || !isNum(d.group.y) || !isNum(d.group.widthPercent)) {
    return 'furniture: invalid group';
  }
  if (!d.table || !isNum(d.table.x) || !isNum(d.table.y) || !isNum(d.table.widthPercent)) {
    return 'furniture: invalid table';
  }
  if (!Array.isArray(d.seats) || d.seats.length !== 8) {
    return 'furniture: need exactly 8 seats';
  }
  for (const s of d.seats) {
    if (
      typeof s !== 'object' ||
      s === null ||
      !isNum((s as { x: unknown }).x) ||
      !isNum((s as { y: unknown }).y) ||
      !isNum((s as { scale: unknown }).scale)
    ) {
      return 'furniture: invalid seat';
    }
  }
  return null;
}

function validateObjects(data: unknown): string | null {
  if (!Array.isArray(data)) return 'objects: root must be array';
  for (const o of data) {
    if (typeof o !== 'object' || o === null) return 'objects: invalid item';
    const item = o as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.type !== 'string') {
      return 'objects: id/type required';
    }
    if (!isNum(item.x) || !isNum(item.y) || !isNum(item.w) || !isNum(item.h)) {
      return 'objects: x/y/w/h must be numbers';
    }
  }
  return null;
}

const VALIDATORS: Record<SaveKey, (data: unknown) => string | null> = {
  walk: validateWalk,
  furniture: validateFurniture,
  objects: validateObjects,
};

function readBody(req: Connect.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) => {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function sendJson(
  res: Connect.ServerResponse,
  status: number,
  payload: unknown,
): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function isSafeDataFile(dataRoot: string, abs: string): boolean {
  const rel = path.relative(dataRoot, abs);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function isSafePublicAsset(publicRoot: string, abs: string): boolean {
  const rel = path.relative(publicRoot, abs);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

async function handleCharacterAssetUpload(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  root: string,
  expectedPassword: string,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    return;
  }

  if (typeof body.password !== 'string' || body.password !== expectedPassword) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    return;
  }

  const characterId = body.characterId;
  const slot = body.slot;
  const seat = body.seat;
  const mime = body.mime;
  const base64 = body.base64;

  if (typeof characterId !== 'string' || !CHARACTER_IDS.has(characterId)) {
    sendJson(res, 400, { ok: false, error: 'Unknown characterId' });
    return;
  }
  if (typeof slot !== 'string' || !ASSET_SLOTS.has(slot)) {
    sendJson(res, 400, { ok: false, error: 'Unknown slot' });
    return;
  }
  if (!isNum(seat) || CHARACTER_SEATS[characterId] !== seat) {
    sendJson(res, 400, { ok: false, error: 'seat does not match character' });
    return;
  }
  if (typeof mime !== 'string' || !(mime in MIME_EXT)) {
    sendJson(res, 400, { ok: false, error: 'Unsupported mime (png/jpeg/webp/gif)' });
    return;
  }
  if (typeof base64 !== 'string' || base64.length < 32) {
    sendJson(res, 400, { ok: false, error: 'Missing image data' });
    return;
  }

  // Keep .png paths stable for existing ASSETS URLs
  const ext = '.png';
  const rel = characterAssetRelPath(characterId, slot, seat, ext);
  if (!rel) {
    sendJson(res, 400, { ok: false, error: 'Invalid slot path' });
    return;
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid base64' });
    return;
  }
  if (buf.length < 8 || buf.length > 8_000_000) {
    sendJson(res, 413, { ok: false, error: 'Invalid file size (max 8MB)' });
    return;
  }
  // PNG signature — client always re-encodes to PNG
  const isPng =
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a;
  if (!isPng) {
    sendJson(res, 400, { ok: false, error: 'Expected PNG bytes' });
    return;
  }

  const publicRoot = path.resolve(root, 'public');
  const abs = path.resolve(publicRoot, rel);
  if (!isSafePublicAsset(publicRoot, abs)) {
    sendJson(res, 400, { ok: false, error: 'Invalid path' });
    return;
  }

  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  sendJson(res, 200, { ok: true, path: `public/${rel}` });
}

async function handleCharacterAssetDelete(
  req: Connect.IncomingMessage,
  res: Connect.ServerResponse,
  root: string,
  expectedPassword: string,
): Promise<void> {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    return;
  }

  const raw = await readBody(req);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    sendJson(res, 400, { ok: false, error: 'Invalid JSON' });
    return;
  }

  if (typeof body.password !== 'string' || body.password !== expectedPassword) {
    sendJson(res, 401, { ok: false, error: 'Unauthorized' });
    return;
  }

  const characterId = body.characterId;
  const slot = body.slot;
  const seat = body.seat;

  if (typeof characterId !== 'string' || !CHARACTER_IDS.has(characterId)) {
    sendJson(res, 400, { ok: false, error: 'Unknown characterId' });
    return;
  }
  if (typeof slot !== 'string' || !ASSET_SLOTS.has(slot)) {
    sendJson(res, 400, { ok: false, error: 'Unknown slot' });
    return;
  }
  if (!isNum(seat) || CHARACTER_SEATS[characterId] !== seat) {
    sendJson(res, 400, { ok: false, error: 'seat does not match character' });
    return;
  }

  const rel = characterAssetRelPath(characterId, slot, seat, '.png');
  if (!rel) {
    sendJson(res, 400, { ok: false, error: 'Invalid slot path' });
    return;
  }

  const publicRoot = path.resolve(root, 'public');
  const abs = path.resolve(publicRoot, rel);
  if (!isSafePublicAsset(publicRoot, abs)) {
    sendJson(res, 400, { ok: false, error: 'Invalid path' });
    return;
  }

  try {
    await fs.unlink(abs);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      sendJson(res, 404, { ok: false, error: 'File not found' });
      return;
    }
    throw err;
  }

  sendJson(res, 200, { ok: true, path: `public/${rel}` });
}

/**
 * DEV-only:
 * - POST /__scene-editor/save
 * - POST /__scene-editor/upload-character-asset
 * - POST /__scene-editor/delete-character-asset
 */
export function sceneEditorSavePlugin(password: string): Plugin {
  const expected = password.trim() || 'admin123';

  return {
    name: 'scene-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];

        if (url === '/__scene-editor/upload-character-asset') {
          try {
            await handleCharacterAssetUpload(
              req,
              res,
              server.config.root,
              expected,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Upload failed';
            sendJson(res, 500, { ok: false, error: message });
          }
          return;
        }

        if (url === '/__scene-editor/delete-character-asset') {
          try {
            await handleCharacterAssetDelete(
              req,
              res,
              server.config.root,
              expected,
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Delete failed';
            sendJson(res, 500, { ok: false, error: message });
          }
          return;
        }

        if (url !== '/__scene-editor/save') {
          next();
          return;
        }

        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
          return;
        }

        try {
          const raw = await readBody(req);
          const body = JSON.parse(raw) as Record<string, unknown>;

          if (typeof body.password !== 'string' || body.password !== expected) {
            sendJson(res, 401, { ok: false, error: 'Unauthorized' });
            return;
          }

          const dataRoot = path.resolve(server.config.root, 'src/data');
          const written: string[] = [];

          for (const key of Object.keys(ALLOWED) as SaveKey[]) {
            if (!(key in body) || body[key] === undefined || body[key] === null) {
              continue;
            }
            const data = body[key];
            const invalid = VALIDATORS[key](data);
            if (invalid) {
              sendJson(res, 400, { ok: false, error: invalid });
              return;
            }

            const abs = path.resolve(server.config.root, ALLOWED[key]);
            if (!isSafeDataFile(dataRoot, abs)) {
              sendJson(res, 400, { ok: false, error: 'Invalid path' });
              return;
            }

            const text = `${JSON.stringify(data, null, 2)}\n`;
            if (text.length > 2_000_000) {
              sendJson(res, 413, { ok: false, error: `${key}: too large` });
              return;
            }

            await fs.writeFile(abs, text, 'utf8');
            written.push(ALLOWED[key]);
          }

          if (written.length === 0) {
            sendJson(res, 400, { ok: false, error: 'Nothing to save' });
            return;
          }

          sendJson(res, 200, { ok: true, written });
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Save failed';
          sendJson(res, 500, { ok: false, error: message });
        }
      });
    },
  };
}
