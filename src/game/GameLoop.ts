import type { InterpreterClient } from '../core/interpreter/client.ts';
import type { BreakpointMap, CodeLocation, OpsPerSecond, WorkerToMainMessage } from '../core/interpreter/protocol.ts';
import { applyAction } from '../core/state/actions.ts';
import { findFile, findFileByName, MAIN_FILE_ID, setFileBreakpoints, setFileWindow, workspaceSources, type Workspace } from '../core/state/codeFiles.ts';
import { GAME_TICKS_PER_SECOND } from '../core/state/constants.ts';
import type { ActionResult, DroneAction, GameState, UnlockId } from '../core/state/types.ts';
import { buyUnlock, getOpsPerSecond } from '../core/state/unlocks.ts';
import type { ConsoleEntry, GameStore, GameStoreState } from './gameStore.ts';

const MAX_CONSOLE_ENTRIES = 500;

function breakpointMap(workspace: Workspace): BreakpointMap {
  return Object.fromEntries(workspace.files.filter((file) => file.breakpoints.length > 0).map((file) => [file.name, file.breakpoints]));
}

const CLOCK_INTERVAL_MS = 100;
/** A longer gap (e.g. a throttled background tab) only advances the clock by this much. */
const MAX_CLOCK_STEP_MS = 5000;

/** Things that happened in the world, for animations and effects. */
export type GameEvent =
  | { type: 'action'; action: DroneAction; result: ActionResult; before: GameState; after: GameState }
  | { type: 'print'; text: string };

export type FlushScheduler = (flush: () => void) => void;

const defaultFlushScheduler: FlushScheduler =
  typeof requestAnimationFrame === 'function' ? (flush) => requestAnimationFrame(flush) : (flush) => setTimeout(flush, 16);

export interface GameLoopOptions {
  scheduleFlush?: FlushScheduler;
  /** Wall clock in milliseconds; game time follows it. */
  now?: () => number;
  /** Fixed drone speed instead of the one earned through unlocks and power (tests only). */
  opsPerSecondOverride?: OpsPerSecond;
}

/**
 * Connects the interpreter to the game state. The loop holds the authoritative GameState, applies
 * drone actions as they arrive and publishes to the store at most once per frame, so fast runs
 * do not re-render the UI for every action. Game time follows the wall clock; the drone's speed
 * follows the Speed unlock and power, and is pushed to the interpreter whenever it changes.
 */
export class GameLoop {
  private readonly store: GameStore;
  private readonly client: InterpreterClient;
  private readonly scheduleFlush: FlushScheduler;
  private readonly now: () => number;
  private readonly opsPerSecondOverride: OpsPerSecond | undefined;
  private state: GameState;
  private lastClockTime: number;
  private sentOpsPerSecond: OpsPerSecond | undefined;
  private pendingPatch: Partial<GameStoreState> = {};
  private pendingConsole: ConsoleEntry[] = [];
  private flushScheduled = false;
  private nextConsoleId = 1;
  private readonly eventListeners = new Set<(event: GameEvent) => void>();

  constructor(store: GameStore, client: InterpreterClient, options: GameLoopOptions = {}) {
    this.store = store;
    this.client = client;
    this.scheduleFlush = options.scheduleFlush ?? defaultFlushScheduler;
    this.now = options.now ?? (() => performance.now());
    this.opsPerSecondOverride = options.opsPerSecondOverride;
    this.state = store.getState().game;
    this.lastClockTime = this.now();
    client.onMessage((message) => this.handleMessage(message));
  }

  /** The latest state, which may be ahead of what the store has published. */
  getState(): GameState {
    return this.state;
  }

  subscribeEvents(listener: (event: GameEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Lets game time pass in real time, so crops grow at the same pace however fast the drone is.
   * Actions also bring the clock up to date, so it stays exact between timer ticks.
   */
  startClock(): () => void {
    const timer = setInterval(() => {
      this.advanceClock();
      this.scheduleUpdate();
    }, CLOCK_INTERVAL_MS);
    return () => clearInterval(timer);
  }

  /** Drone speed right now: from the Speed unlock and power, unless overridden. */
  getOpsPerSecond(): OpsPerSecond {
    return this.opsPerSecondOverride !== undefined ? this.opsPerSecondOverride : getOpsPerSecond(this.state);
  }

  isPaused(): boolean {
    return this.store.getState().runStatus === 'paused';
  }

  /** Runs a code file (by default the active one); other files are available to it through import. */
  run(fileId = this.store.getState().activeFileId): void {
    this.startRun(false, fileId);
  }

  /** Starts a run paused at its first statement, or advances a paused run by one statement. */
  step(fileId = this.store.getState().activeFileId): void {
    const { runStatus } = this.store.getState();
    if (runStatus === 'idle') this.startRun(true, fileId);
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
    this.patch({ runStatus: 'idle', currentLocation: null, variables: null }, true);
  }

  setBreakpoints(fileId: string, lines: number[]): void {
    const workspace = setFileBreakpoints(this.store.getState().workspace, fileId, lines);
    this.store.setState({ workspace });
    this.client.setBreakpoints(breakpointMap(workspace));
  }

  /** Buys the next level of an unlock; returns false when it cannot be bought. */
  buyUnlock(id: UnlockId): boolean {
    this.advanceClock();
    const next = buyUnlock(this.state, id);
    if (!next) return false;
    this.state = next;
    this.log('info', `Unlocked ${id}${next.unlocks[id] > 1 ? ` ${next.unlocks[id]}` : ''}.`);
    this.syncSpeed();
    this.patch({}, true);
    return true;
  }

  /** Replaces the whole game state (reset / import). Stops any running program first. */
  replaceGame(state: GameState): void {
    this.stop();
    this.state = state;
    this.lastClockTime = this.now();
    this.patch({}, true);
  }

  /** Loads a save: its farm and its code files. */
  loadSave(state: GameState, workspace: Workspace): void {
    this.replaceGame(state);
    this.store.setState({ workspace, activeFileId: MAIN_FILE_ID, runningFileId: null, lastError: null, currentLocation: null });
  }

  clearConsole(): void {
    this.pendingConsole = [];
    this.store.setState({ console: [] });
  }

  private startRun(pauseAtStart: boolean, fileId: string): void {
    const { workspace, runStatus } = this.store.getState();
    const file = findFile(workspace, fileId);
    if (!file) return;
    if (runStatus !== 'idle') this.client.stop();
    this.advanceClock();
    const opsPerSecond = this.getOpsPerSecond();
    this.sentOpsPerSecond = opsPerSecond;
    this.client.run(file.name, workspaceSources(workspace), {
      startTicks: 0,
      opsPerSecond,
      breakpoints: breakpointMap(workspace),
      pauseAtStart,
      unlocks: this.state.unlocks,
    });
    this.patch(
      { runStatus: 'running', runningFileId: file.id, activeFileId: file.id, currentLocation: null, lastError: null, variables: null },
      true,
    );
  }

  /** Opens (and restores) the window of a file the program stopped in, so the line can be seen. */
  private revealFile(location: CodeLocation | null): void {
    if (!location) return;
    const { workspace } = this.store.getState();
    const file = findFileByName(workspace, location.file);
    if (!file || (file.open && !file.minimized)) return;
    this.store.setState({ workspace: setFileWindow(workspace, file.id, { open: true, minimized: false }) });
  }

  private handleMessage(message: WorkerToMainMessage): void {
    switch (message.type) {
      case 'action': {
        this.advanceClock();
        const before = this.state;
        const outcome = applyAction(before, message.action, before.tick);
        this.state = outcome.state;
        this.syncSpeed();
        this.client.respondToAction(message.runId, message.requestId, outcome.result);
        this.emit({ type: 'action', action: message.action, result: outcome.result, before, after: outcome.state });
        this.scheduleUpdate();
        return;
      }
      case 'progress':
        this.patch({ currentLocation: message.location });
        return;
      case 'print':
        this.log('print', message.text);
        this.emit({ type: 'print', text: message.text });
        return;
      case 'paused':
        this.revealFile(message.location);
        this.patch({ runStatus: 'paused', currentLocation: message.location, variables: message.variables }, true);
        return;
      case 'resumed':
        this.patch({ runStatus: 'running', variables: null }, true);
        return;
      case 'error':
        this.log('error', message.message);
        this.revealFile(message.location);
        this.patch(
          { runStatus: 'idle', currentLocation: null, lastError: { message: message.message, location: message.location }, variables: null },
          true,
        );
        return;
      case 'finished':
        this.log('info', 'Program finished.');
        this.patch({ runStatus: 'idle', currentLocation: null, variables: null }, true);
        return;
    }
  }

  private advanceClock(): void {
    const now = this.now();
    const elapsed = Math.min(Math.max(0, now - this.lastClockTime), MAX_CLOCK_STEP_MS);
    this.lastClockTime = now;
    if (elapsed > 0) this.state = { ...this.state, tick: this.state.tick + (elapsed * GAME_TICKS_PER_SECOND) / 1000 };
  }

  /** Tells a running program about speed changes (a Speed unlock, power running out). */
  private syncSpeed(): void {
    const opsPerSecond = this.getOpsPerSecond();
    if (opsPerSecond === this.sentOpsPerSecond) return;
    this.sentOpsPerSecond = opsPerSecond;
    if (this.store.getState().runStatus !== 'idle') this.client.setSpeed(opsPerSecond);
  }

  private emit(event: GameEvent): void {
    for (const listener of this.eventListeners) listener(event);
  }

  log(kind: ConsoleEntry['kind'], text: string): void {
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
