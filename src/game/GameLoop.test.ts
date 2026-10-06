import { afterEach, describe, expect, it } from 'vitest';
import { InterpreterClient } from '../core/interpreter/client.ts';
import type { OpsPerSecond } from '../core/interpreter/protocol.ts';
import { createInProcessTransport } from '../core/interpreter/transport.ts';
import { addFile, createWorkspace, findFileByName, MAIN_FILE_ID, renameFile, setFileCode, setFileWindow, type Workspace } from '../core/state/codeFiles.ts';
import { GAME_TICKS_PER_SECOND } from '../core/state/constants.ts';
import { createGameState } from '../core/state/gameState.ts';
import type { GameState } from '../core/state/types.ts';
import { createFullUnlocks } from '../core/state/unlocks.ts';
import { GameLoop, type GameLoopOptions } from './GameLoop.ts';
import { createGameStore, updateWorkspace, type GameStore } from './gameStore.ts';

const clients: InterpreterClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => client.terminate());
});

/** Game time runs this much faster than real time in tests, so crops grow quickly. */
const FAST_CLOCK = 50;

interface SetupOptions extends GameLoopOptions {
  game?: GameState;
}

function setup(code: string, opsPerSecondOverride: OpsPerSecond = null, options: SetupOptions = {}): { loop: GameLoop; store: GameStore } {
  const store = createGameStore({ game: options.game ?? createGameState(3, undefined, createFullUnlocks()), workspace: createWorkspace(code) });
  const client = new InterpreterClient(createInProcessTransport());
  clients.push(client);
  const loop = new GameLoop(store, client, {
    scheduleFlush: (flush) => flush(),
    now: () => performance.now() * FAST_CLOCK,
    opsPerSecondOverride,
    ...options,
  });
  return { loop, store };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const FARMING_CODE = [
  'while True:',
  '    for i in range(get_world_size()):',
  '        if can_harvest():',
  '            harvest()',
  '        move(North)',
  '    move(East)',
].join('\n');

describe('GameLoop', () => {
  it('runs a farming loop and stops immediately on request', async () => {
    const { loop, store } = setup(FARMING_CODE);
    loop.run();
    await waitFor(() => store.getState().game.inventory.Hay >= 20);
    expect(store.getState().runStatus).toBe('running');

    loop.stop();
    expect(store.getState().runStatus).toBe('idle');
    const stateAtStop = loop.getState();
    await delay(50);
    expect(loop.getState()).toBe(stateAtStop);
  });

  it('steps through statements and exposes variables while paused', async () => {
    const { loop, store } = setup('x = 1\ny = x + 1\nprint(y)');
    loop.step();
    await waitFor(() => store.getState().runStatus === 'paused');
    expect(store.getState().currentLocation?.line).toBe(1);

    loop.step();
    await waitFor(() => store.getState().runStatus === 'paused' && store.getState().currentLocation?.line === 2);
    expect(store.getState().variables?.globals).toEqual({ x: '1' });

    loop.resume();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().console.map((entry) => entry.text)).toEqual(['2', 'Program finished.']);
  });

  it('pauses on breakpoints inside an infinite loop', async () => {
    const { loop, store } = setup('n = 0\nwhile True:\n    n += 1\n    do_a_flip()');
    loop.setBreakpoints(MAIN_FILE_ID, [4]);
    loop.run();
    await waitFor(() => store.getState().runStatus === 'paused');
    expect(store.getState().currentLocation?.line).toBe(4);
    expect(store.getState().variables?.globals).toEqual({ n: '1' });

    loop.resume();
    await waitFor(() => store.getState().runStatus === 'paused' && store.getState().variables?.globals.n === '2');
    loop.stop();
  });

  it('reports syntax and runtime errors with their line', async () => {
    const { loop, store } = setup('x = 1\nif x\n    pass');
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().lastError?.location?.line).toBe(2);
    expect(store.getState().console.at(-1)?.text).toMatch(/^SyntaxError/);

    updateWorkspace(store, (ws) => setFileCode(ws, MAIN_FILE_ID, 'move(North)\nmove("East")'));
    loop.run();
    await waitFor(() => store.getState().lastError?.location?.line === 2 && store.getState().runStatus === 'idle');
    expect(loop.getState().drone.pos).toEqual({ x: 0, y: 1 });
  });

  it('rejects features that are not unlocked yet', async () => {
    const { loop, store } = setup('harvest()\nwhile True:\n    harvest()', null, { game: createGameState() });
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().lastError?.location).toEqual({ file: 'main', line: 2 });
    expect(store.getState().console.at(-1)?.text).toMatch(/^LockedError: while is not unlocked yet/);
  });

  it('buys unlocks with items', () => {
    const start = createGameState();
    const { loop, store } = setup('', null, { game: { ...start, inventory: { ...start.inventory, Hay: 10 } } });
    expect(loop.buyUnlock('Speed')).toBe(false);
    expect(loop.buyUnlock('Loops')).toBe(true);
    expect(store.getState().game.unlocks.Loops).toBe(1);
    expect(store.getState().game.inventory.Hay).toBe(5);
    expect(store.getState().console.at(-1)?.text).toBe('Unlocked Loops.');
  });

  it('paces execution to the drone speed', async () => {
    const { loop } = setup('while True:\n    do_a_flip()', 5000);
    let flips = 0;
    loop.subscribeEvents((event) => {
      if (event.type === 'action') flips++;
    });
    loop.run();
    await delay(400);
    loop.stop();
    // 5000 ops/s at 200 ops per flip is ~10 flips in 400 ms; allow slack for timer jitter and the initial burst.
    expect(flips).toBeGreaterThan(3);
    expect(flips).toBeLessThan(25);
  });

  it('lets game time follow the wall clock, independent of drone speed', async () => {
    let now = 0;
    const { loop, store } = setup('do_a_flip()', null, { now: () => now });
    now = 1500;
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(loop.getState().tick).toBe(1.5 * GAME_TICKS_PER_SECOND);
  });


  it('stops the program when the drone digs into a mine', async () => {
    const game = createGameState(3, undefined, createFullUnlocks());
    const cells = game.mine!.cells.slice();
    cells[0] = { block: 'Stone', damage: 0, entity: null, mine: true };
    const { loop, store } = setup('do_a_flip()\ndig(Down)\ndo_a_flip()', null, { game: { ...game, mine: { ...game.mine!, cells } } });
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().lastError?.location).toEqual({ file: 'main', line: 2 });
    expect(store.getState().console.at(-1)?.text).toMatch(/blown up! \(line 2\)$/);
    expect(loop.getState().mine!.cells[0]!.mine).not.toBe(true);
  });

  describe('code files', () => {
    /** Adds a closed file named `name` to the store's workspace. */
    function addCodeFile(store: GameStore, name: string, code: string): void {
      updateWorkspace(store, (ws: Workspace) => {
        let next = addFile(ws, `id-${name}`);
        const added = next.files.at(-1)!.id;
        next = renameFile(next, added, name);
        next = setFileCode(next, added, code);
        return setFileWindow(next, added, { open: false });
      });
    }

    it('runs any file and lets it import the others', async () => {
      const { loop, store } = setup('import tools\ntools.flip_twice()\nprint(tools.LABEL)');
      addCodeFile(store, 'tools', 'LABEL = "tools ready"\ndef flip_twice():\n    do_a_flip()\n    do_a_flip()');
      let flips = 0;
      loop.subscribeEvents((event) => {
        if (event.type === 'action' && event.action.kind === 'doAFlip') flips++;
      });
      loop.run();
      await waitFor(() => store.getState().runStatus === 'idle');
      expect(flips).toBe(2);
      expect(store.getState().console.map((entry) => entry.text)).toEqual(['tools ready', 'Program finished.']);

      // Running another window runs that file instead.
      const tools = findFileByName(store.getState().workspace, 'tools')!;
      loop.run(tools.id);
      await waitFor(() => store.getState().runStatus === 'idle');
      expect(store.getState().activeFileId).toBe(tools.id);
    });

    it('reports errors in imported files there and opens their window', async () => {
      const { loop, store } = setup('from tools import *\nbroken()');
      addCodeFile(store, 'tools', 'def broken():\n    do_a_flip()\n    move("East")');
      loop.run();
      await waitFor(() => store.getState().runStatus === 'idle');
      expect(store.getState().lastError?.location).toEqual({ file: 'tools', line: 3 });
      expect(store.getState().console.at(-1)?.text).toMatch(/\(tools, line 3\)$/);
      expect(findFileByName(store.getState().workspace, 'tools')?.open).toBe(true);
    });

    it('pauses on breakpoints inside imported files', async () => {
      const { loop, store } = setup('import tools\ntools.go()');
      addCodeFile(store, 'tools', 'def go():\n    do_a_flip()\n    do_a_flip()');
      loop.setBreakpoints(findFileByName(store.getState().workspace, 'tools')!.id, [3]);
      loop.run();
      await waitFor(() => store.getState().runStatus === 'paused');
      expect(store.getState().currentLocation).toEqual({ file: 'tools', line: 3 });
      loop.stop();
    });
  });
});
