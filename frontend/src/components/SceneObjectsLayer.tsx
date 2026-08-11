import { useSyncExternalStore } from 'react';

import { ASSETS } from '@/config/assets';
import {
  isInteractiveSceneObject,
  type SceneObjectType,
} from '@/data/outpostSceneObjects';
import { useStationMissionStore } from '@/store/stationMissionStore';
import {
  getSceneObjects,
  getSceneObjectsVersion,
  subscribeSceneObjects,
} from '@/utils/sceneObjectsRuntime';

function assetForType(type: SceneObjectType): string {
  if (type === 'terminal') return ASSETS.locations.terminal;
  return ASSETS.locations.brig;
}

interface SceneObjectsLayerProps {
  /** When true, game props receive clicks (standing outpost only). */
  interactive?: boolean;
}

/** Placed props (brig, terminal, …) on the outpost — under characters, over background. */
export function SceneObjectsLayer({ interactive = false }: SceneObjectsLayerProps) {
  useSyncExternalStore(
    subscribeSceneObjects,
    getSceneObjectsVersion,
    getSceneObjectsVersion,
  );
  const objects = getSceneObjects();
  const completedIds = useStationMissionStore((s) => s.completedIds);
  const openStation = useStationMissionStore((s) => s.open);

  if (objects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {objects.map((o) => {
        const canUse =
          interactive &&
          isInteractiveSceneObject(o.type) &&
          !completedIds[o.id];
        const done =
          isInteractiveSceneObject(o.type) && Boolean(completedIds[o.id]);

        return (
          <div
            key={o.id}
            className="absolute"
            style={{
              left: `${o.x}%`,
              top: `${o.y}%`,
              width: `${o.w}%`,
              height: `${o.h}%`,
            }}
          >
            <img
              src={assetForType(o.type)}
              alt=""
              draggable={false}
              className={`h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)] ${
                done ? 'opacity-55 grayscale' : ''
              }`}
            />
            {canUse && (
              <button
                type="button"
                className="pointer-events-auto absolute inset-0 rounded-sm border border-emerald-400/0 bg-transparent hover:border-emerald-300/50 hover:bg-emerald-400/10 focus:outline-none focus-visible:border-emerald-300/70"
                aria-label="Терминал связи"
                title="Терминал связи"
                onClick={(e) => {
                  e.stopPropagation();
                  openStation(o.id);
                }}
              />
            )}
            {done && (
              <span className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded bg-emerald-500/90 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-black">
                OK
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
