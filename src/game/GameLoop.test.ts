import { afterEach, describe, expect, it } from 'vitest';
import { InterpreterClient } from '../core/interpreter/client.ts';
import type { OpsPerSecond } from '../core/interpreter/protocol.ts';
import { createInProcessTransport } from '../core/interpreter/transport.ts';
import { createGameState } from '../core/state/gameState.ts';
import { GameLoop } from './GameLoop.ts';
import { createGameStore, DEFAULT_CODE, type GameStore } from './gameStore.ts';

const clients: InterpreterClient[] = [];

afterEach(() => {
  clients.splice(0).forEach((client) => client.terminate());
});

function setup(code: string, speed: OpsPerSecond = null): { loop: GameLoop; store: GameStore } {
  const store = createGameStore({ game: createGameState(3), code, speed });
  const client = new InterpreterClient(createInProcessTransport());
  clients.push(client);
  return { loop: new GameLoop(store, client, (flush) => flush()), store };
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('GameLoop', () => {
  it('runs the MVP farming loop and stops immediately on request', async () => {
    const { loop, store } = setup(DEFAULT_CODE);
    loop.run();
    await waitFor(() => store.getState().game.inventory.Hay >= 20);
    expect(store.getState().runStatus).toBe('running');

    loop.stop();
    expect(store.getState().runStatus).toBe('idle');
    const tickAtStop = loop.getState().tick;
    await delay(50);
    expect(loop.getState().tick).toBe(tickAtStop);
  });

  it('steps through statements and exposes variables while paused', async () => {
    const { loop, store } = setup('x = 1\ny = x + 1\nprint(y)');
    loop.step();
    await waitFor(() => store.getState().runStatus === 'paused');
    expect(store.getState().currentLine).toBe(1);

    loop.step();
    await waitFor(() => store.getState().runStatus === 'paused' && store.getState().currentLine === 2);
    expect(store.getState().variables?.globals).toEqual({ x: '1' });

    loop.resume();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().console.map((entry) => entry.text)).toEqual(['2', 'Program finished.']);
  });

  it('pauses on breakpoints inside an infinite loop', async () => {
    const { loop, store } = setup('n = 0\nwhile True:\n    n += 1\n    do_a_flip()');
    loop.setBreakpoints([4]);
    loop.run();
    await waitFor(() => store.getState().runStatus === 'paused');
    expect(store.getState().currentLine).toBe(4);
    expect(store.getState().variables?.globals).toEqual({ n: '1' });

    loop.resume();
    await waitFor(() => store.getState().runStatus === 'paused' && store.getState().variables?.globals.n === '2');
    loop.stop();
  });

  it('reports syntax and runtime errors with their line', async () => {
    const { loop, store } = setup('x = 1\nif x\n    pass');
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    expect(store.getState().errorLine).toBe(2);
    expect(store.getState().console.at(-1)?.text).toMatch(/^SyntaxError/);

    store.setState({ code: 'move(North)\nmove("East")' });
    loop.run();
    await waitFor(() => store.getState().errorLine === 2 && store.getState().runStatus === 'idle');
    expect(loop.getState().drone.pos).toEqual({ x: 0, y: 1 });
  });

  it('paces execution to the configured speed', async () => {
    const { loop } = setup('while True:\n    do_a_flip()', 1000);
    loop.run();
    await delay(400);
    loop.stop();
    const ticks = loop.getState().tick;
    // ~400 ticks expected at 1000 ops/s; allow generous slack for timer jitter and the initial burst.
    expect(ticks).toBeGreaterThan(100);
    expect(ticks).toBeLessThan(900);
  });

  it('keeps the game clock monotonic across runs', async () => {
    const { loop, store } = setup('do_a_flip()');
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle');
    const first = loop.getState().tick;
    loop.run();
    await waitFor(() => store.getState().runStatus === 'idle' && loop.getState().tick > first);
    expect(loop.getState().tick).toBe(first * 2);
  });
});
