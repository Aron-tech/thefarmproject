/** A position on the farm grid. `x` grows towards East, `y` grows towards North. */
export interface GridPos {
  x: number;
  y: number;
}

export const DIRECTIONS = ['North', 'East', 'South', 'West'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export const ENTITY_TYPES = ['Grass', 'Bush', 'Carrot'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const GROUND_TYPES = ['Grassland', 'Soil'] as const;
export type GroundType = (typeof GROUND_TYPES)[number];

export const ITEM_TYPES = ['Hay', 'Wood', 'Carrot'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export type Inventory = Record<ItemType, number>;

/** A growing entity on a cell. Growth is derived from the game clock, so no per-tick update is needed. */
export interface Plant {
  type: EntityType;
  plantedAt: number;
  growTicks: number;
}

export interface Cell {
  ground: GroundType;
  entity: Plant | null;
}

export interface DroneState {
  pos: GridPos;
}

export interface GameState {
  worldSize: number;
  /** Row-major cells: index = y * worldSize + x. */
  cells: Cell[];
  drone: DroneState;
  inventory: Inventory;
  /** Game clock in ticks (one interpreter operation = one tick). */
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
  | { kind: 'numItems'; item: ItemType };

export type DroneActionKind = DroneAction['kind'];

/** Structured-cloneable result of a drone action; enum members are sent as their name. */
export type ActionResult = boolean | number | string | null;
