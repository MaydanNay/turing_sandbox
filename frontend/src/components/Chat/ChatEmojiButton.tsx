import { Smile } from 'lucide-react';
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { EmojiClickData } from 'emoji-picker-react';

const LazyEmojiPickerPanel = lazy(() => import('@/components/Chat/EmojiPickerPanel'));

interface ChatEmojiButtonProps {
  onPick: (emoji: string) => void;
  disabled?: boolean;
  /** Prefer inserting at cursor of this input when provided */
  inputRef?: RefObject<HTMLInputElement | null>;
}

export function ChatEmojiButton({
  onPick,
  disabled = false,
  inputRef,
}: ChatEmojiButtonProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onPick(emojiData.emoji);

    const input = inputRef?.current;
    if (input) {
      requestAnimationFrame(() => input.focus());
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Эмодзи"
        aria-expanded={open}
        title="Эмодзи"
      >
        <Smile className="h-5 w-5" strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 z-[60]">
          <Suspense
            fallback={
              <div className="flex h-[350px] w-[320px] items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm text-neutral-500 shadow-xl">
                Загрузка эмодзи…
              </div>
            }
          >
            <LazyEmojiPickerPanel onEmojiClick={handleEmojiClick} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

/** Insert emoji into draft string, optionally at input selection. */
export function insertEmojiAtCursor(
  value: string,
  emoji: string,
  input: HTMLInputElement | null | undefined,
): string {
  if (!input) return `${value}${emoji}`;

  const start = input.selectionStart ?? value.length;
  const end = input.selectionEnd ?? value.length;
  const next = `${value.slice(0, start)}${emoji}${value.slice(end)}`;

  requestAnimationFrame(() => {
    const caret = start + emoji.length;
    input.setSelectionRange(caret, caret);
    input.focus();
  });

  return next;
}
