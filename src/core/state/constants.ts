import type { BlockType, DroneActionKind, EntityType, GroundType, ItemType } from './types.ts';

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
  dig: ACTION_OPS_COST,
  swap: ACTION_OPS_COST,
  useItem: ACTION_OPS_COST,
  defuse: ACTION_OPS_COST,
  getBlockType: QUERY_OPS_COST,
  getDepth: QUERY_OPS_COST,
  getMaxDepth: QUERY_OPS_COST,
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
  /** Grows in dug-out mine cells instead of on the farm. */
  underground?: boolean;
}

export const CROP_DEFS: Record<EntityType, CropDef> = {
  Grass: {
    // Faster than an un-upgraded drone acts, so the first program, `while True: harvest()`, always gets hay.
    baseGrowTicks: 500,
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
  Rice: {
    baseGrowTicks: 7000,
    harvestYield: { Rice: 1 },
    plantCost: { Hay: 2 },
    allowedGrounds: ['Clay'],
  },
  Mushroom: {
    baseGrowTicks: 4000,
    harvestYield: { Mushroom: 1 },
    plantCost: { Mushroom: 1 },
    allowedGrounds: [],
    underground: true,
  },
};

/** Mushrooms come in this many colours (0 .. MUSHROOM_COLORS - 1). */
export const MUSHROOM_COLORS = 10;

export interface BlockDef {
  /** Drill hits needed without Drill upgrades. */
  hardness: number;
  /** Items gained when the block breaks. */
  dropYield: Partial<Record<ItemType, number>>;
}

export const BLOCK_DEFS: Record<BlockType, BlockDef> = {
  Air: { hardness: 0, dropYield: {} },
  Dirt: { hardness: 1, dropYield: {} },
  Clay: { hardness: 1, dropYield: { Clay: 1 } },
  Stone: { hardness: 2, dropYield: { Stone: 1 } },
  Coal: { hardness: 2, dropYield: { Coal: 1 } },
  Iron: { hardness: 3, dropYield: { Iron: 1 } },
  Quartz: { hardness: 4, dropYield: { Quartz: 1 } },
  Ruin: { hardness: 1, dropYield: {} },
  Rubble: { hardness: 1, dropYield: { Stone: 1 } },
};

/** How a mine layer is generated. */
export interface MineLayerDef {
  /** Relative chance of each solid block. */
  weights: Partial<Record<BlockType, number>>;
  /** Fraction of cells that start as dug-out caves with mushrooms. */
  caves?: number;
  /** Fraction of cells hiding a mine (minefield layer). */
  mines?: number;
  /** The layer holds ruins. */
  ruins?: boolean;
}

/** Layer definitions from the top (index = depth - 1). */
export const MINE_LAYER_DEFS: readonly MineLayerDef[] = [
  { weights: { Dirt: 70, Clay: 20, Coal: 10 } },
  { weights: { Dirt: 35, Stone: 30, Clay: 15, Coal: 20 } },
  { weights: { Stone: 55, Coal: 20, Iron: 25 }, caves: 0.3 },
  { weights: { Stone: 70, Quartz: 15, Iron: 15 }, mines: 0.16 },
  { weights: { Stone: 60, Iron: 20, Quartz: 20 }, ruins: true },
  { weights: { Stone: 55, Iron: 20, Quartz: 25 }, ruins: true },
  { weights: { Stone: 50, Iron: 25, Quartz: 25 }, caves: 0.15, ruins: true },
  { weights: { Stone: 45, Iron: 25, Quartz: 30 }, mines: 0.12, ruins: true },
];

/** Ruins hold between these many blocks. */
export const RUIN_MIN_SIZE = 3;
export const RUIN_MAX_SIZE = 6;
/** One ruin per this many cells of a ruin layer (at least one). */
export const CELLS_PER_RUIN = 16;
/** Gold for an excavated ruin: size² × this. */
export const RUIN_GOLD_PER_BLOCK = 2;

/** Power gained by burning one coal with use_item(Items.Coal). */
export const COAL_POWER = 3;
/** Fraction of the normal drop a block blown up by dynamite gives. */
export const DYNAMITE_YIELD_FRACTION = 0.5;
/** Fraction of the carried dynamite lost when the drone digs into a mine. */
export const EXPLOSION_DYNAMITE_LOSS = 0.5;
