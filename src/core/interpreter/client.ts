import type { ActionResult } from '../state/types.ts';
import type { OpsPerSecond, RunOptions, WorkerToMainMessage } from './protocol.ts';
import type { InterpreterTransport } from './transport.ts';

/** Main-thread handle to the interpreter: typed commands and run-scoped message filtering. */
export class InterpreterClient {
  private readonly transport: InterpreterTransport;
  private currentRunId = 0;
  private handler: (message: WorkerToMainMessage) => void = () => {};

  constructor(transport: InterpreterTransport) {
    this.transport = transport;
    transport.setMessageHandler((message) => {
      // Messages from a run that was stopped or replaced are stale and dropped.
      if (message.runId === this.currentRunId) this.handler(message);
    });
  }

  onMessage(handler: (message: WorkerToMainMessage) => void): void {
    this.handler = handler;
  }

  run(code: string, options: RunOptions): number {
    this.currentRunId++;
    this.transport.postMessage({ type: 'run', runId: this.currentRunId, code, ...options });
    return this.currentRunId;
  }

  stop(): void {
    this.currentRunId++;
    this.transport.postMessage({ type: 'stop' });
  }

  pause(): void {
    this.transport.postMessage({ type: 'pause' });
  }

  resume(): void {
    this.transport.postMessage({ type: 'resume' });
  }

  step(): void {
    this.transport.postMessage({ type: 'step' });
  }

  setBreakpoints(lines: number[]): void {
    this.transport.postMessage({ type: 'setBreakpoints', lines });
  }

  setSpeed(opsPerSecond: OpsPerSecond): void {
    this.transport.postMessage({ type: 'setSpeed', opsPerSecond });
  }

  respondToAction(runId: number, requestId: number, result: ActionResult): void {
    if (runId !== this.currentRunId) return;
    this.transport.postMessage({ type: 'actionResult', runId, requestId, result });
  }

  terminate(): void {
    this.transport.terminate();
  }
}
