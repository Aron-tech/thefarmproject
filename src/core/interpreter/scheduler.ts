import { ACTION_COSTS } from '../state/constants.ts';
import type { ActionResult, DroneAction } from '../state/types.ts';
import { PyError } from './errors.ts';
import type { Interpreter } from './evaluator.ts';
import { createGameInterpreter } from './program.ts';
import type { BreakpointMap, CodeLocation, MainToWorkerMessage, OpsPerSecond, RunOptions, WorkerToMainMessage } from './protocol.ts';
import { OP_SIGNAL, type Gen, type ResumeValue } from './values.ts';

/** Longest stretch of synchronous interpretation before yielding to the event loop (keeps `stop` responsive). */
const SLICE_MS = 12;
/** Cap on accumulated budget, so a throttled tab does not burst through thousands of ops at once. */
const MAX_BURST_SECONDS = 0.1;
const MAX_SLEEP_MS = 50;
/** How often (in signals) the wall clock is checked during a slice. */
const CLOCK_CHECK_INTERVAL = 1024;

export interface SchedulerHost {
  post(message: WorkerToMainMessage): void;
  now(): number;
  sleep(ms: number): Promise<void>;
}

interface ActiveRun {
  id: number;
  interpreter: Interpreter;
  generator: Gen<void>;
  ticks: number;
  /** Location of the statement currently executing. */
  location: CodeLocation;
  opsPerSecond: OpsPerSecond;
  budget: number;
  breakpoints: Map<string, Set<number>>;
  paused: boolean;
  stepping: boolean;
  resumeValue: ResumeValue;
  pendingAction: DroneAction | null;
  pendingRequest: { requestId: number; resolve: (result: ActionResult) => void } | null;
  wake: (() => void) | null;
}

type SliceOutcome = 'done' | 'action' | 'budget' | 'slice' | 'paused';

function toBreakpointSets(breakpoints: BreakpointMap): Map<string, Set<number>> {
  return new Map(Object.entries(breakpoints).map(([file, lines]) => [file, new Set(lines)]));
}

/** Error location; errors in the file being run carry no file name. */
function errorLocation(error: PyError, entry: string): CodeLocation | null {
  return error.line === null ? null : { file: error.file ?? entry, line: error.line };
}

/**
 * Drives an interpreter generator inside the worker: meters ticks against the configured speed,
 * forwards drone actions to the main thread and handles pause / step / breakpoints / stop.
 */
export class ExecutionScheduler {
  private readonly host: SchedulerHost;
  private active: ActiveRun | null = null;
  private nextRequestId = 1;

  constructor(host: SchedulerHost) {
    this.host = host;
  }

  handle(message: MainToWorkerMessage): void {
    const run = this.active;
    switch (message.type) {
      case 'run':
        this.start(message.runId, message.entry, message.files, message);
        return;
      case 'stop':
        if (run) this.end(run);
        return;
      case 'pause':
        if (run && !run.paused) this.enterPause(run);
        return;
      case 'resume':
        if (run?.paused) this.leavePause(run, false);
        return;
      case 'step':
        if (run?.paused) this.leavePause(run, true);
        return;
      case 'setBreakpoints':
        if (run) run.breakpoints = toBreakpointSets(message.breakpoints);
        return;
      case 'setSpeed':
        if (run) {
          run.opsPerSecond = message.opsPerSecond;
          run.budget = 0;
        }
        return;
      case 'actionResult':
        if (run && run.id === message.runId && run.pendingRequest?.requestId === message.requestId) {
          const { resolve } = run.pendingRequest;
          run.pendingRequest = null;
          resolve(message.result);
        }
        return;
    }
  }

  private start(runId: number, entry: string, files: Readonly<Record<string, string>>, options: RunOptions): void {
    if (this.active) this.end(this.active);

    let run: ActiveRun | null = null;
    let interpreter: Interpreter;
    try {
      interpreter = createGameInterpreter(files[entry] ?? '', {
        getTickCount: () => run?.ticks ?? options.startTicks,
        unlocks: options.unlocks,
        fileName: entry,
        files,
      });
    } catch (error) {
      const pyError = error instanceof PyError ? error : new PyError('SyntaxError', String(error));
      const location = errorLocation(pyError, entry);
      this.host.post({ type: 'error', runId, ticks: options.startTicks, message: pyError.format(), location });
      return;
    }

    run = {
      id: runId,
      interpreter,
      generator: interpreter.run(),
      ticks: options.startTicks,
      location: { file: entry, line: 0 },
      opsPerSecond: options.opsPerSecond,
      budget: 0,
      breakpoints: toBreakpointSets(options.breakpoints),
      paused: false,
      stepping: options.pauseAtStart,
      resumeValue: undefined,
      pendingAction: null,
      pendingRequest: null,
      wake: null,
    };
    this.active = run;
    void this.loop(run);
  }

  private end(run: ActiveRun): void {
    if (this.active === run) this.active = null;
    run.wake?.();
  }

  private enterPause(run: ActiveRun): void {
    run.paused = true;
    run.stepping = false;
    this.host.post({
      type: 'paused',
      runId: run.id,
      ticks: run.ticks,
      location: run.location,
      variables: run.interpreter.getVariables(),
    });
  }

  private leavePause(run: ActiveRun, step: boolean): void {
    run.paused = false;
    run.stepping = step;
    this.host.post({ type: 'resumed', runId: run.id });
    run.wake?.();
  }

  private async loop(run: ActiveRun): Promise<void> {
    let lastRefill = this.host.now();
    let sliceStart = lastRefill;

    while (this.active === run) {
      if (run.paused) {
        await new Promise<void>((resolve) => {
          run.wake = resolve;
        });
        run.wake = null;
        lastRefill = sliceStart = this.host.now();
        continue;
      }

      const now = this.host.now();
      if (run.opsPerSecond !== null) {
        const refill = ((now - lastRefill) * run.opsPerSecond) / 1000;
        run.budget = Math.min(run.budget + refill, run.opsPerSecond * MAX_BURST_SECONDS);
      }
      lastRefill = now;

      const outcome: SliceOutcome = run.opsPerSecond === null || run.budget > 0 ? this.runSlice(run, sliceStart) : 'budget';
      if (outcome === 'done') return;
      if (outcome === 'action') {
        run.resumeValue = await this.requestAction(run);
        continue;
      }
      if (outcome === 'paused') continue;

      this.host.post({ type: 'progress', runId: run.id, ticks: run.ticks, location: run.location });
      let wait = 0;
      if (outcome === 'budget' && run.opsPerSecond !== null && run.opsPerSecond > 0) {
        wait = Math.min(MAX_SLEEP_MS, Math.max(1, ((1 - run.budget) * 1000) / run.opsPerSecond));
      }
      await this.host.sleep(wait);
      sliceStart = this.host.now();
    }
  }

  /** Runs the generator synchronously until it needs the main thread, runs out of budget or time, or pauses. */
  private runSlice(run: ActiveRun, sliceStart: number): SliceOutcome {
    let counter = 0;
    try {
      for (;;) {
        const step = run.generator.next(run.resumeValue);
        run.resumeValue = undefined;
        if (step.done) {
          this.host.post({ type: 'finished', runId: run.id, ticks: run.ticks });
          this.end(run);
          return 'done';
        }

        const signal = step.value;
        if (typeof signal === 'number') {
          run.ticks++;
          run.budget--;
          if (signal !== OP_SIGNAL) {
            const file = run.interpreter.currentFile;
            if (run.location.line !== signal || run.location.file !== file) run.location = { file, line: signal };
            if (run.stepping || run.breakpoints.get(file)?.has(signal)) {
              this.enterPause(run);
              return 'paused';
            }
          }
        } else if (signal.kind === 'print') {
          this.host.post({ type: 'print', runId: run.id, ticks: run.ticks, text: signal.text });
        } else {
          const cost = ACTION_COSTS[signal.action.kind];
          run.ticks += cost;
          run.budget -= cost;
          run.pendingAction = signal.action;
          return 'action';
        }

        if (run.opsPerSecond !== null && run.budget <= 0) return 'budget';
        if (++counter % CLOCK_CHECK_INTERVAL === 0 && this.host.now() - sliceStart > SLICE_MS) return 'slice';
      }
    } catch (error) {
      const pyError = error instanceof PyError ? error : new PyError('RuntimeError', String(error));
      const location = errorLocation(pyError, run.interpreter.fileName);
      this.host.post({ type: 'error', runId: run.id, ticks: run.ticks, message: pyError.format(), location });
      this.end(run);
      return 'done';
    }
  }

  private requestAction(run: ActiveRun): Promise<ActionResult> {
    const action = run.pendingAction;
    run.pendingAction = null;
    if (!action) return Promise.resolve(null);
    const requestId = this.nextRequestId++;
    return new Promise((resolve) => {
      run.pendingRequest = { requestId, resolve };
      this.host.post({ type: 'action', runId: run.id, requestId, action, ticks: run.ticks });
    });
  }
}
