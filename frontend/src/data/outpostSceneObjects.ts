/**
 * Placed scene props on the outpost (%, top-left origin).
 * Placements: outpostSceneObjects.json — edit via /scene-editor → Сохранить.
 * Catalog (SCENE_OBJECT_DEFS) stays in this file.
 */
import raw from '@/data/outpostSceneObjects.json';

export type SceneObjectType = 'brig';

export interface SceneObjectPlacement {
  id: string;
  type: SceneObjectType;
  /** Top-left X in scene % */
  x: number;
  /** Top-left Y in scene % */
  y: number;
  /** Width in scene % */
  w: number;
  /** Height in scene % */
  h: number;
}

export interface SceneObjectDef {
  type: SceneObjectType;
  label: string;
  /** Default size when spawned */
  defaultW: number;
  defaultH: number;
}

export const SCENE_OBJECT_DEFS: SceneObjectDef[] = [
  { type: 'brig', label: 'Карцер', defaultW: 16, defaultH: 28 },
];

export const OUTPOST_SCENE_OBJECTS: SceneObjectPlacement[] =
  raw as SceneObjectPlacement[];
