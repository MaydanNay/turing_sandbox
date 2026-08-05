import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useSpring,
  useTransform,
  type PanInfo,
} from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { PlayerHandCard } from '@/types/card';

import { CardBackFace, CardFrontFace } from './CardFaces';

const TILT_RANGE = 20;
const AUTO_ROTATE_SPEED = 0.3;
const PAN_SENSITIVITY = 0.5;

export interface InspectCardAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

interface InspectCardOverlayProps {
  card: PlayerHandCard;
  onClose: () => void;
  /** z-index слоя поверх приватного чата и HUD */
  zClass?: string;
  /** Кнопки под картой (например, подтверждение раскрытия) */
  actions?: InspectCardAction[];
  /** Начать с лицевой стороны, даже если карта ещё не раскрыта */
  startOnFront?: boolean;
}

export function InspectCardOverlay({
  card,
  onClose,
  zClass = 'z-50',
  actions,
  startOnFront = false,
}: InspectCardOverlayProps) {
  const cardSurfaceRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const [isDragging, setIsDragging] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Базовое непрерывное вращение (накопительное, 360°+)
  const baseRotateY = useMotionValue(startOnFront || card.isRevealed ? 0 : 180);
  // Наклон от курсора — spring для плавного tilt и сброса
  const tiltX = useSpring(0, { damping: 20, stiffness: 100 });
  const tiltY = useSpring(0, { damping: 20, stiffness: 100 });

  // Итог: наклон по X + базовое вращение + hover-tilt по Y
  const rotateX = tiltX;
  const rotateY = useTransform([baseRotateY, tiltY], ([base, tilt]) => {
    return (base as number) + (tilt as number);
  });

  // Idle: медленное авто-вращение, пока игрок не тянет карту
  useAnimationFrame(() => {
    if (!isDraggingRef.current) {
      baseRotateY.set(baseRotateY.get() + AUTO_ROTATE_SPEED);
    }
  });

  const applyHoverTilt = useCallback(
    (clientX: number, clientY: number) => {
      const rect = cardSurfaceRef.current?.getBoundingClientRect();
      if (!rect) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const normX = (clientX - centerX) / (rect.width / 2);
      const normY = (clientY - centerY) / (rect.height / 2);

      tiltX.set(Math.max(-1, Math.min(1, normY)) * -TILT_RANGE);
      tiltY.set(Math.max(-1, Math.min(1, normX)) * TILT_RANGE);
    },
    [tiltX, tiltY],
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) return;
      setIsHovering(true);
      applyHoverTilt(event.clientX, event.clientY);
    },
    [applyHoverTilt],
  );

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    tiltX.set(0);
    tiltY.set(0);
  }, [tiltX, tiltY]);

  const handlePanStart = useCallback(() => {
    isDraggingRef.current = true;
    setIsDragging(true);
    setIsHovering(false);
    tiltX.set(0);
    tiltY.set(0);
  }, [tiltX, tiltY]);

  const handlePan = useCallback(
    (_event: PointerEvent, info: PanInfo) => {
      baseRotateY.set(baseRotateY.get() + info.delta.x * PAN_SENSITIVITY);
    },
    [baseRotateY],
  );

  const handlePanEnd = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  return createPortal(
    <motion.div
      className={`fixed inset-0 ${zClass} flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm px-4`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={actions ? undefined : onClose}
      role="presentation"
    >
      {/* layoutId — только полёт из руки; без animate, чтобы не конфликтовать */}
      <motion.div
        layoutId={card.id}
        className="pointer-events-auto relative h-[360px] w-[240px]"
        style={{ perspective: 1000 }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {/* Wrapper: «дыхание» по Y */}
        <motion.div
          className="h-full w-full"
          animate={{ y: [-15, 15, -15] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        >
          {/* Card 3D Container: вращение + tilt + pan */}
          <motion.div
            ref={cardSurfaceRef}
            className={`relative h-full w-full touch-none ${isDragging ? 'cursor-grabbing' : isHovering ? 'cursor-grab' : 'cursor-grab'}`}
            style={{
              rotateX,
              rotateY,
              transformStyle: 'preserve-3d',
            }}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onPanStart={handlePanStart}
            onPan={handlePan}
            onPanEnd={handlePanEnd}
          >
            {/* Лицевая сторона */}
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <CardFrontFace card={card} size="inspect" />
            </div>

            {/* Рубашка */}
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              <CardBackFace size="inspect" />
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {actions && actions.length > 0 && (
        <div className="pointer-events-auto mt-8 flex flex-wrap items-center justify-center gap-3">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={
                action.variant === 'primary'
                  ? 'rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100'
                  : 'rounded-full border border-white/30 bg-white/10 px-6 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20'
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </motion.div>,
    document.body,
  );
}
