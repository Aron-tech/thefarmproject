import type { InterpreterClient } from '../core/interpreter/client.ts';
import type { OpsPerSecond, WorkerToMainMessage } from '../core/interpreter/protocol.ts';
import { applyAction } from '../core/state/actions.ts';
import type { GameState } from '../core/state/types.ts';
import type { ConsoleEntry, GameStore, GameStoreState } from './gameStore.ts';

const MAX_CONSOLE_ENTRIES = 500;

export type FlushScheduler = (flush: () => void) => void;

const defaultFlushScheduler: FlushScheduler =
  typeof requestAnimationFrame === 'function' ? (flush) => requestAnimationFrame(flush) : (flush) => setTimeout(flush, 16);

/**
 * Connects the interpreter to the game state. The loop holds the authoritative GameState, applies
 * drone actions as they arrive and publishes to the store at most once per frame, so fast runs
 * do not re-render the UI for every action.
 */
export class GameLoop {
  private readonly store: GameStore;
  private readonly client: InterpreterClient;
  private readonly scheduleFlush: FlushScheduler;
  private state: GameState;
  private pendingPatch: Partial<GameStoreState> = {};
  private pendingConsole: ConsoleEntry[] = [];
  private flushScheduled = false;
  private nextConsoleId = 1;

  constructor(store: GameStore, client: InterpreterClient, scheduleFlush: FlushScheduler = defaultFlushScheduler) {
    this.store = store;
    this.client = client;
    this.scheduleFlush = scheduleFlush;
    this.state = store.getState().game;
    client.onMessage((message) => this.handleMessage(message));
  }

  /** The latest state, which may be ahead of what the store has published. */
  getState(): GameState {
    return this.state;
  }

  run(): void {
    this.startRun(false);
  }

  /** Starts a run paused at its first statement, or advances a paused run by one statement. */
  step(): void {
    const { runStatus } = this.store.getState();
    if (runStatus === 'idle') this.startRun(true);
    else if (runStatus === 'paused') this.client.step();
  }

  pause(): void {
    if (this.store.getState().runStatus === 'running') this.client.pause();
  }

  resume(): void {
    if (this.store.getState().runStatus === 'paused') this.client.resume();
  }

  stop(): void {
    if (this.store.getState().runStatus === 'idle') return;
    this.client.stop();
    this.log('info', 'Stopped.');
    this.patch({ runStatus: 'idle', currentLine: null, variables: null }, true);
  }

  setSpeed(speed: OpsPerSecond): void {
    this.client.setSpeed(speed);
    this.store.setState({ speed });
  }

  setBreakpoints(lines: number[]): void {
    this.client.setBreakpoints(lines);
    this.store.setState({ breakpoints: lines });
  }

  /** Replaces the whole game state (reset / import). Stops any running program first. */
  replaceGame(state: GameState): void {
    this.stop();
    this.state = state;
    this.patch({}, true);
  }

  clearConsole(): void {
    this.pendingConsole = [];
    this.store.setState({ console: [] });
  }

  private startRun(pauseAtStart: boolean): void {
    const { code, speed, breakpoints, runStatus } = this.store.getState();
    if (runStatus !== 'idle') this.client.stop();
    this.client.run(code, { startTicks: this.state.tick, opsPerSecond: speed, breakpoints, pauseAtStart });
    this.patch({ runStatus: 'running', currentLine: null, errorLine: null, variables: null }, true);
  }

  private handleMessage(message: WorkerToMainMessage): void {
    switch (message.type) {
      case 'action': {
        const outcome = applyAction(this.state, message.action, message.ticks);
        this.state = outcome.state;
        this.client.respondToAction(message.runId, message.requestId, outcome.result);
        this.scheduleUpdate();
        return;
      }
      case 'progress':
        this.advanceClock(message.ticks);
        this.patch({ currentLine: message.line });
        return;
      case 'print':
        this.log('print', message.text);
        return;
      case 'paused':
        this.advanceClock(message.ticks);
        this.patch({ runStatus: 'paused', currentLine: message.line, variables: message.variables }, true);
        return;
      case 'resumed':
        this.patch({ runStatus: 'running', variables: null }, true);
        return;
      case 'error':
        this.advanceClock(message.ticks);
        this.log('error', message.message);
        this.patch({ runStatus: 'idle', currentLine: null, errorLine: message.line, variables: null }, true);
        return;
      case 'finished':
        this.advanceClock(message.ticks);
        this.log('info', 'Program finished.');
        this.patch({ runStatus: 'idle', currentLine: null, variables: null }, true);
        return;
    }
  }

  private advanceClock(ticks: number): void {
    if (ticks > this.state.tick) this.state = { ...this.state, tick: ticks };
  }

  private log(kind: ConsoleEntry['kind'], text: string): void {
    this.pendingConsole.push({ id: this.nextConsoleId++, kind, text });
    this.scheduleUpdate();
  }

  /** Queues a store update; `immediate` publishes synchronously (used for run-status changes). */
  private patch(patch: Partial<GameStoreState>, immediate = false): void {
    Object.assign(this.pendingPatch, patch);
    if (immediate) this.flush();
    else this.scheduleUpdate();
  }

  private scheduleUpdate(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    this.scheduleFlush(() => this.flush());
  }

  private flush(): void {
    this.flushScheduled = false;
    const update: Partial<GameStoreState> = { ...this.pendingPatch, game: this.state };
    if (this.pendingConsole.length > 0) {
      update.console = [...this.store.getState().console, ...this.pendingConsole].slice(-MAX_CONSOLE_ENTRIES);
      this.pendingConsole = [];
    }
    this.pendingPatch = {};
    this.store.setState(update);
  }
}
