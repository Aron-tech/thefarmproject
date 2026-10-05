/// <reference lib="webworker" />
import type { MainToWorkerMessage, WorkerToMainMessage } from './protocol.ts';

declare const self: DedicatedWorkerGlobalScope;

function post(message: WorkerToMainMessage): void {
  self.postMessage(message);
}

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  switch (message.type) {
    case 'ping':
      post({ type: 'pong', sentAt: message.sentAt });
      break;
  }
};
