import { describe, expect, it } from 'vitest';
import { BASE_OPS_PER_SECOND, POWER_SPEED_MULTIPLIER, SPEED_LEVEL_MULTIPLIERS } from './constants.ts';
import { createGameState } from './gameState.ts';
import type { GameState, ItemType } from './types.ts';
import { buyUnlock, canBuyUnlock, EXPAND_WORLD_SIZES, getOpsPerSecond, isUnlockVisible, UNLOCK_DEFS } from './unlocks.ts';

function withItems(state: GameState, items: Partial<Record<ItemType, number>>): GameState {
  return { ...state, inventory: { ...state.inventory, ...items } };
}

describe('unlocks', () => {
  it('starts with a single tile and nothing unlocked', () => {
    const state = createGameState();
    expect(state.worldSize).toBe(1);
    expect(Object.values(state.unlocks).every((level) => level === 0)).toBe(true);
  });

  it('buys an unlock by paying its cost', () => {
    const state = withItems(createGameState(), { Hay: 7 });
    expect(canBuyUnlock(state, 'Loops')).toBe(true);
    const next = buyUnlock(state, 'Loops')!;
    expect(next.unlocks.Loops).toBe(1);
    expect(next.inventory.Hay).toBe(7 - UNLOCK_DEFS.Loops.costs[0]!.Hay!);
    expect(buyUnlock(next, 'Loops')).toBeNull();
  });

  it('refuses unaffordable unlocks and ones whose parents are locked', () => {
    expect(buyUnlock(createGameState(), 'Loops')).toBeNull();
    const rich = withItems(createGameState(), { Hay: 10_000, Wood: 10_000, Carrot: 10_000 });
    expect(isUnlockVisible(rich.unlocks, 'Speed')).toBe(false);
    expect(buyUnlock(rich, 'Speed')).toBeNull();
    expect(buyUnlock(buyUnlock(rich, 'Loops')!, 'Speed')?.unlocks.Speed).toBe(1);
  });

  it('expands the farm and keeps existing cells', () => {
    let state = withItems(createGameState(), { Hay: 10_000, Wood: 10_000 });
    state = buyUnlock(state, 'Loops')!;
    const firstCell = state.cells[0];
    state = buyUnlock(state, 'Expand')!;
    expect(state.worldSize).toBe(EXPAND_WORLD_SIZES[1]);
    expect(state.cells).toHaveLength(EXPAND_WORLD_SIZES[1]! ** 2);
    expect(state.cells[0]).toBe(firstCell);
    expect(state.cells.every((cell) => cell.entity?.type === 'Grass')).toBe(true);
  });

  it('derives drone speed from the Speed level and power', () => {
    const state = createGameState();
    expect(getOpsPerSecond(state)).toBe(BASE_OPS_PER_SECOND);
    const fast = { ...state, unlocks: { ...state.unlocks, Speed: 2 } };
    const fastOps = BASE_OPS_PER_SECOND * SPEED_LEVEL_MULTIPLIERS[2]!;
    expect(getOpsPerSecond(fast)).toBe(fastOps);
    expect(getOpsPerSecond(withItems(fast, { Power: 1 }))).toBe(fastOps * POWER_SPEED_MULTIPLIER);
    expect(getOpsPerSecond({ ...fast, poweredActions: 3 })).toBe(fastOps * POWER_SPEED_MULTIPLIER);
  });
});
