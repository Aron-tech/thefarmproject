import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.ts';
import { CROP_DEFS, GROWTH_VARIANCE } from './constants.ts';
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
    expect(state.inventory).toEqual({ Hay: 0, Wood: 0, Carrot: 0 });
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

    const rich = { ...soil, inventory: { Hay: 5, Wood: 5, Carrot: 0 } };
    const { state: planted, result } = applyAction(rich, { kind: 'plant', entity: 'Carrot' }, 0);
    expect(result).toBe(true);
    expect(planted.inventory).toEqual({ Hay: 4, Wood: 4, Carrot: 0 });

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
    const withItems = { ...messy, inventory: { Hay: 3, Wood: 0, Carrot: 0 } };
    const { state } = applyAction(withItems, { kind: 'clear' }, 10);
    expect(state.drone.pos).toEqual({ x: 0, y: 0 });
    expect(state.cells.every((c) => c.ground === 'Grassland' && c.entity?.type === 'Grass')).toBe(true);
    expect(state.inventory.Hay).toBe(3);
  });
});
