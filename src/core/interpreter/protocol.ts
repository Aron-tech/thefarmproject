import type { ActionResult, DroneAction, UnlockLevels } from '../state/types.ts';
import type { VariableSnapshot } from './evaluator.ts';

/** Execution speed in ticks (operations) per second; null runs as fast as possible (tests and tooling only). */
export type OpsPerSecond = number | null;

/** Breakpoint lines per code file name. */
export type BreakpointMap = Readonly<Record<string, readonly number[]>>;

/** A source position in one of the player's code files. */
export interface CodeLocation {
  file: string;
  line: number;
}

export interface RunOptions {
  /** Game clock value the run continues from, so time stays monotonic across runs. */
  startTicks: number;
  opsPerSecond: OpsPerSecond;
  breakpoints: BreakpointMap;
  /** Pause before the first statement (used to start a run in step mode). */
  pauseAtStart: boolean;
  /** Unlock levels at run start; locked features are rejected before the program runs. */
  unlocks?: UnlockLevels;
}

/** Messages sent from the main thread to the interpreter worker. */
export type MainToWorkerMessage =
  | ({ type: 'run'; runId: number; entry: string; files: Readonly<Record<string, string>> } & RunOptions)
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step' }
  | { type: 'setBreakpoints'; breakpoints: BreakpointMap }
  | { type: 'setSpeed'; opsPerSecond: OpsPerSecond }
  | { type: 'actionResult'; runId: number; requestId: number; result: ActionResult };

/** Messages sent from the interpreter worker to the main thread. Every message names the run it belongs to. */
export type WorkerToMainMessage =
  | { type: 'action'; runId: number; requestId: number; action: DroneAction; ticks: number }
  | { type: 'progress'; runId: number; ticks: number; location: CodeLocation }
  | { type: 'print'; runId: number; ticks: number; text: string }
  | { type: 'paused'; runId: number; ticks: number; location: CodeLocation; variables: VariableSnapshot }
  | { type: 'resumed'; runId: number }
  | { type: 'error'; runId: number; ticks: number; message: string; location: CodeLocation | null }
  | { type: 'finished'; runId: number; ticks: number };
