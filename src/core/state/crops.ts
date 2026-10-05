import { CROP_DEFS, GROWTH_VARIANCE } from './constants.ts';
import { nextRandom } from './random.ts';
import type { EntityType, Plant } from './types.ts';

/** Creates a plant with a randomised growth time; returns the advanced PRNG state alongside it. */
export function createPlant(type: EntityType, tick: number, rngState: number): [Plant, number] {
  const [roll, nextState] = nextRandom(rngState);
  const variance = 1 - GROWTH_VARIANCE + roll * 2 * GROWTH_VARIANCE;
  const growTicks = Math.round(CROP_DEFS[type].baseGrowTicks * variance);
  return [{ type, plantedAt: tick, growTicks }, nextState];
}

/** Growth progress in [0, 1]. */
export function getGrowthProgress(plant: Plant, tick: number): number {
  if (plant.growTicks <= 0) return 1;
  return Math.min(1, Math.max(0, (tick - plant.plantedAt) / plant.growTicks));
}

export function isFullyGrown(plant: Plant, tick: number): boolean {
  return tick - plant.plantedAt >= plant.growTicks;
}
