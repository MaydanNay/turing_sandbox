import { useEffect, useRef, useState, type ReactNode } from 'react';

import {
  getCoverFrameSize,
  OUTPOST_SCENE_ASPECT,
} from '@/utils/sceneCover';

interface SceneCoverFrameProps {
  children: ReactNode;
  /** width / height; defaults to outpost 16:9 */
  aspect?: number;
  className?: string;
}

/**
 * Viewport-filling shell with an inner cover-sized frame matching image aspect.
 * Scene % coords stay aligned with the background art (no object-cover drift).
 */
export function SceneCoverFrame({
  children,
  aspect = OUTPOST_SCENE_ASPECT,
  className = '',
}: SceneCoverFrameProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize(getCoverFrameSize(rect.width, rect.height, aspect));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  return (
    <div
      ref={shellRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <div
        className="pointer-events-auto absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: size.width || '100%',
          height: size.height || '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
