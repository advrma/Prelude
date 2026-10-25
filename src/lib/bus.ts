import { EventEmitter } from "node:events";

// In-process event bus so SSE routes can follow a pre-date that is running in the background.

const g = globalThis as unknown as { __preludeBus?: EventEmitter };
export const bus: EventEmitter = (g.__preludeBus ??= (() => {
  const e = new EventEmitter();
  e.setMaxListeners(200);
  return e;
})());

export const predateChannel = (id: string) => `predate:${id}`;
