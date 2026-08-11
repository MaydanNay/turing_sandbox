import { useSyncExternalStore } from 'react';

import { OutpostEditorStage } from '@/components/OutpostEditorStage';
import { SceneCoverFrame } from '@/components/SceneCoverFrame';
import { SceneObjectsLayer } from '@/components/SceneObjectsLayer';
import { WalkEditorOverlay } from '@/components/WalkEditorOverlay';
import { ASSETS } from '@/config/assets';
import {
  getEditorShowPlayers,
  getEditorUiVersion,
  subscribeEditorUi,
} from '@/utils/sceneEditorRuntime';

/** Standalone DEV scene editor — no match/HUD/WS gameplay. */
export function SceneEditorPage() {
  useSyncExternalStore(subscribeEditorUi, getEditorUiVersion, getEditorUiVersion);
  const showPlayers = getEditorShowPlayers();

  if (!import.meta.env.DEV) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-4 font-mono text-sm text-neutral-400">
        Редактор сцены доступен только в DEV.
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-black text-neutral-100">
      <SceneCoverFrame>
        <div className="absolute inset-0 overflow-visible">
          <img
            src={ASSETS.locations.outpost}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full"
            draggable={false}
          />
          <SceneObjectsLayer />
          <OutpostEditorStage showPlayers={showPlayers} />
          <WalkEditorOverlay />
        </div>
      </SceneCoverFrame>
    </div>
  );
}
