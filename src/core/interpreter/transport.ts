import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.ts';
import { ExecutionScheduler } from './scheduler.ts';

/** Message channel between the main thread and the interpreter. */
export interface InterpreterTransport {
  postMessage(message: MainToWorkerMessage): void;
  setMessageHandler(handler: (message: WorkerToMainMessage) => void): void;
  terminate(): void;
}

/** The production transport: player code runs in a dedicated Web Worker. */
export function createWorkerTransport(): InterpreterTransport {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  return {
    postMessage: (message) => worker.postMessage(message),
    setMessageHandler: (handler) => {
      worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => handler(event.data);
    },
    terminate: () => worker.terminate(),
  };
}

/**
 * Runs the scheduler on the current thread with asynchronous message delivery, mirroring the worker's
 * behaviour. For tests and headless tooling only; it must never be used to run player code in the UI.
 */
export function createInProcessTransport(): InterpreterTransport {
  let handler: (message: WorkerToMainMessage) => void = () => {};
  let terminated = false;
  const deliver = (fn: () => void) => {
    setTimeout(() => {
      if (!terminated) fn();
    }, 0);
  };
  const scheduler = new ExecutionScheduler({
    post: (message) => deliver(() => handler(message)),
    now: () => performance.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  return {
    postMessage: (message) => deliver(() => scheduler.handle(message)),
    setMessageHandler: (next) => {
      handler = next;
    },
    terminate: () => {
      terminated = true;
      scheduler.handle({ type: 'stop' });
    },
  };
}
