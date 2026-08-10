import { useEffect, useRef } from 'react';

import { useGameStore } from '@/store/gameStore';
import { useOutpostMovementStore } from '@/store/outpostMovementStore';

const STEER_INTERVAL_MS = 80;
const NET_SYNC_INTERVAL_MS = 120;

const KEY_DIR: Record<string, { x: number; y: number }> = {
  KeyW: { x: 0, y: -1 },
  KeyA: { x: -1, y: 0 },
  KeyS: { x: 0, y: 1 },
  KeyD: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowDown: { x: 0, y: 1 },
  ArrowRight: { x: 1, y: 0 },
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"]'));
}

export interface UseWasdMovementOptions {
  enabled: boolean;
  selfId: string | null | undefined;
  /** @deprecated Seated state is read from the game store; kept for call-site clarity */
  selfIsSeated?: boolean;
  onStandSelf?: (playerId: string) => void;
  onClearClickMarker?: () => void;
  sendMove?: (x: number, y: number) => void;
}

/**
 * Hold WASD / arrows to walk on the outpost floor (click-to-move still works).
 * Ignores keys while typing in inputs; stands up if seated.
 */
export function useWasdMovement({
  enabled,
  selfId,
  onStandSelf,
  onClearClickMarker,
  sendMove,
}: UseWasdMovementOptions) {
  const pressedRef = useRef(new Set<string>());
  const rafRef = useRef(0);
  const lastSteerAtRef = useRef(0);
  const lastNetAtRef = useRef(0);
  const stoodThisHoldRef = useRef(false);

  const onStandSelfRef = useRef(onStandSelf);
  const onClearClickMarkerRef = useRef(onClearClickMarker);
  const sendMoveRef = useRef(sendMove);
  onStandSelfRef.current = onStandSelf;
  onClearClickMarkerRef.current = onClearClickMarker;
  sendMoveRef.current = sendMove;

  useEffect(() => {
    if (!enabled || !selfId) {
      pressedRef.current.clear();
      stoodThisHoldRef.current = false;
      return;
    }

    const direction = (): { x: number; y: number } | null => {
      let x = 0;
      let y = 0;
      for (const code of pressedRef.current) {
        const d = KEY_DIR[code];
        if (!d) continue;
        x += d.x;
        y += d.y;
      }
      if (x === 0 && y === 0) return null;
      return { x, y };
    };

    const seatedInStore = () =>
      useGameStore.getState().seatedPlayerIds.includes(selfId);

    const tick = (now: number) => {
      rafRef.current = 0;

      // Keep the loop alive while any move key is held — even if W+S cancel out.
      // Otherwise releasing one opposite key would leave the other "stuck" with no loop.
      if (pressedRef.current.size === 0) {
        stoodThisHoldRef.current = false;
        return;
      }

      const dir = direction();
      if (!dir) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // Read seated from zustand (sync) — don't wait on a React re-render after standSelf
      if (seatedInStore()) {
        if (!stoodThisHoldRef.current) {
          stoodThisHoldRef.current = true;
          onStandSelfRef.current?.(selfId);
        }
        // standSelf updates the store synchronously; if still seated, wait next frame
        if (seatedInStore()) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
      }

      if (now - lastSteerAtRef.current >= STEER_INTERVAL_MS) {
        lastSteerAtRef.current = now;
        onClearClickMarkerRef.current?.();
        useOutpostMovementStore.getState().clearPendingSit();
        const goal = useOutpostMovementStore
          .getState()
          .steer(selfId, dir.x, dir.y);
        if (
          goal &&
          sendMoveRef.current &&
          now - lastNetAtRef.current >= NET_SYNC_INTERVAL_MS
        ) {
          lastNetAtRef.current = now;
          sendMoveRef.current(goal.x, goal.y);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    const ensureLoop = () => {
      if (rafRef.current) return;
      lastSteerAtRef.current = 0;
      rafRef.current = requestAnimationFrame(tick);
    };

    const clearKeys = () => {
      pressedRef.current.clear();
      stoodThisHoldRef.current = false;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!KEY_DIR[event.code]) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      event.preventDefault();
      pressedRef.current.add(event.code);
      ensureLoop();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!KEY_DIR[event.code]) return;
      pressedRef.current.delete(event.code);
      if (pressedRef.current.size === 0) {
        stoodThisHoldRef.current = false;
      } else {
        // Opposite key released → remaining key must keep driving the loop
        ensureLoop();
      }
    };

    const onBlur = () => clearKeys();
    const onVisibility = () => {
      if (document.hidden) clearKeys();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      clearKeys();
    };
  }, [enabled, selfId]);
}
