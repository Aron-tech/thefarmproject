/** Messages sent from the main thread to the interpreter worker. */
export type MainToWorkerMessage = { type: 'ping'; sentAt: number };

/** Messages sent from the interpreter worker to the main thread. */
export type WorkerToMainMessage = { type: 'pong'; sentAt: number };
