import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.ts';
import {
  ACTION_OPS_COST,
  ACTIONS_PER_POWER,
  BASE_OPS_PER_SECOND,
  CROP_DEFS,
  GAME_TICKS_PER_SECOND,
  GROWTH_VARIANCE,
  SUNFLOWER_BONUS_MULTIPLIER,
} from './constants.ts';
import { createGameState } from './gameState.ts';
import { getCell } from './grid.ts';
import type { DroneAction, GameState } from './types.ts';

const LATE = 1_000_000;

function run(state: GameState, actions: DroneAction[], tick = state.tick): GameState {
  return actions.reduce((s, action) => applyAction(s, action, tick).state, state);
}

function cellAtDrone(state: GameState) {
  return getCell(state.cells, state.drone.pos, state.worldSize);
}

describe('createGameState', () => {
  it('creates a grassland grid with grass everywhere and an empty inventory', () => {
    const state = createGameState(3);
    expect(state.cells).toHaveLength(9);
    expect(state.cells.every((c) => c.ground === 'Grassland' && c.entity?.type === 'Grass')).toBe(true);
    expect(Object.values(state.inventory).every((amount) => amount === 0)).toBe(true);
  });

  it('randomises growth time deterministically within the variance', () => {
    const a = createGameState(3, 42);
    const b = createGameState(3, 42);
    expect(a).toEqual(b);
    const base = CROP_DEFS.Grass.baseGrowTicks;
    for (const cell of a.cells) {
      expect(cell.entity!.growTicks).toBeGreaterThanOrEqual(Math.floor(base * (1 - GROWTH_VARIANCE)));
      expect(cell.entity!.growTicks).toBeLessThanOrEqual(Math.ceil(base * (1 + GROWTH_VARIANCE)));
    }
  });
});

describe('move', () => {
  it('moves in every direction and wraps around the edges', () => {
    const state = createGameState(3);
    expect(run(state, [{ kind: 'move', direction: 'North' }]).drone.pos).toEqual({ x: 0, y: 1 });
    expect(run(state, [{ kind: 'move', direction: 'East' }]).drone.pos).toEqual({ x: 1, y: 0 });
    expect(run(state, [{ kind: 'move', direction: 'South' }]).drone.pos).toEqual({ x: 0, y: 2 });
    expect(run(state, [{ kind: 'move', direction: 'West' }]).drone.pos).toEqual({ x: 2, y: 0 });
  });

  it('does not mutate the previous state', () => {
    const state = createGameState(3);
    const snapshot = structuredClone(state);
    run(state, [{ kind: 'move', direction: 'North' }, { kind: 'till' }, { kind: 'harvest' }], LATE);
    expect(state).toEqual(snapshot);
  });
});

describe('harvest', () => {
  it('lets a plain harvest loop on a new farm always find ripe grass', () => {
    // An un-upgraded drone harvests once every this many game ticks.
    const harvestInterval = (ACTION_OPS_COST / BASE_OPS_PER_SECOND) * GAME_TICKS_PER_SECOND;
    expect(CROP_DEFS.Grass.baseGrowTicks * (1 + GROWTH_VARIANCE)).toBeLessThan(harvestInterval);

    let state = createGameState();
    let tick = CROP_DEFS.Grass.baseGrowTicks * (1 + GROWTH_VARIANCE);
    for (let i = 0; i < 20; i++, tick += harvestInterval) state = applyAction(state, { kind: 'harvest' }, tick).state;
    expect(state.inventory.Hay).toBe(20);
  });

  it('yields hay from ripe grass and regrows grass on grassland', () => {
    const state = createGameState(3);
    const { state: next, result } = applyAction(state, { kind: 'harvest' }, LATE);
    expect(result).toBe(true);
    expect(next.inventory.Hay).toBe(1);
    expect(cellAtDrone(next).entity).toMatchObject({ type: 'Grass', plantedAt: LATE });
  });

  it('destroys unripe plants without yield', () => {
    const state = createGameState(3);
    const { state: next, result } = applyAction(state, { kind: 'harvest' }, 1);
    expect(result).toBe(true);
    expect(next.inventory.Hay).toBe(0);
  });

  it('returns false on an empty cell', () => {
    const soil = run(createGameState(3), [{ kind: 'till' }]);
    expect(applyAction(soil, { kind: 'harvest' }, LATE).result).toBe(false);
  });
});

describe('canHarvest', () => {
  it('is true only once the plant has grown', () => {
    const state = createGameState(3);
    const growTicks = cellAtDrone(state).entity!.growTicks;
    expect(applyAction(state, { kind: 'canHarvest' }, growTicks - 1).result).toBe(false);
    expect(applyAction(state, { kind: 'canHarvest' }, growTicks).result).toBe(true);
  });
});

describe('till', () => {
  it('toggles between grassland and soil', () => {
    const soil = run(createGameState(3), [{ kind: 'till' }]);
    expect(cellAtDrone(soil)).toEqual({ ground: 'Soil', entity: null });
    const grassland = run(soil, [{ kind: 'till' }]);
    expect(cellAtDrone(grassland).ground).toBe('Grassland');
    expect(cellAtDrone(grassland).entity?.type).toBe('Grass');
  });
});

describe('plant', () => {
  it('plants a bush over grass', () => {
    const { state, result } = applyAction(createGameState(3), { kind: 'plant', entity: 'Bush' }, 0);
    expect(result).toBe(true);
    expect(cellAtDrone(state).entity?.type).toBe('Bush');
  });

  it('refuses to plant on an occupied cell', () => {
    const bush = run(createGameState(3), [{ kind: 'plant', entity: 'Bush' }]);
    expect(applyAction(bush, { kind: 'plant', entity: 'Bush' }, 0).result).toBe(false);
  });

  it('requires soil and resources for carrots', () => {
    const state = createGameState(3);
    expect(applyAction(state, { kind: 'plant', entity: 'Carrot' }, 0).result).toBe(false);

    const soil = run(state, [{ kind: 'till' }]);
    expect(applyAction(soil, { kind: 'plant', entity: 'Carrot' }, 0).result).toBe(false);

    const rich = { ...soil, inventory: { ...soil.inventory, Hay: 5, Wood: 5 } };
    const { state: planted, result } = applyAction(rich, { kind: 'plant', entity: 'Carrot' }, 0);
    expect(result).toBe(true);
    expect(planted.inventory).toMatchObject({ Hay: 4, Wood: 4, Carrot: 0, Power: 0 });

    const { state: harvested } = applyAction(planted, { kind: 'harvest' }, LATE);
    expect(harvested.inventory.Carrot).toBe(1);
    expect(cellAtDrone(harvested)).toEqual({ ground: 'Soil', entity: null });
  });
});

describe('queries', () => {
  it('reports position, world size, entity, ground and item counts', () => {
    const state = run(createGameState(4), [{ kind: 'move', direction: 'East' }, { kind: 'till' }]);
    expect(applyAction(state, { kind: 'getPosX' }, 0).result).toBe(1);
    expect(applyAction(state, { kind: 'getPosY' }, 0).result).toBe(0);
    expect(applyAction(state, { kind: 'getWorldSize' }, 0).result).toBe(4);
    expect(applyAction(state, { kind: 'getEntityType' }, 0).result).toBeNull();
    expect(applyAction(state, { kind: 'getGroundType' }, 0).result).toBe('Soil');
    expect(applyAction(state, { kind: 'numItems', item: 'Hay' }, 0).result).toBe(0);
  });
});

describe('clear', () => {
  it('resets the grid and drone position but keeps the inventory', () => {
    const messy = run(createGameState(3), [{ kind: 'till' }, { kind: 'move', direction: 'North' }]);
    const withItems = { ...messy, inventory: { ...messy.inventory, Hay: 3 } };
    const { state } = applyAction(withItems, { kind: 'clear' }, 10);
    expect(state.drone.pos).toEqual({ x: 0, y: 0 });
    expect(state.cells.every((c) => c.ground === 'Grassland' && c.entity?.type === 'Grass')).toBe(true);
    expect(state.inventory.Hay).toBe(3);
  });
});

describe('sunflowers and power', () => {
  const sunflowerField = (petals: number[]): GameState => {
    const base = createGameState(4);
    const cells = base.cells.map((cell, i) =>
      i < petals.length ? { ground: 'Soil' as const, entity: { type: 'Sunflower' as const, plantedAt: 0, growTicks: 10, petals: petals[i] } } : cell,
    );
    return { ...base, cells };
  };
  /** Power gained by a harvest; the harvest itself already started using one unit. */
  const powerAfter = (state: GameState) => state.inventory.Power + (state.poweredActions > 0 ? 1 : 0);

  it('plants sunflowers on soil for a carrot and measures their petals', () => {
    const soil = run(createGameState(3), [{ kind: 'till' }]);
    const rich = { ...soil, inventory: { ...soil.inventory, Carrot: 2 } };
    const { state, result } = applyAction(rich, { kind: 'plant', entity: 'Sunflower' }, 0);
    expect(result).toBe(true);
    expect(state.inventory.Carrot).toBe(1);
    const petals = applyAction(state, { kind: 'measure' }, 0).result;
    expect(petals).toBeGreaterThanOrEqual(7);
    expect(petals).toBeLessThanOrEqual(15);
    expect(applyAction(createGameState(3), { kind: 'measure' }, 0).result).toBeNull();
  });

  it('gives bonus power for the sunflower with the most petals on a big enough field', () => {
    const many = sunflowerField([15, 8, 9, 10, 11, 12, 7, 8, 9, 10]);
    expect(powerAfter(applyAction(many, { kind: 'harvest' }, LATE).state)).toBe(SUNFLOWER_BONUS_MULTIPLIER);

    const notLargest = sunflowerField([8, 15, 9, 10, 11, 12, 7, 8, 9, 10]);
    expect(powerAfter(applyAction(notLargest, { kind: 'harvest' }, LATE).state)).toBe(1);

    const few = sunflowerField([15, 8]);
    expect(powerAfter(applyAction(few, { kind: 'harvest' }, LATE).state)).toBe(1);
  });

  it('uses one unit of power per ACTIONS_PER_POWER drone actions, but not for queries', () => {
    const base = createGameState(3);
    const powered = { ...base, inventory: { ...base.inventory, Power: 1 } };
    const afterOne = run(powered, [{ kind: 'doAFlip' }]);
    expect(afterOne.inventory.Power).toBe(0);
    expect(afterOne.poweredActions).toBe(ACTIONS_PER_POWER - 1);
    expect(run(afterOne, [{ kind: 'canHarvest' }, { kind: 'getPosX' }]).poweredActions).toBe(ACTIONS_PER_POWER - 1);

    const flips: DroneAction[] = Array.from({ length: ACTIONS_PER_POWER }, () => ({ kind: 'doAFlip' }));
    const drained = run(powered, flips);
    expect(drained.inventory.Power).toBe(0);
    expect(drained.poweredActions).toBe(0);
  });
});
