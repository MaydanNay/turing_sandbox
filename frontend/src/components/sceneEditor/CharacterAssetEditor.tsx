import { ArrowLeft, ImagePlus, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react';

import {
  CHARACTER_ASSET_GROUPS,
  CHARACTER_ASSET_SLOTS,
  characterAssetUrl,
  type CharacterAssetSlotId,
} from '@/data/characterAssetSlots';
import type { CharacterDefinition } from '@/data/characters';

interface CharacterAssetEditorProps {
  character: CharacterDefinition;
  password: string;
  onBack: () => void;
  onCloseAll: () => void;
}

type SlotStatus = 'unknown' | 'ok' | 'missing';

async function probeUrl(url: string): Promise<boolean> {
  // Vite SPA fallback returns 200 text/html for missing public files — never trust status alone.
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (res.ok && type.startsWith('image/')) return true;
  } catch {
    /* fall through to Image probe */
  }
  try {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => reject();
      img.src = url;
    });
    return true;
  } catch {
    return false;
  }
}

function fileToPngBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) {
          reject(new Error('Пустое изображение'));
          return;
        }
        if (width * height > 16_000_000) {
          reject(new Error('Слишком большое разрешение (макс. ~16 Мп)'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas недоступен'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const comma = dataUrl.indexOf(',');
        resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Не удалось конвертировать'));
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось прочитать изображение'));
    };
    img.src = url;
  });
}

export function CharacterAssetEditor({
  character,
  password,
  onBack,
  onCloseAll,
}: CharacterAssetEditorProps) {
  const [bust, setBust] = useState(() => Date.now());
  const [status, setStatus] = useState<Partial<Record<CharacterAssetSlotId, SlotStatus>>>(
    {},
  );
  const [uploading, setUploading] = useState<CharacterAssetSlotId | null>(null);
  const [deleting, setDeleting] = useState<CharacterAssetSlotId | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingSlotRef = useRef<CharacterAssetSlotId | null>(null);
  const probeGenerationRef = useRef(0);

  const refreshStatuses = useCallback(async () => {
    const generation = ++probeGenerationRef.current;
    const next: Partial<Record<CharacterAssetSlotId, SlotStatus>> = {};
    await Promise.all(
      CHARACTER_ASSET_SLOTS.map(async (slot) => {
        const url = characterAssetUrl(character, slot.id, bust);
        next[slot.id] = (await probeUrl(url)) ? 'ok' : 'missing';
      }),
    );
    if (generation !== probeGenerationRef.current) return;
    setStatus(next);
  }, [character, bust]);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  const groups = useMemo(
    () =>
      CHARACTER_ASSET_GROUPS.map((g) => ({
        ...g,
        slots: CHARACTER_ASSET_SLOTS.filter((s) => s.group === g.id),
      })),
    [],
  );

  const pickFile = (slotId: CharacterAssetSlotId) => {
    pendingSlotRef.current = slotId;
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slotId = pendingSlotRef.current;
    e.target.value = '';
    pendingSlotRef.current = null;
    if (!file || !slotId) return;

    if (!file.type.startsWith('image/')) {
      setMessage('Нужен файл изображения (png / jpg / webp)');
      return;
    }
    if (file.size > 8_000_000) {
      setMessage('Файл слишком большой (макс. 8 МБ)');
      return;
    }

    setUploading(slotId);
    setMessage(null);
    try {
      const base64 = await fileToPngBase64(file);
      const res = await fetch('/__scene-editor/upload-character-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          characterId: character.id,
          seat: character.seat,
          slot: slotId,
          mime: 'image/png',
          base64,
        }),
      });
      let data: { ok?: boolean; error?: string; path?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setMessage(
          res.status === 404
            ? 'Загрузка недоступна — перезапустите npm run dev'
            : `Ошибка загрузки (${res.status})`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? `Ошибка загрузки (${res.status})`);
        return;
      }
      setStatus((s) => ({ ...s, [slotId]: 'ok' }));
      setBust(Date.now());
      setMessage(`Сохранено: ${data.path ?? slotId}`);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Загрузка недоступна — перезапустите npm run dev',
      );
    } finally {
      setUploading(null);
    }
  };

  const onDelete = async (slotId: CharacterAssetSlotId) => {
    if (status[slotId] !== 'ok') return;
    if (!window.confirm('Удалить этот файл с диска?')) return;
    setDeleting(slotId);
    setMessage(null);
    try {
      const res = await fetch('/__scene-editor/delete-character-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          characterId: character.id,
          seat: character.seat,
          slot: slotId,
        }),
      });
      let data: { ok?: boolean; error?: string; path?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setMessage(
          res.status === 404
            ? 'Удаление недоступно — перезапустите npm run dev'
            : `Ошибка удаления (${res.status})`,
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? `Ошибка удаления (${res.status})`);
        return;
      }
      setStatus((s) => ({ ...s, [slotId]: 'missing' }));
      setBust(Date.now());
      setMessage(`Удалено: ${data.path ?? slotId}`);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : 'Удаление недоступно — перезапустите npm run dev',
      );
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex flex-col bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-amber-300/25 bg-black/90 px-4 py-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5 font-mono text-[11px] hover:bg-white/10"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          Назад
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-300/70">
            Ассеты персонажа
          </p>
          <h1 className="truncate text-base font-semibold text-amber-50">
            {character.displayName}
            <span className="ml-2 font-mono text-[11px] font-normal text-neutral-500">
              {character.id} · стул {character.seat}
            </span>
          </h1>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-white/20 px-2.5 py-1.5 font-mono text-[11px] hover:bg-white/10"
          onClick={() => {
            setBust(Date.now());
          }}
          title="Обновить превью"
        >
          <RefreshCw className="size-3.5" />
          Обновить
        </button>
        <button
          type="button"
          className="rounded border border-white/20 px-2.5 py-1.5 font-mono text-[11px] hover:bg-white/10"
          onClick={onCloseAll}
        >
          Закрыть
        </button>
      </header>

      {message && (
        <p className="shrink-0 border-b border-white/10 bg-amber-500/10 px-4 py-2 font-mono text-[11px] text-amber-100">
          {message}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          {groups.map((group) => (
            <section key={group.id}>
              <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.18em] text-amber-300/80">
                {group.label}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.slots.map((slot) => {
                  const url = characterAssetUrl(character, slot.id, bust);
                  const st = status[slot.id] ?? 'unknown';
                  const busy = uploading === slot.id || deleting === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className="flex flex-col overflow-hidden rounded-lg border border-white/12 bg-black/50"
                    >
                      <div className="relative flex aspect-square items-center justify-center bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06),transparent_65%)] p-3">
                        {st === 'ok' ? (
                          <img
                            src={url}
                            alt={slot.label}
                            className="max-h-full max-w-full object-contain"
                            onError={() =>
                              setStatus((s) => ({ ...s, [slot.id]: 'missing' }))
                            }
                          />
                        ) : st === 'unknown' ? (
                          <Loader2 className="size-6 animate-spin text-neutral-500" />
                        ) : (
                          <div className="flex flex-col items-center gap-2 text-neutral-500">
                            <ImagePlus className="size-8 opacity-40" />
                            <span className="font-mono text-[10px]">нет файла</span>
                          </div>
                        )}
                        {busy && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                            <Loader2 className="size-6 animate-spin text-amber-200" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1 border-t border-white/10 p-2.5">
                        <p className="font-mono text-[12px] font-semibold text-amber-50">
                          {slot.label}
                        </p>
                        <p className="font-mono text-[10px] leading-snug text-neutral-500">
                          {slot.description}
                        </p>
                        <p className="truncate font-mono text-[9px] text-neutral-600">
                          {slot.relPath(character)}
                        </p>
                        <div className="mt-1 flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            className="flex-1 rounded border border-amber-300/40 bg-amber-500/15 px-2 py-1.5 font-mono text-[11px] text-amber-100 hover:bg-amber-500/25 disabled:opacity-50"
                            onClick={() => pickFile(slot.id)}
                          >
                            {st === 'ok' ? 'Заменить' : 'Прикрепить'}
                          </button>
                          <button
                            type="button"
                            disabled={busy || st !== 'ok'}
                            className="inline-flex size-8 shrink-0 items-center justify-center rounded border border-red-400/40 text-red-200 hover:bg-red-500/20 disabled:opacity-40"
                            onClick={() => void onDelete(slot.id)}
                            title="Удалить файл"
                            aria-label="Удалить файл"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void onFileChange(e)}
      />
    </div>
  );
}
