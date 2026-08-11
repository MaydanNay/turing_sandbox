/**
 * Placed scene props on the outpost (%, top-left origin).
 * Placements: outpostSceneObjects.json — edit via /scene-editor → Сохранить.
 * Catalog (SCENE_OBJECT_DEFS) stays in this file.
 */
import raw from '@/data/outpostSceneObjects.json';

export type SceneObjectType = 'brig' | 'terminal';

export type SceneObjectCategory = 'extra' | 'game';

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
  /** Дополнительные (декор локации) или игровые (механика) */
  category: SceneObjectCategory;
  /** Default size when spawned */
  defaultW: number;
  defaultH: number;
}

export const SCENE_OBJECT_DEFS: SceneObjectDef[] = [
  {
    type: 'brig',
    label: 'Карцер',
    category: 'extra',
    defaultW: 16,
    defaultH: 28,
  },
  {
    type: 'terminal',
    label: 'Терминал связи',
    category: 'game',
    defaultW: 10,
    defaultH: 14,
  },
];

export function sceneObjectDefsByCategory(
  category: SceneObjectCategory,
): SceneObjectDef[] {
  return SCENE_OBJECT_DEFS.filter((d) => d.category === category);
}

export function sceneObjectCategory(
  type: SceneObjectType,
): SceneObjectCategory {
  return SCENE_OBJECT_DEFS.find((d) => d.type === type)?.category ?? 'extra';
}

export function isInteractiveSceneObject(type: SceneObjectType): boolean {
  return sceneObjectCategory(type) === 'game';
}

export const OUTPOST_SCENE_OBJECTS: SceneObjectPlacement[] =
  raw as SceneObjectPlacement[];
