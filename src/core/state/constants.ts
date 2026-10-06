import type { DroneActionKind, EntityType, GroundType, ItemType } from './types.ts';

/** A new farm is a single tile; the Expand unlock grows it. */
export const DEFAULT_WORLD_SIZE = 1;
export const DEFAULT_RNG_SEED = 0x5eed;

/** Game time passes at this rate in real time, whatever the drone's speed; growth times are in these ticks. */
export const GAME_TICKS_PER_SECOND = 1000;

/** Interpreter operations per second of an un-upgraded drone (one drone action per second). */
export const BASE_OPS_PER_SECOND = 200;
/** Drone speed multiplier per Speed unlock level (index = level). */
export const SPEED_LEVEL_MULTIPLIERS: readonly number[] = [1, 1.5, 2, 3, 4, 6];
/** The drone runs this much faster while it has power. */
export const POWER_SPEED_MULTIPLIER = 2;
/** Drone actions one unit of power lasts. */
export const ACTIONS_PER_POWER = 30;

/** Tick cost of drone actions that physically do something. */
export const ACTION_OPS_COST = 200;
/** Tick cost of sensing / querying actions. */
export const QUERY_OPS_COST = 1;

export const ACTION_COSTS: Record<DroneActionKind, number> = {
  move: ACTION_OPS_COST,
  harvest: ACTION_OPS_COST,
  plant: ACTION_OPS_COST,
  till: ACTION_OPS_COST,
  clear: ACTION_OPS_COST,
  doAFlip: ACTION_OPS_COST,
  canHarvest: QUERY_OPS_COST,
  getEntityType: QUERY_OPS_COST,
  getGroundType: QUERY_OPS_COST,
  getPosX: QUERY_OPS_COST,
  getPosY: QUERY_OPS_COST,
  getWorldSize: QUERY_OPS_COST,
  numItems: QUERY_OPS_COST,
  measure: QUERY_OPS_COST,
};

/** Growth time varies randomly within ±GROWTH_VARIANCE of the base value. */
export const GROWTH_VARIANCE = 0.2;

export const SUNFLOWER_MIN_PETALS = 7;
export const SUNFLOWER_MAX_PETALS = 15;
/** Harvesting the sunflower with the most petals, with at least this many on the farm, multiplies its power. */
export const SUNFLOWER_BONUS_MIN_COUNT = 10;
export const SUNFLOWER_BONUS_MULTIPLIER = 5;

export interface CropDef {
  baseGrowTicks: number;
  harvestYield: Partial<Record<ItemType, number>>;
  plantCost: Partial<Record<ItemType, number>>;
  allowedGrounds: readonly GroundType[];
}

export const CROP_DEFS: Record<EntityType, CropDef> = {
  Grass: {
    baseGrowTicks: 1000,
    harvestYield: { Hay: 1 },
    plantCost: {},
    allowedGrounds: ['Grassland', 'Soil'],
  },
  Bush: {
    baseGrowTicks: 4000,
    harvestYield: { Wood: 1 },
    plantCost: {},
    allowedGrounds: ['Grassland', 'Soil'],
  },
  Carrot: {
    baseGrowTicks: 6000,
    harvestYield: { Carrot: 1 },
    plantCost: { Hay: 1, Wood: 1 },
    allowedGrounds: ['Soil'],
  },
  Sunflower: {
    baseGrowTicks: 5000,
    harvestYield: { Power: 1 },
    plantCost: { Carrot: 1 },
    allowedGrounds: ['Soil'],
  },
};
