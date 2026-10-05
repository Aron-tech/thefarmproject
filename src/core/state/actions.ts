import { CROP_DEFS } from './constants.ts';
import { createPlant, isFullyGrown } from './crops.ts';
import { createGrid } from './gameState.ts';
import { cellIndex, getCell, stepPos } from './grid.ts';
import type { ActionResult, Cell, DroneAction, EntityType, GameState, Inventory, ItemType } from './types.ts';

export interface ActionOutcome {
  state: GameState;
  result: ActionResult;
}

/**
 * Applies a drone action at the given game tick. Pure: the input state is never mutated,
 * unchanged parts of the state are shared with the returned one.
 */
export function applyAction(previous: GameState, action: DroneAction, tick: number): ActionOutcome {
  const state: GameState = tick === previous.tick ? previous : { ...previous, tick };
  const pos = state.drone.pos;
  const cell = getCell(state.cells, pos, state.worldSize);

  switch (action.kind) {
    case 'move':
      return {
        state: { ...state, drone: { ...state.drone, pos: stepPos(pos, action.direction, state.worldSize) } },
        result: true,
      };
    case 'harvest':
      return harvest(state, cell);
    case 'canHarvest':
      return { state, result: cell.entity !== null && isFullyGrown(cell.entity, tick) };
    case 'plant':
      return plant(state, cell, action.entity);
    case 'till':
      return till(state, cell);
    case 'clear': {
      const [cells, rngState] = createGrid(state.worldSize, tick, state.rngState);
      return { state: { ...state, cells, rngState, drone: { ...state.drone, pos: { x: 0, y: 0 } } }, result: null };
    }
    case 'doAFlip':
      return { state, result: null };
    case 'getEntityType':
      return { state, result: cell.entity?.type ?? null };
    case 'getGroundType':
      return { state, result: cell.ground };
    case 'getPosX':
      return { state, result: pos.x };
    case 'getPosY':
      return { state, result: pos.y };
    case 'getWorldSize':
      return { state, result: state.worldSize };
    case 'numItems':
      return { state, result: state.inventory[action.item] };
  }
}

function withCell(state: GameState, cell: Cell): GameState {
  const cells = state.cells.slice();
  cells[cellIndex(state.drone.pos, state.worldSize)] = cell;
  return { ...state, cells };
}

/** Removes the entity from the drone's cell; grassland immediately regrows grass. */
function clearCell(state: GameState, ground: Cell['ground']): GameState {
  if (ground === 'Grassland') {
    const [grass, rngState] = createPlant('Grass', state.tick, state.rngState);
    return withCell({ ...state, rngState }, { ground, entity: grass });
  }
  return withCell(state, { ground, entity: null });
}

function addItems(inventory: Inventory, items: Partial<Record<ItemType, number>>, sign: 1 | -1): Inventory {
  const next = { ...inventory };
  for (const [item, amount] of Object.entries(items) as [ItemType, number][]) {
    next[item] += sign * amount;
  }
  return next;
}

function canAfford(inventory: Inventory, cost: Partial<Record<ItemType, number>>): boolean {
  return (Object.entries(cost) as [ItemType, number][]).every(([item, amount]) => inventory[item] >= amount);
}

/** Harvests the drone's cell. Unripe entities are destroyed without yield. Returns whether something was removed. */
function harvest(state: GameState, cell: Cell): ActionOutcome {
  if (!cell.entity) return { state, result: false };
  const ripe = isFullyGrown(cell.entity, state.tick);
  const harvested = ripe
    ? { ...state, inventory: addItems(state.inventory, CROP_DEFS[cell.entity.type].harvestYield, 1) }
    : state;
  return { state: clearCell(harvested, cell.ground), result: true };
}

function plant(state: GameState, cell: Cell, entity: EntityType): ActionOutcome {
  const def = CROP_DEFS[entity];
  const occupied = cell.entity !== null && cell.entity.type !== 'Grass';
  if (occupied || !def.allowedGrounds.includes(cell.ground) || !canAfford(state.inventory, def.plantCost)) {
    return { state, result: false };
  }
  const [newPlant, rngState] = createPlant(entity, state.tick, state.rngState);
  const paid = { ...state, rngState, inventory: addItems(state.inventory, def.plantCost, -1) };
  return { state: withCell(paid, { ground: cell.ground, entity: newPlant }), result: true };
}

/** Toggles the ground between grassland and soil, removing whatever grows there. */
function till(state: GameState, cell: Cell): ActionOutcome {
  return { state: clearCell(state, cell.ground === 'Grassland' ? 'Soil' : 'Grassland'), result: null };
}
