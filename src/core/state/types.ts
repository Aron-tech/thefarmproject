/** A position on the farm grid. `x` grows towards East, `y` grows towards North. */
export interface GridPos {
  x: number;
  y: number;
}

/** Directions on a layer; Up and Down move between the farm and the mine layers below it. */
export const DIRECTIONS = ['North', 'East', 'South', 'West', 'Up', 'Down'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const PLANAR_DIRECTIONS = ['North', 'East', 'South', 'West'] as const;
export type PlanarDirection = (typeof PLANAR_DIRECTIONS)[number];

export const ENTITY_TYPES = ['Grass', 'Bush', 'Carrot', 'Sunflower', 'Rice', 'Mushroom'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Surface ground. Clay grows rice; a Shaft is a hole dug down into the mine. */
export const GROUND_TYPES = ['Grassland', 'Soil', 'Clay', 'Shaft'] as const;
export type GroundType = (typeof GROUND_TYPES)[number];

export const ITEM_TYPES = [
  'Hay',
  'Wood',
  'Carrot',
  'Power',
  'Rice',
  'Stone',
  'Clay',
  'Coal',
  'Iron',
  'Quartz',
  'Gold',
  'Mushroom',
  'Dynamite',
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Inventory = Record<ItemType, number>;

/** Upgrades bought in the unlock tree. Locked language features and functions raise an error when used. */
export const UNLOCK_IDS = [
  'Loops',
  'Speed',
  'Expand',
  'Senses',
  'Plant',
  'Operators',
  'Debug',
  'Variables',
  'Carrots',
  'Functions',
  'Lists',
  'Sunflowers',
  'Mining',
  'Depth',
  'Drill',
  'Scanner',
  'Coal',
  'Rice',
  'Mushrooms',
  'Dynamite',
] as const;
export type UnlockId = (typeof UNLOCK_IDS)[number];

/** Level of every unlock; 0 means locked. */
export type UnlockLevels = Record<UnlockId, number>;

/** A growing entity on a cell. Growth is derived from the game clock, so no per-tick update is needed. */
export interface Plant {
  type: EntityType;
  plantedAt: number;
  growTicks: number;
  /** Number of petals (sunflowers only), read with measure(). */
  petals?: number;
  /** Colour index (mushrooms only), read with measure(). */
  color?: number;
}

export interface Cell {
  ground: GroundType;
  entity: Plant | null;
}

/** Blocks of the mine layers. Air is dug out; Rubble is what is left of a damaged ruin. */
export const BLOCK_TYPES = ['Air', 'Dirt', 'Stone', 'Clay', 'Coal', 'Iron', 'Quartz', 'Ruin', 'Rubble'] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** One block of a mine layer. */
export interface MineCell {
  block: BlockType;
  /** Drill hits the block has taken so far. */
  damage: number;
  /** A mushroom growing in a dug-out cell. */
  entity: Plant | null;
  /** A hidden mine (minefield layers); looks like stone. */
  mine?: boolean;
  /** Id of the ruin a Ruin block belongs to. */
  ruin?: number;
}

/** The layers below the farm. Layer `depth` (1-based) holds cells (depth - 1) * size² + y * size + x. */
export interface MineState {
  layers: number;
  cells: MineCell[];
}

export interface DroneState {
  pos: GridPos;
  /** 0 on the farm, 1..layers in the mine. */
  depth: number;
}

export interface GameState {
  worldSize: number;
  /** Row-major cells: index = y * worldSize + x. */
  cells: Cell[];
  /** The mine below the farm; null until Mining is unlocked. */
  mine: MineState | null;
  drone: DroneState;
  inventory: Inventory;
  unlocks: UnlockLevels;
  /** Drone actions left on the unit of power already consumed; the drone runs faster while this or Power is above 0. */
  poweredActions: number;
  /** Game clock in ticks; advances with real time at GAME_TICKS_PER_SECOND, independent of drone speed. */
  tick: number;
  /** Seeded PRNG state, kept in the game state so runs and saves are reproducible. */
  rngState: number;
}

/** Actions the drone can perform; each one is requested by the interpreter and applied by the game loop. */
export type DroneAction =
  | { kind: 'move'; direction: Direction }
  | { kind: 'harvest' }
  | { kind: 'canHarvest' }
  | { kind: 'plant'; entity: EntityType }
  | { kind: 'till' }
  | { kind: 'clear' }
  | { kind: 'doAFlip' }
  | { kind: 'getEntityType' }
  | { kind: 'getGroundType' }
  | { kind: 'getPosX' }
  | { kind: 'getPosY' }
  | { kind: 'getWorldSize' }
  | { kind: 'measure' }
  | { kind: 'numItems'; item: ItemType }
  | { kind: 'dig'; direction: Direction }
  | { kind: 'swap'; direction: Direction }
  | { kind: 'useItem'; item: ItemType }
  | { kind: 'defuse'; direction: Direction }
  | { kind: 'getBlockType'; direction: Direction }
  | { kind: 'getDepth' }
  | { kind: 'getMaxDepth' };

export type DroneActionKind = DroneAction['kind'];

/** Structured-cloneable result of a drone action; enum members are sent as their name. */
export type ActionResult = boolean | number | string | null;
