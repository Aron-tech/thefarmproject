import { describe, expect, it } from 'vitest';
import { applyAction } from './actions.ts';
import { BLOCK_DEFS, COAL_POWER, RUIN_GOLD_PER_BLOCK } from './constants.ts';
import { createGameState } from './gameState.ts';
import { countAdjacentMines, createMine, getMineCell, isMinefield, mineIndex } from './mine.ts';
import type { BlockType, DroneAction, GameState, MineCell } from './types.ts';
import { buyUnlock, createFullUnlocks, resizeWorld } from './unlocks.ts';

const LATE = 1_000_000;

function run(state: GameState, actions: DroneAction[], tick = state.tick): GameState {
  return actions.reduce((s, action) => applyAction(s, action, tick).state, state);
}

/** A 3×3 farm with a mine of `layers` layers filled with `fill`, then the given cells overridden. */
function mineState(layers: number, fill: BlockType = 'Stone', cells: [number, number, number, Partial<MineCell>][] = []): GameState {
  const unlocks = { ...createFullUnlocks(), Drill: 0 };
  const base = createGameState(3, 1, unlocks);
  const size = 3;
  const mineCells: MineCell[] = Array.from({ length: layers * size * size }, () => ({ block: fill, damage: 0, entity: null }));
  for (const [x, y, depth, cell] of cells) {
    const index = mineIndex({ x, y }, depth, size);
    mineCells[index] = { ...mineCells[index]!, ...cell };
  }
  return { ...base, mine: { layers, cells: mineCells } };
}

const at = (state: GameState, x: number, y: number, depth: number) => getMineCell(state.mine!, { x, y }, depth, state.worldSize);
const air: Partial<MineCell> = { block: 'Air' };

describe('mine generation', () => {
  it('is deterministic and follows the layer table', () => {
    const [a] = createMine(6, 8, 0, 7);
    const [b] = createMine(6, 8, 0, 7);
    expect(a).toEqual(b);
    expect(a.cells).toHaveLength(8 * 36);
    const layer = (depth: number) => a.cells.slice((depth - 1) * 36, depth * 36);
    expect(layer(1).every((cell) => ['Dirt', 'Clay', 'Coal'].includes(cell.block))).toBe(true);
    expect(layer(3).some((cell) => cell.entity?.type === 'Mushroom')).toBe(true);
    expect(isMinefield(4)).toBe(true);
    expect(layer(4).some((cell) => cell.mine)).toBe(true);
    expect(layer(4)[0]!.mine).toBeUndefined();
    expect(layer(5).some((cell) => cell.block === 'Ruin')).toBe(true);
  });

  it('is created by the Mining unlock and deepened by Depth', () => {
    const start = createGameState(3);
    const rich = { ...start, unlocks: { ...start.unlocks, Carrots: 1, Expand: 1 }, inventory: { ...start.inventory, Wood: 999, Carrot: 999, Stone: 999 } };
    const mined = buyUnlock(rich, 'Mining')!;
    expect(mined.mine?.layers).toBe(2);
    const deeper = buyUnlock(mined, 'Depth')!;
    expect(deeper.mine?.layers).toBe(3);
    expect(deeper.mine!.cells.slice(0, 18)).toEqual(mined.mine!.cells);
  });

  it('grows with Expand, keeping the dug-out cells', () => {
    const state = run(mineState(2, 'Dirt'), [{ kind: 'dig', direction: 'Down' }]);
    const bigger = resizeWorld(state, 4);
    expect(bigger.mine!.cells).toHaveLength(2 * 16);
    expect(getMineCell(bigger.mine!, { x: 0, y: 0 }, 1, 4).block).toBe('Air');
    expect(bigger.cells[0]!.ground).toBe('Shaft');
  });
});

describe('digging and moving', () => {
  it('needs dug-out cells to move down, sideways and up', () => {
    const state = mineState(2, 'Dirt');
    expect(applyAction(state, { kind: 'move', direction: 'Down' }, 0).result).toBe(false);
    expect(applyAction(state, { kind: 'move', direction: 'Up' }, 0).result).toBe(false);

    const dug = run(state, [{ kind: 'dig', direction: 'Down' }]);
    expect(dug.cells[0]!.ground).toBe('Shaft');
    const below = run(dug, [{ kind: 'move', direction: 'Down' }]);
    expect(below.drone).toEqual({ pos: { x: 0, y: 0 }, depth: 1 });
    expect(applyAction(below, { kind: 'move', direction: 'East' }, 0).result).toBe(false);
    expect(applyAction(below, { kind: 'getDepth' }, 0).result).toBe(1);
    expect(applyAction(below, { kind: 'getMaxDepth' }, 0).result).toBe(2);

    const tunnel = run(below, [{ kind: 'dig', direction: 'East' }, { kind: 'move', direction: 'East' }]);
    expect(tunnel.drone).toEqual({ pos: { x: 1, y: 0 }, depth: 1 });
    expect(applyAction(tunnel, { kind: 'move', direction: 'Up' }, 0).state.drone.depth).toBe(0);
  });

  it('breaks hard blocks after several hits, fewer with Drill', () => {
    const state = run(mineState(2, 'Stone', [[0, 0, 1, air]]), [{ kind: 'move', direction: 'Down' }]);
    expect(BLOCK_DEFS.Iron.hardness).toBe(3);
    const iron = { ...state, mine: { ...state.mine!, cells: state.mine!.cells.map((c, i) => (i === 1 ? { ...c, block: 'Iron' as const } : c)) } };
    const first = applyAction(iron, { kind: 'dig', direction: 'East' }, 0);
    expect(first.result).toBe(false);
    expect(at(first.state, 1, 0, 1).damage).toBe(1);
    const broken = run(first.state, [{ kind: 'dig', direction: 'East' }, { kind: 'dig', direction: 'East' }]);
    expect(at(broken, 1, 0, 1).block).toBe('Air');
    expect(broken.inventory.Iron).toBe(1);

    const drilled = { ...iron, unlocks: { ...iron.unlocks, Drill: 2 } };
    expect(applyAction(drilled, { kind: 'dig', direction: 'East' }, 0).result).toBe(true);
  });

  it('reports blocks around the drone', () => {
    const state = mineState(2, 'Coal', [[0, 0, 1, air]]);
    expect(applyAction(state, { kind: 'getBlockType', direction: 'Down' }, 0).result).toBe('Air');
    expect(applyAction(state, { kind: 'getBlockType', direction: 'North' }, 0).result).toBeNull();
    const below = run(state, [{ kind: 'move', direction: 'Down' }]);
    expect(applyAction(below, { kind: 'getBlockType', direction: 'North' }, 0).result).toBe('Coal');
    expect(applyAction(below, { kind: 'getGroundType' }, 0).result).toBeNull();
  });

  it('regenerates the layer with clear() and lifts the drone to the farm', () => {
    const state = run(mineState(2, 'Stone', [[0, 0, 1, air]]), [{ kind: 'move', direction: 'Down' }]);
    const cleared = run(state, [{ kind: 'clear' }]);
    expect(cleared.drone.depth).toBe(0);
    expect(cleared.mine!.cells.slice(0, 9).every((cell) => ['Dirt', 'Clay', 'Coal'].includes(cell.block))).toBe(true);
  });
});

describe('minefield', () => {
  const field = () =>
    run(
      mineState(4, 'Stone', [
        [0, 0, 1, air],
        [0, 0, 2, air],
        [0, 0, 3, air],
        [0, 0, 4, air],
        [1, 0, 4, { mine: true }],
        [1, 1, 4, { mine: true }],
      ]),
      [{ kind: 'move', direction: 'Down' }, { kind: 'move', direction: 'Down' }, { kind: 'move', direction: 'Down' }, { kind: 'move', direction: 'Down' }],
    );

  it('measures the mines around a dug-out cell', () => {
    const state = field();
    expect(state.drone.depth).toBe(4);
    expect(countAdjacentMines(state.mine!, { x: 0, y: 0 }, 4, 3)).toBe(2);
    expect(applyAction(state, { kind: 'measure' }, 0).result).toBe(2);
    expect(applyAction(state, { kind: 'getBlockType', direction: 'East' }, 0).result).toBe('Stone');
  });

  it('defuses mines into dynamite', () => {
    const state = field();
    expect(applyAction(state, { kind: 'defuse', direction: 'North' }, 0).result).toBe(false);
    const { state: defused, result } = applyAction(state, { kind: 'defuse', direction: 'East' }, 0);
    expect(result).toBe(true);
    expect(defused.inventory.Dynamite).toBe(1);
    expect(at(defused, 1, 0, 4)).toEqual({ block: 'Air', damage: 0, entity: null });
  });

  it('blows the drone up when it digs into a mine', () => {
    const state = { ...field(), inventory: { ...field().inventory, Dynamite: 4 } };
    const outcome = applyAction(state, { kind: 'dig', direction: 'East' }, 0);
    expect(outcome.event).toBe('explosion');
    expect(outcome.state.drone.depth).toBe(0);
    expect(outcome.state.inventory.Dynamite).toBe(2);
    expect(outcome.state.mine!.cells.slice(27, 36)).not.toEqual(state.mine!.cells.slice(27, 36));
  });

  it('blasts the blocks around the drone with dynamite', () => {
    const state = run(mineState(3, 'Stone', [[0, 0, 1, air], [0, 0, 2, air]]), [{ kind: 'move', direction: 'Down' }, { kind: 'move', direction: 'Down' }]);
    const armed = { ...state, inventory: { ...state.inventory, Dynamite: 1 } };
    const outcome = applyAction(armed, { kind: 'useItem', item: 'Dynamite' }, 0);
    expect(outcome.result).toBe(true);
    expect(outcome.state.mine!.cells.every((cell) => cell.block === 'Air')).toBe(true);
    expect(outcome.state.inventory.Dynamite).toBe(0);
    expect(outcome.state.inventory.Stone).toBe(Math.floor((27 - 2) * 0.5));
  });
});

describe('ruins', () => {
  const ruinField = () =>
    run(
      mineState(1, 'Dirt', [
        [0, 0, 1, air],
        [1, 1, 1, { block: 'Ruin', ruin: 1001 }],
        [1, 2, 1, { block: 'Ruin', ruin: 1001 }],
      ]),
      [{ kind: 'move', direction: 'Down' }],
    );

  it('gives gold when every block around a ruin is dug out', () => {
    let state = ruinField();
    // Dig out the rest of the layer around the drone's (0, 0) start, never touching the ruin.
    const path: DroneAction[] = [
      { kind: 'dig', direction: 'East' },
      { kind: 'move', direction: 'East' },
      { kind: 'dig', direction: 'East' },
      { kind: 'move', direction: 'East' },
      { kind: 'dig', direction: 'North' },
      { kind: 'move', direction: 'North' },
      { kind: 'dig', direction: 'North' },
      { kind: 'move', direction: 'North' },
      { kind: 'dig', direction: 'East' },
      { kind: 'move', direction: 'East' },
    ];
    state = run(state, path);
    expect(state.inventory.Gold).toBe(0);
    expect(state.drone.pos).toEqual({ x: 0, y: 2 });
    const outcome = applyAction(state, { kind: 'dig', direction: 'South' }, 0);
    expect(outcome.event).toBe('ruinFound');
    expect(outcome.state.inventory.Gold).toBe(4 * RUIN_GOLD_PER_BLOCK);
    expect(outcome.state.mine!.cells.every((cell) => cell.block === 'Air')).toBe(true);
  });

  it('crumbles to rubble when dug into', () => {
    const state = run(ruinField(), [{ kind: 'dig', direction: 'East' }, { kind: 'move', direction: 'East' }]);
    const outcome = applyAction(state, { kind: 'dig', direction: 'North' }, 0);
    expect(outcome.event).toBe('ruinDamaged');
    expect(at(outcome.state, 1, 1, 1).block).toBe('Rubble');
    expect(at(outcome.state, 1, 2, 1).block).toBe('Rubble');
  });
});

describe('mushrooms', () => {
  const mushroom = (color: number): Partial<MineCell> => ({ block: 'Air', entity: { type: 'Mushroom', plantedAt: 0, growTicks: 10, color } });

  it('harvests a sorted group for n² mushrooms', () => {
    const state = run(mineState(1, 'Stone', [[0, 0, 1, mushroom(1)], [1, 0, 1, mushroom(2)], [2, 0, 1, mushroom(5)], [0, 1, 1, mushroom(3)]]), [
      { kind: 'move', direction: 'Down' },
    ]);
    expect(applyAction(state, { kind: 'measure' }, LATE).result).toBe(1);
    const { state: harvested } = applyAction(state, { kind: 'harvest' }, LATE);
    expect(harvested.inventory.Mushroom).toBe(16);
    expect(harvested.mine!.cells.every((cell) => cell.entity === null)).toBe(true);
  });

  it('harvests only one from an unsorted group, until swapped into order', () => {
    const state = run(mineState(1, 'Stone', [[0, 0, 1, mushroom(4)], [1, 0, 1, mushroom(2)]]), [{ kind: 'move', direction: 'Down' }]);
    expect(applyAction(state, { kind: 'harvest' }, LATE).state.inventory.Mushroom).toBe(1);
    const swapped = run(state, [{ kind: 'swap', direction: 'East' }], LATE);
    expect(applyAction(swapped, { kind: 'measure' }, LATE).result).toBe(2);
    expect(applyAction(swapped, { kind: 'harvest' }, LATE).state.inventory.Mushroom).toBe(4);
  });

  it('plants mushrooms only in the mine', () => {
    const state = mineState(1, 'Stone', [[0, 0, 1, air]]);
    const stocked = { ...state, inventory: { ...state.inventory, Mushroom: 2 } };
    expect(applyAction(stocked, { kind: 'plant', entity: 'Mushroom' }, 0).result).toBe(false);
    const below = run(stocked, [{ kind: 'move', direction: 'Down' }]);
    const planted = applyAction(below, { kind: 'plant', entity: 'Mushroom' }, 0);
    expect(planted.result).toBe(true);
    expect(planted.state.inventory.Mushroom).toBe(1);
    expect(at(planted.state, 0, 0, 1).entity?.color).toBeTypeOf('number');
  });
});

describe('items', () => {
  it('burns coal for power', () => {
    const state = mineState(1);
    expect(applyAction(state, { kind: 'useItem', item: 'Coal' }, 0).result).toBe(false);
    const stocked = { ...state, inventory: { ...state.inventory, Coal: 2 } };
    const { state: burnt } = applyAction(stocked, { kind: 'useItem', item: 'Coal' }, 0);
    expect(burnt.inventory.Coal).toBe(1);
    // Using the coal is itself a powered action, which starts on the new power.
    expect(burnt.inventory.Power).toBe(COAL_POWER - 1);
  });

  it('turns farm ground into clay, where rice grows', () => {
    const state = mineState(1);
    const stocked = { ...state, inventory: { ...state.inventory, Clay: 1, Hay: 2 } };
    const clay = run(stocked, [{ kind: 'useItem', item: 'Clay' }]);
    expect(clay.cells[0]).toEqual({ ground: 'Clay', entity: null });
    const planted = run(clay, [{ kind: 'plant', entity: 'Rice' }]);
    expect(planted.cells[0]!.entity?.type).toBe('Rice');
    expect(run(planted, [{ kind: 'harvest' }], LATE).inventory.Rice).toBe(1);
  });
});
