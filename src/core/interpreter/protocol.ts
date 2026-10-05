import type { ActionResult, DroneAction } from '../state/types.ts';
import type { VariableSnapshot } from './evaluator.ts';

/** Execution speed in ticks (operations) per second; null runs as fast as possible. */
export type OpsPerSecond = number | null;

export interface RunOptions {
  /** Game clock value the run continues from, so time stays monotonic across runs. */
  startTicks: number;
  opsPerSecond: OpsPerSecond;
  breakpoints: number[];
  /** Pause before the first statement (used to start a run in step mode). */
  pauseAtStart: boolean;
}

/** Messages sent from the main thread to the interpreter worker. */
export type MainToWorkerMessage =
  | ({ type: 'run'; runId: number; code: string } & RunOptions)
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step' }
  | { type: 'setBreakpoints'; lines: number[] }
  | { type: 'setSpeed'; opsPerSecond: OpsPerSecond }
  | { type: 'actionResult'; runId: number; requestId: number; result: ActionResult };

/** Messages sent from the interpreter worker to the main thread. Every message names the run it belongs to. */
export type WorkerToMainMessage =
  | { type: 'action'; runId: number; requestId: number; action: DroneAction; ticks: number }
  | { type: 'progress'; runId: number; ticks: number; line: number }
  | { type: 'print'; runId: number; ticks: number; text: string }
  | { type: 'paused'; runId: number; ticks: number; line: number; variables: VariableSnapshot }
  | { type: 'resumed'; runId: number }
  | { type: 'error'; runId: number; ticks: number; message: string; line: number | null }
  | { type: 'finished'; runId: number; ticks: number };
