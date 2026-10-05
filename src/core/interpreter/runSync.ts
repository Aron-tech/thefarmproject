import { ACTION_COSTS } from '../state/constants.ts';
import type { ActionResult, DroneAction } from '../state/types.ts';
import { PyError } from './errors.ts';
import { createGameInterpreter } from './program.ts';
import type { ResumeValue } from './values.ts';

export interface SyncRunOptions {
  /** Answers drone actions; defaults to returning null. */
  onAction?: (action: DroneAction, ticks: number) => ActionResult;
  /** Stops the run (without error) once this many ticks have elapsed. */
  maxTicks?: number;
}

export interface SyncRunResult {
  output: string[];
  ticks: number;
  error: PyError | null;
  /** False when the run was cut off by maxTicks. */
  finished: boolean;
}

/**
 * Runs player code to completion on the current thread. Intended for tests and headless tooling only;
 * the game itself always runs code in the interpreter worker.
 */
export function runSync(source: string, options: SyncRunOptions = {}): SyncRunResult {
  const output: string[] = [];
  const maxTicks = options.maxTicks ?? 1_000_000;
  let ticks = 0;

  try {
    const generator = createGameInterpreter(source, () => ticks).run();
    let resume: ResumeValue = undefined;
    for (;;) {
      const step = generator.next(resume);
      resume = undefined;
      if (step.done) return { output, ticks, error: null, finished: true };
      const signal = step.value;
      if (typeof signal === 'number') {
        ticks++;
      } else if (signal.kind === 'print') {
        output.push(signal.text);
      } else {
        ticks += ACTION_COSTS[signal.action.kind];
        resume = options.onAction ? options.onAction(signal.action, ticks) : null;
      }
      if (ticks >= maxTicks) return { output, ticks, error: null, finished: false };
    }
  } catch (error) {
    if (error instanceof PyError) return { output, ticks, error, finished: true };
    throw error;
  }
}
