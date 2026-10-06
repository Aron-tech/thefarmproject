import {
  ACTION_COSTS,
  ACTION_OPS_COST,
  ACTIONS_PER_POWER,
  CROP_DEFS,
  SUNFLOWER_BONUS_MIN_COUNT,
  SUNFLOWER_BONUS_MULTIPLIER,
} from './constants.ts';
import { createPlant, isFullyGrown } from './crops.ts';
import { createGrid } from './gameState.ts';
import { cellIndex, getCell, stepPos } from './grid.ts';
import type { ActionResult, Cell, DroneAction, EntityType, GameState, Inventory, ItemType } from './types.ts';
import { canAfford } from './unlocks.ts';

export interface ActionOutcome {
  state: GameState;
  result: ActionResult;
}

/**
 * Applies a drone action at the given game tick. Pure: the input state is never mutated,
 * unchanged parts of the state are shared with the returned one. Physical actions use up power.
 */
export function applyAction(previous: GameState, action: DroneAction, tick: number): ActionOutcome {
  const outcome = applyActionEffect(previous, action, tick);
  return ACTION_COSTS[action.kind] === ACTION_OPS_COST ? { ...outcome, state: consumePower(outcome.state) } : outcome;
}

/** One unit of power lasts ACTIONS_PER_POWER actions. */
function consumePower(state: GameState): GameState {
  if (state.poweredActions > 0) return { ...state, poweredActions: state.poweredActions - 1 };
  if (state.inventory.Power <= 0) return state;
  return {
    ...state,
    inventory: { ...state.inventory, Power: state.inventory.Power - 1 },
    poweredActions: ACTIONS_PER_POWER - 1,
  };
}

function applyActionEffect(previous: GameState, action: DroneAction, tick: number): ActionOutcome {
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
    case 'measure':
      return { state, result: cell.entity?.petals ?? null };
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

/** Harvests the drone's cell. Unripe entities are destroyed without yield. Returns whether something was removed. */
function harvest(state: GameState, cell: Cell): ActionOutcome {
  if (!cell.entity) return { state, result: false };
  const ripe = isFullyGrown(cell.entity, state.tick);
  const harvested = ripe ? { ...state, inventory: addItems(state.inventory, harvestYield(state, cell), 1) } : state;
  return { state: clearCell(harvested, cell.ground), result: true };
}

/** Sunflowers give bonus power when the one with the most petals is harvested from a big enough field. */
function harvestYield(state: GameState, cell: Cell): Partial<Record<ItemType, number>> {
  const entity = cell.entity!;
  const base = CROP_DEFS[entity.type].harvestYield;
  if (entity.type !== 'Sunflower') return base;
  let count = 0;
  let maxPetals = 0;
  for (const other of state.cells) {
    if (other.entity?.type !== 'Sunflower') continue;
    count++;
    maxPetals = Math.max(maxPetals, other.entity.petals ?? 0);
  }
  if (count < SUNFLOWER_BONUS_MIN_COUNT || (entity.petals ?? 0) < maxPetals) return base;
  return Object.fromEntries(Object.entries(base).map(([item, amount]) => [item, amount * SUNFLOWER_BONUS_MULTIPLIER]));
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
