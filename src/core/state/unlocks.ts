import { BASE_OPS_PER_SECOND, POWER_SPEED_MULTIPLIER, SPEED_LEVEL_MULTIPLIERS } from './constants.ts';
import { createPlant } from './crops.ts';
import { UNLOCK_IDS, type Cell, type GameState, type Inventory, type ItemType, type UnlockId, type UnlockLevels } from './types.ts';

export type ItemCost = Partial<Record<ItemType, number>>;

export interface UnlockDef {
  /** Unlocks that must be bought (level ≥ 1) before this one shows up. */
  parents: readonly UnlockId[];
  /** Cost of each level: costs[0] buys level 1. Its length is the maximum level. */
  costs: readonly ItemCost[];
  /** Column / row of the node in the unlock tree window. */
  treePos: { col: number; row: number };
  description: string;
}

/** World size per Expand level (index = level). */
export const EXPAND_WORLD_SIZES: readonly number[] = [1, 3, 4, 5, 6, 8];

export const UNLOCK_DEFS: Record<UnlockId, UnlockDef> = {
  Loops: {
    parents: [],
    costs: [{ Hay: 5 }],
    treePos: { col: 0, row: 1 },
    description: 'Unlocks while and for loops, break, continue and range().',
  },
  Speed: {
    parents: ['Loops'],
    costs: [{ Hay: 20 }, { Hay: 50, Wood: 10 }, { Wood: 50 }, { Wood: 100, Carrot: 30 }, { Carrot: 300 }],
    treePos: { col: 1, row: 0 },
    description: 'Makes the drone faster.',
  },
  Expand: {
    parents: ['Loops'],
    costs: [{ Hay: 30 }, { Hay: 100, Wood: 20 }, { Wood: 100 }, { Wood: 200, Carrot: 50 }, { Carrot: 300 }],
    treePos: { col: 1, row: 1 },
    description: 'Expands the farm and unlocks move().',
  },
  Senses: {
    parents: ['Loops'],
    costs: [{ Hay: 50 }],
    treePos: { col: 1, row: 2 },
    description: 'Unlocks can_harvest(), get_entity_type(), get_ground_type(), get_pos_x(), get_pos_y(), get_world_size() and num_items().',
  },
  Plant: {
    parents: ['Expand'],
    costs: [{ Hay: 40 }],
    treePos: { col: 2, row: 1 },
    description: 'Unlocks plant() and bushes, which give wood.',
  },
  Operators: {
    parents: ['Senses'],
    costs: [{ Hay: 100 }],
    treePos: { col: 2, row: 2 },
    description: 'Unlocks arithmetic, comparison and logic operators.',
  },
  Debug: {
    parents: ['Senses'],
    costs: [{ Hay: 60 }],
    treePos: { col: 2, row: 3 },
    description: 'Unlocks print(), quick_print() and get_tick_count().',
  },
  Variables: {
    parents: ['Operators'],
    costs: [{ Hay: 150, Wood: 20 }],
    treePos: { col: 3, row: 2 },
    description: 'Unlocks assigning values to variables.',
  },
  Carrots: {
    parents: ['Plant'],
    costs: [{ Wood: 50 }],
    treePos: { col: 3, row: 1 },
    description: 'Unlocks carrots and till(). Carrots grow on soil.',
  },
  Functions: {
    parents: ['Variables'],
    costs: [{ Wood: 100 }],
    treePos: { col: 4, row: 2 },
    description: 'Unlocks def, return, lambda and import, to use code from your other files.',
  },
  Lists: {
    parents: ['Variables'],
    costs: [{ Wood: 150 }],
    treePos: { col: 4, row: 3 },
    description: 'Unlocks lists, tuples, dicts, sets and their functions.',
  },
  Sunflowers: {
    parents: ['Carrots'],
    costs: [{ Carrot: 50 }],
    treePos: { col: 4, row: 1 },
    description: 'Unlocks sunflowers and measure(). Harvesting sunflowers gives power, which makes the drone faster.',
  },
};

export function createLockedUnlocks(): UnlockLevels {
  const unlocks = {} as UnlockLevels;
  for (const id of UNLOCK_IDS) unlocks[id] = 0;
  return unlocks;
}

/** Every unlock at its maximum level (tests, tooling). */
export function createFullUnlocks(): UnlockLevels {
  const unlocks = {} as UnlockLevels;
  for (const id of UNLOCK_IDS) unlocks[id] = maxUnlockLevel(id);
  return unlocks;
}

export function maxUnlockLevel(id: UnlockId): number {
  return UNLOCK_DEFS[id].costs.length;
}

export function isUnlocked(unlocks: UnlockLevels, id: UnlockId): boolean {
  return unlocks[id] > 0;
}

/** An unlock is shown in the tree once all of its parents are bought. */
export function isUnlockVisible(unlocks: UnlockLevels, id: UnlockId): boolean {
  return UNLOCK_DEFS[id].parents.every((parent) => isUnlocked(unlocks, parent));
}

/** Cost of the next level, or null when the unlock is maxed out. */
export function nextUnlockCost(unlocks: UnlockLevels, id: UnlockId): ItemCost | null {
  return UNLOCK_DEFS[id].costs[unlocks[id]] ?? null;
}

export function canAfford(inventory: Inventory, cost: ItemCost): boolean {
  return (Object.entries(cost) as [ItemType, number][]).every(([item, amount]) => inventory[item] >= amount);
}

export function canBuyUnlock(state: GameState, id: UnlockId): boolean {
  const cost = nextUnlockCost(state.unlocks, id);
  return cost !== null && isUnlockVisible(state.unlocks, id) && canAfford(state.inventory, cost);
}

/** Buys the next level of an unlock. Pure; returns null when it cannot be bought. */
export function buyUnlock(state: GameState, id: UnlockId): GameState | null {
  if (!canBuyUnlock(state, id)) return null;
  const cost = nextUnlockCost(state.unlocks, id)!;
  const inventory = { ...state.inventory };
  for (const [item, amount] of Object.entries(cost) as [ItemType, number][]) inventory[item] -= amount;
  const unlocks = { ...state.unlocks, [id]: state.unlocks[id] + 1 };
  const bought: GameState = { ...state, inventory, unlocks };
  return id === 'Expand' ? resizeWorld(bought, EXPAND_WORLD_SIZES[unlocks.Expand] ?? state.worldSize) : bought;
}

/** Grows the farm, keeping existing cells at their coordinates; new cells start as grassland with grass. */
export function resizeWorld(state: GameState, worldSize: number): GameState {
  if (worldSize === state.worldSize) return state;
  const cells: Cell[] = [];
  let rngState = state.rngState;
  for (let y = 0; y < worldSize; y++) {
    for (let x = 0; x < worldSize; x++) {
      const existing = x < state.worldSize && y < state.worldSize ? state.cells[y * state.worldSize + x] : undefined;
      if (existing) {
        cells.push(existing);
        continue;
      }
      const [grass, nextRng] = createPlant('Grass', state.tick, rngState);
      rngState = nextRng;
      cells.push({ ground: 'Grassland', entity: grass });
    }
  }
  const pos = { x: Math.min(state.drone.pos.x, worldSize - 1), y: Math.min(state.drone.pos.y, worldSize - 1) };
  return { ...state, worldSize, cells, rngState, drone: { ...state.drone, pos } };
}

export function hasPower(state: GameState): boolean {
  return state.inventory.Power > 0 || state.poweredActions > 0;
}

/** Drone execution speed from the Speed unlock level and power. */
export function getOpsPerSecond(state: GameState): number {
  const level = Math.min(state.unlocks.Speed, SPEED_LEVEL_MULTIPLIERS.length - 1);
  const multiplier = SPEED_LEVEL_MULTIPLIERS[level]! * (hasPower(state) ? POWER_SPEED_MULTIPLIER : 1);
  return BASE_OPS_PER_SECOND * multiplier;
}
