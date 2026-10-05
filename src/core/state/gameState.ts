import { DEFAULT_RNG_SEED, DEFAULT_WORLD_SIZE } from './constants.ts';
import { createPlant } from './crops.ts';
import { ITEM_TYPES, type Cell, type GameState, type Inventory } from './types.ts';

export function createEmptyInventory(): Inventory {
  const inventory = {} as Inventory;
  for (const item of ITEM_TYPES) inventory[item] = 0;
  return inventory;
}

/** Builds a fresh grassland grid; every cell starts with newly planted grass. */
export function createGrid(worldSize: number, tick: number, rngState: number): [Cell[], number] {
  const cells: Cell[] = [];
  let rng = rngState;
  for (let i = 0; i < worldSize * worldSize; i++) {
    const [grass, nextRng] = createPlant('Grass', tick, rng);
    rng = nextRng;
    cells.push({ ground: 'Grassland', entity: grass });
  }
  return [cells, rng];
}

export function createGameState(worldSize = DEFAULT_WORLD_SIZE, seed = DEFAULT_RNG_SEED): GameState {
  const [cells, rngState] = createGrid(worldSize, 0, seed);
  return {
    worldSize,
    cells,
    drone: { pos: { x: 0, y: 0 } },
    inventory: createEmptyInventory(),
    tick: 0,
    rngState,
  };
}
