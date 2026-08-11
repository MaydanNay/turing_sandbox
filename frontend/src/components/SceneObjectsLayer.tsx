import { useSyncExternalStore } from 'react';

import { ASSETS } from '@/config/assets';
import type { SceneObjectType } from '@/data/outpostSceneObjects';
import {
  getSceneObjects,
  getSceneObjectsVersion,
  subscribeSceneObjects,
} from '@/utils/sceneObjectsRuntime';

function assetForType(type: SceneObjectType): string {
  if (type === 'brig') return ASSETS.locations.brig;
  return ASSETS.locations.brig;
}

/** Placed props (brig, …) on the outpost — under characters, over background. */
export function SceneObjectsLayer() {
  useSyncExternalStore(
    subscribeSceneObjects,
    getSceneObjectsVersion,
    getSceneObjectsVersion,
  );
  const objects = getSceneObjects();

  if (objects.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[2]">
      {objects.map((o) => (
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
            className="h-full w-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,0.55)]"
          />
        </div>
      ))}
    </div>
  );
}
