import {
  ACTION_COSTS,
  ACTION_OPS_COST,
  ACTIONS_PER_POWER,
  BLOCK_DEFS,
  COAL_POWER,
  CROP_DEFS,
  DYNAMITE_YIELD_FRACTION,
  EXPLOSION_DYNAMITE_LOSS,
  RUIN_GOLD_PER_BLOCK,
  SUNFLOWER_BONUS_MIN_COUNT,
  SUNFLOWER_BONUS_MULTIPLIER,
} from './constants.ts';
import { createPlant, isFullyGrown } from './crops.ts';
import { createGrid } from './gameState.ts';
import { cellIndex, getCell, isPlanarDirection, stepPos } from './grid.ts';
import {
  countAdjacentMines,
  getMineCell,
  isMinefield,
  isRuinExposed,
  mineIndex,
  minePosOf,
  mushroomGroup,
  neighborOf,
  regenerateLayer,
  ruinIndices,
  ruinsAround,
  type MinePos,
} from './mine.ts';
import type {
  ActionResult,
  Cell,
  Direction,
  DroneAction,
  EntityType,
  GameState,
  Inventory,
  ItemType,
  MineCell,
  MineState,
  UnlockId,
} from './types.ts';
import { canAfford } from './unlocks.ts';

/** Something notable an action caused, for effects and for stopping the program. */
export type ActionEvent = 'explosion' | 'ruinFound' | 'ruinDamaged' | 'blast';

export interface ActionOutcome {
  state: GameState;
  result: ActionResult;
  event?: ActionEvent;
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
  const { pos, depth } = state.drone;
  if (depth > 0 && state.mine) return applyUndergroundAction(state, state.mine, action);
  const cell = getCell(state.cells, pos, state.worldSize);

  switch (action.kind) {
    case 'move':
      return move(state, action.direction);
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
      return { state: syncShafts({ ...state, cells, rngState, drone: { ...state.drone, pos: { x: 0, y: 0 } } }), result: null };
    }
    case 'doAFlip':
      return { state, result: null };
    case 'getEntityType':
      return { state, result: cell.entity?.type ?? null };
    case 'getGroundType':
      return { state, result: cell.ground };
    case 'measure':
      return { state, result: cell.entity?.petals ?? null };
    case 'swap':
      return swapSurface(state, action.direction);
    default:
      return applyCommonAction(state, action);
  }
}

/** Actions that work the same on the farm and in the mine. */
function applyCommonAction(state: GameState, action: DroneAction): ActionOutcome {
  const { pos, depth } = state.drone;
  switch (action.kind) {
    case 'getPosX':
      return { state, result: pos.x };
    case 'getPosY':
      return { state, result: pos.y };
    case 'getWorldSize':
      return { state, result: state.worldSize };
    case 'numItems':
      return { state, result: state.inventory[action.item] };
    case 'getDepth':
      return { state, result: depth };
    case 'getMaxDepth':
      return { state, result: state.mine?.layers ?? 0 };
    case 'move':
      return move(state, action.direction);
    case 'dig':
      return dig(state, action.direction);
    case 'defuse':
      return defuse(state, action.direction);
    case 'useItem':
      return applyItemUse(state, action.item);
    case 'getBlockType': {
      const target = targetOf(state, action.direction);
      return { state, result: target && state.mine ? getMineCell(state.mine, target.pos, target.depth, state.worldSize).block : null };
    }
    case 'doAFlip':
      return { state, result: null };
    default:
      return { state, result: null };
  }
}

/** Actions on the drone's mine cell (depth ≥ 1). The drone is always in a dug-out cell. */
function applyUndergroundAction(state: GameState, mine: MineState, action: DroneAction): ActionOutcome {
  const { pos, depth } = state.drone;
  const size = state.worldSize;
  const cell = getMineCell(mine, pos, depth, size);
  switch (action.kind) {
    case 'harvest':
      return harvestMushrooms(state, mine, cell);
    case 'canHarvest':
      return { state, result: cell.entity !== null && isFullyGrown(cell.entity, state.tick) };
    case 'plant': {
      const def = CROP_DEFS[action.entity];
      if (!def.underground || cell.entity !== null || !canAfford(state.inventory, def.plantCost)) return { state, result: false };
      const [plant, rngState] = createPlant(action.entity, state.tick, state.rngState);
      const paid = { ...state, rngState, inventory: addItems(state.inventory, def.plantCost, -1) };
      return { state: withMineCells(paid, mine, [[mineIndex(pos, depth, size), { ...cell, entity: plant }]]), result: true };
    }
    case 'till':
      return { state, result: null };
    case 'clear': {
      const [regenerated, rngState] = regenerateLayer(mine, size, depth, state.tick, state.rngState);
      return { state: syncShafts({ ...state, mine: regenerated, rngState, drone: { pos, depth: 0 } }), result: null };
    }
    case 'getEntityType':
      return { state, result: cell.entity?.type ?? null };
    case 'getGroundType':
      return { state, result: null };
    case 'measure':
      if (cell.entity) return { state, result: cell.entity.color ?? cell.entity.petals ?? null };
      return { state, result: isMinefield(depth) ? countAdjacentMines(mine, pos, depth, size) : null };
    case 'swap': {
      if (!isPlanarDirection(action.direction)) return { state, result: false };
      const otherIndex = mineIndex(stepPos(pos, action.direction, size), depth, size);
      const other = mine.cells[otherIndex]!;
      if (other.block !== 'Air') return { state, result: false };
      const updates: [number, MineCell][] = [
        [mineIndex(pos, depth, size), { ...cell, entity: other.entity }],
        [otherIndex, { ...other, entity: cell.entity }],
      ];
      return { state: withMineCells(state, mine, updates), result: true };
    }
    default:
      return applyCommonAction(state, action);
  }
}

/** The cell a directional action targets, or null when there is none (only Down leads from the farm into the mine). */
function targetOf(state: GameState, direction: Direction): MinePos | null {
  const mine = state.mine;
  if (!mine) return null;
  const { pos, depth } = state.drone;
  if (depth === 0 && direction !== 'Down') return null;
  const target = neighborOf(pos, depth, direction, state.worldSize, mine.layers);
  return target && target.depth > 0 ? target : null;
}

function move(state: GameState, direction: Direction): ActionOutcome {
  const { pos, depth } = state.drone;
  if (depth === 0 && isPlanarDirection(direction)) {
    return { state: { ...state, drone: { ...state.drone, pos: stepPos(pos, direction, state.worldSize) } }, result: true };
  }
  if (!state.mine) return { state, result: false };
  const target = neighborOf(pos, depth, direction, state.worldSize, state.mine.layers);
  if (!target) return { state, result: false };
  const open = target.depth === 0 || getMineCell(state.mine, target.pos, target.depth, state.worldSize).block === 'Air';
  if (!open) return { state, result: false };
  return { state: { ...state, drone: { pos: target.pos, depth: target.depth } }, result: true };
}

/** Hits the block next to the drone once; it breaks when its hits reach its hardness (minus Drill levels). */
function dig(state: GameState, direction: Direction): ActionOutcome {
  const target = targetOf(state, direction);
  const mine = state.mine;
  if (!target || !mine) return { state, result: false };
  const size = state.worldSize;
  const index = mineIndex(target.pos, target.depth, size);
  const cell = mine.cells[index]!;
  if (cell.block === 'Air') return { state, result: false };
  if (cell.mine) return explode(state, mine, target.depth);
  if (cell.block === 'Ruin' && cell.ruin !== undefined) {
    return { state: damageRuin(state, mine, cell.ruin, target.depth), result: true, event: 'ruinDamaged' };
  }
  const hits = Math.max(1, BLOCK_DEFS[cell.block].hardness - state.unlocks.Drill);
  if (cell.damage + 1 < hits) {
    return { state: withMineCells(state, mine, [[index, { ...cell, damage: cell.damage + 1 }]]), result: false };
  }
  const dug = withMineCells(
    { ...state, inventory: addItems(state.inventory, BLOCK_DEFS[cell.block].dropYield, 1) },
    mine,
    [[index, { block: 'Air', damage: 0, entity: null }]],
  );
  return excavateRuins(syncShafts(dug), [target]);
}

/** Digging into a mine blows the drone up: it lands back on the farm, the layer is rebuilt and dynamite is lost. */
function explode(state: GameState, mine: MineState, layer: number): ActionOutcome {
  const { pos } = state.drone;
  const [regenerated, rngState] = regenerateLayer(mine, state.worldSize, layer, state.tick, state.rngState);
  const lost = Math.ceil(state.inventory.Dynamite * EXPLOSION_DYNAMITE_LOSS);
  const next: GameState = {
    ...state,
    mine: regenerated,
    rngState,
    inventory: { ...state.inventory, Dynamite: state.inventory.Dynamite - lost },
    drone: { pos, depth: 0 },
  };
  return { state: syncShafts(next), result: false, event: 'explosion' };
}

/** Removes the mine next to the drone, if there is one, and keeps it as dynamite. */
function defuse(state: GameState, direction: Direction): ActionOutcome {
  const target = targetOf(state, direction);
  const mine = state.mine;
  if (!target || !mine) return { state, result: false };
  const index = mineIndex(target.pos, target.depth, state.worldSize);
  const cell = mine.cells[index]!;
  if (!cell.mine) return { state, result: false };
  const defused = withMineCells(
    { ...state, inventory: { ...state.inventory, Dynamite: state.inventory.Dynamite + 1 } },
    mine,
    [[index, { block: 'Air', damage: 0, entity: null }]],
  );
  return excavateRuins(syncShafts(defused), [target]);
}

/** A damaged ruin crumbles to rubble and is lost. */
function damageRuin(state: GameState, mine: MineState, ruinId: number, depth: number): GameState {
  const updates = ruinIndices(mine, ruinId, depth, state.worldSize).map(
    (index): [number, MineCell] => [index, { block: 'Rubble', damage: 0, entity: null }],
  );
  return withMineCells(state, mine, updates);
}

/** Collects every ruin around the changed cells that is now fully dug free: gold = size² × RUIN_GOLD_PER_BLOCK. */
function excavateRuins(state: GameState, changed: readonly MinePos[]): ActionOutcome {
  let next = state;
  let found = false;
  const size = state.worldSize;
  const checked = new Set<number>();
  for (const { pos, depth } of changed) {
    const mine = next.mine!;
    for (const ruinId of ruinsAround(mine, pos, depth, size)) {
      if (checked.has(ruinId)) continue;
      checked.add(ruinId);
      const ruinDepth = Math.floor(ruinId / 1000);
      const current = next.mine!;
      if (!isRuinExposed(current, ruinId, ruinDepth, size)) continue;
      const indices = ruinIndices(current, ruinId, ruinDepth, size);
      const gold = indices.length * indices.length * RUIN_GOLD_PER_BLOCK;
      next = withMineCells(
        { ...next, inventory: { ...next.inventory, Gold: next.inventory.Gold + gold } },
        current,
        indices.map((index): [number, MineCell] => [index, { block: 'Air', damage: 0, entity: null }]),
      );
      found = true;
    }
  }
  return found ? { state: next, result: true, event: 'ruinFound' } : { state: next, result: true };
}

/** The unlock that lets the drone use an item. */
const ITEM_USE_UNLOCKS: Partial<Record<ItemType, UnlockId>> = { Coal: 'Coal', Clay: 'Rice', Dynamite: 'Dynamite' };

function applyItemUse(state: GameState, item: ItemType): ActionOutcome {
  const unlock = ITEM_USE_UNLOCKS[item];
  if (!unlock || state.unlocks[unlock] <= 0 || state.inventory[item] <= 0) return { state, result: false };
  const spend = (s: GameState): GameState => ({ ...s, inventory: addItems(s.inventory, { [item]: 1 }, -1) });
  const { pos, depth } = state.drone;
  switch (item) {
    case 'Coal':
      return { state: spend({ ...state, inventory: addItems(state.inventory, { Power: COAL_POWER }, 1) }), result: true };
    case 'Clay': {
      if (depth !== 0) return { state, result: false };
      const cell = getCell(state.cells, pos, state.worldSize);
      if (cell.ground === 'Shaft' || cell.ground === 'Clay') return { state, result: false };
      return { state: withCell(spend(state), { ground: 'Clay', entity: null }), result: true };
    }
    case 'Dynamite':
      if (depth === 0 || !state.mine) return { state, result: false };
      return blast(spend(state), state.mine);
    default:
      return { state, result: false };
  }
}

/** Dynamite clears the 3×3×3 blocks around the drone for half their drop; mines go off, ruins are damaged. */
function blast(state: GameState, mine: MineState): ActionOutcome {
  const { pos, depth } = state.drone;
  const size = state.worldSize;
  const indices = new Set<number>();
  for (let dz = -1; dz <= 1; dz++) {
    const layer = depth + dz;
    if (layer < 1 || layer > mine.layers) continue;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (((pos.x + dx) % size) + size) % size;
        const y = (((pos.y + dy) % size) + size) % size;
        indices.add(mineIndex({ x, y }, layer, size));
      }
    }
  }
  let next = state;
  let current = mine;
  const drops: Partial<Record<ItemType, number>> = {};
  const changed: MinePos[] = [];
  for (const index of indices) {
    const cell = current.cells[index]!;
    if (cell.block === 'Air') continue;
    if (cell.block === 'Ruin' && cell.ruin !== undefined) {
      next = damageRuin(next, current, cell.ruin, minePosOf(index, size).depth);
      current = next.mine!;
    }
    if (!cell.mine) {
      for (const [item, amount] of Object.entries(BLOCK_DEFS[current.cells[index]!.block].dropYield) as [ItemType, number][]) {
        drops[item] = (drops[item] ?? 0) + amount * DYNAMITE_YIELD_FRACTION;
      }
    }
    next = withMineCells(next, current, [[index, { block: 'Air', damage: 0, entity: null }]]);
    current = next.mine!;
    changed.push(minePosOf(index, size));
  }
  const whole = Object.fromEntries(Object.entries(drops).map(([item, amount]) => [item, Math.floor(amount)]));
  next = syncShafts({ ...next, inventory: addItems(next.inventory, whole, 1) });
  const outcome = excavateRuins(next, changed);
  return { ...outcome, event: outcome.event ?? 'blast' };
}

/** Harvesting a ripe mushroom also takes every ripe mushroom connected to it when the whole group is sorted: n² mushrooms. */
function harvestMushrooms(state: GameState, mine: MineState, cell: MineCell): ActionOutcome {
  if (!cell.entity) return { state, result: false };
  const { pos, depth } = state.drone;
  const size = state.worldSize;
  const ownIndex = mineIndex(pos, depth, size);
  const cleared = (index: number): [number, MineCell] => [index, { ...mine.cells[index]!, entity: null }];
  if (!isFullyGrown(cell.entity, state.tick)) return { state: withMineCells(state, mine, [cleared(ownIndex)]), result: true };
  if (cell.entity.type !== 'Mushroom') {
    const yielded = addItems(state.inventory, CROP_DEFS[cell.entity.type].harvestYield, 1);
    return { state: withMineCells({ ...state, inventory: yielded }, mine, [cleared(ownIndex)]), result: true };
  }
  const group = mushroomGroup(mine, pos, depth, size, (other) => other.entity !== null && isFullyGrown(other.entity, state.tick));
  const taken = group.sorted ? group.indices : [ownIndex];
  const amount = taken.length * taken.length;
  const inventory = { ...state.inventory, Mushroom: state.inventory.Mushroom + amount };
  return { state: withMineCells({ ...state, inventory }, mine, taken.map(cleared)), result: true };
}

function swapSurface(state: GameState, direction: Direction): ActionOutcome {
  if (!isPlanarDirection(direction)) return { state, result: false };
  const size = state.worldSize;
  const ownIndex = cellIndex(state.drone.pos, size);
  const otherIndex = cellIndex(stepPos(state.drone.pos, direction, size), size);
  const own = state.cells[ownIndex]!;
  const other = state.cells[otherIndex]!;
  if (own.ground === 'Shaft' || other.ground === 'Shaft') return { state, result: false };
  const cells = state.cells.slice();
  cells[ownIndex] = { ...own, entity: other.entity };
  cells[otherIndex] = { ...other, entity: own.entity };
  return { state: { ...state, cells }, result: true };
}

function withMineCells(state: GameState, mine: MineState, updates: readonly [number, MineCell][]): GameState {
  if (updates.length === 0) return state;
  const cells = mine.cells.slice();
  for (const [index, cell] of updates) cells[index] = cell;
  return { ...state, mine: { ...mine, cells } };
}

/** Farm cells above a dug-out cell of the first layer are shafts; filled-in shafts turn back into grassland. */
function syncShafts(state: GameState): GameState {
  const mine = state.mine;
  if (!mine || mine.layers === 0) return state;
  let cells: Cell[] | null = null;
  let rngState = state.rngState;
  for (let i = 0; i < state.cells.length; i++) {
    const open = mine.cells[i]!.block === 'Air';
    const cell = state.cells[i]!;
    if (open === (cell.ground === 'Shaft')) continue;
    cells ??= state.cells.slice();
    if (open) {
      cells[i] = { ground: 'Shaft', entity: null };
    } else {
      const [grass, next] = createPlant('Grass', state.tick, rngState);
      rngState = next;
      cells[i] = { ground: 'Grassland', entity: grass };
    }
  }
  return cells ? { ...state, cells, rngState } : state;
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

/** Toggles the ground between grassland and soil, removing whatever grows there. Shafts cannot be tilled. */
function till(state: GameState, cell: Cell): ActionOutcome {
  if (cell.ground === 'Shaft') return { state, result: null };
  return { state: clearCell(state, cell.ground === 'Grassland' ? 'Soil' : 'Grassland'), result: null };
}
