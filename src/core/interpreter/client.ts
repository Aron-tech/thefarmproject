import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.ts';

/** Main-thread wrapper around the interpreter Web Worker. */
export class InterpreterClient {
  private readonly worker: Worker;

  constructor() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }

  /** Round-trips a ping through the worker and resolves with the latency in ms. */
  ping(): Promise<number> {
    return new Promise((resolve) => {
      const handleMessage = (event: MessageEvent<WorkerToMainMessage>) => {
        if (event.data.type === 'pong') {
          this.worker.removeEventListener('message', handleMessage);
          resolve(performance.now() - event.data.sentAt);
        }
      };
      this.worker.addEventListener('message', handleMessage);
      this.send({ type: 'ping', sentAt: performance.now() });
    });
  }

  terminate(): void {
    this.worker.terminate();
  }

  private send(message: MainToWorkerMessage): void {
    this.worker.postMessage(message);
  }
}
