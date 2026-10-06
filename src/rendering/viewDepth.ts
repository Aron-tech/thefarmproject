import { MathUtils, type Material } from 'three';
import type { GameLoop } from '../game/GameLoop.ts';
import type { GameStore } from '../game/gameStore.ts';

const FADE_LAMBDA = 8;

/** The depth the view focuses on: the one picked in the depth control, or the drone's. */
export function getFocusDepth(store: GameStore, loop: GameLoop): number {
  const state = loop.getState();
  const layers = state.mine?.layers ?? 0;
  return Math.min(store.getState().viewDepth ?? state.drone.depth, layers);
}

/** Opacity of things at `depth` (0 = the farm) when the view focuses on `focus`: layers above it fade out. */
export function layerOpacity(depth: number, focus: number): number {
  return depth < focus ? 0.07 : 1;
}

/**
 * Eases a material's opacity towards `target`; transparency (and depth writes) switch with it so
 * opaque layers render normally. Returns the new opacity.
 */
export function fadeMaterial(material: Material, current: number, target: number, delta: number): number {
  if (Math.abs(current - target) < 0.002) return current;
  const next = MathUtils.damp(current, target, FADE_LAMBDA, delta);
  const faded = next < 0.99;
  if (material.transparent !== faded) material.needsUpdate = true;
  material.opacity = next;
  material.transparent = faded;
  material.depthWrite = !faded;
  return next;
}
