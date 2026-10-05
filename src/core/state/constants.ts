import type { DroneActionKind, EntityType, GroundType, ItemType } from './types.ts';

export const DEFAULT_WORLD_SIZE = 3;
export const DEFAULT_RNG_SEED = 0x5eed;

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
};

/** Growth time varies randomly within ±GROWTH_VARIANCE of the base value. */
export const GROWTH_VARIANCE = 0.2;

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
};
