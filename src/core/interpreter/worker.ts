/// <reference lib="webworker" />
import type { MainToWorkerMessage } from './protocol.ts';
import { ExecutionScheduler } from './scheduler.ts';

declare const self: DedicatedWorkerGlobalScope;

// setTimeout(0) is clamped to ~4 ms when nested; a MessageChannel round-trip yields to the event loop immediately.
const yieldChannel = new MessageChannel();
const yieldQueue: (() => void)[] = [];
yieldChannel.port1.onmessage = () => yieldQueue.shift()?.();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) {
      yieldQueue.push(resolve);
      yieldChannel.port2.postMessage(null);
    } else {
      setTimeout(resolve, ms);
    }
  });
}

const scheduler = new ExecutionScheduler({
  post: (message) => self.postMessage(message),
  now: () => performance.now(),
  sleep,
});

self.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  scheduler.handle(event.data);
};
