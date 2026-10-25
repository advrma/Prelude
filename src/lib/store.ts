import fs from "node:fs";
import path from "node:path";
import { config } from "./config";
import { loadPersonas } from "./data";
import type { HubLogEntry, Match, PairResult, PreDate, Report, Student } from "./types";

// Local JSON store (§5.3): data/store.json with an in-process write queue.
// If the filesystem is read-only (e.g. Vercel), state lives in memory, seeded from personas + data/cache/.

export interface StoreState {
  version: 1;
  seededAt: string;
  students: Student[];
  pairs: PairResult[];
  predates: PreDate[];
  matches: Match[];
  reports: Report[];
  hubLog: HubLogEntry[];
  lastRunAt?: string;
}

type Hydrator = (state: StoreState) => void;

interface StoreGlobals {
  state?: StoreState;
  mtimeMs?: number;
  memoryOnly?: boolean;
  queue: Promise<unknown>;
  hydrator?: Hydrator;
  dir?: string;
}

// Survives Next dev hot reloads, so every route handler shares one state + one queue.
const g = globalThis as unknown as { __preludeStore?: StoreGlobals };
const store: StoreGlobals = (g.__preludeStore ??= { queue: Promise.resolve() });

export function storePath(): string {
  return path.join(config.stateDir(), "store.json");
}

export function seedState(): StoreState {
  return {
    version: 1,
    seededAt: new Date().toISOString(),
    students: loadPersonas(),
    pairs: [],
    predates: [],
    matches: [],
    reports: [],
    hubLog: [],
  };
}

/** Used in memory-only mode to pre-run matching from the replay cache, so a fresh deploy has matches. */
export function setMemoryHydrator(fn: Hydrator) {
  store.hydrator = fn;
}

export function isMemoryOnly(): boolean {
  return store.memoryOnly === true;
}

function isReadOnlyError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === "EROFS" || code === "EACCES" || code === "EPERM" || code === "ENOTSUP";
}

function writeAtomic(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows can refuse a rename over a file another process (editor, antivirus) holds open.
    fs.writeFileSync(file, text, "utf8");
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

function persist(state: StoreState) {
  if (store.memoryOnly) return;
  const file = storePath();
  try {
    writeAtomic(file, JSON.stringify(state, null, 2));
    store.mtimeMs = fs.statSync(file).mtimeMs;
  } catch (err) {
    if (!isReadOnlyError(err)) throw err;
    store.memoryOnly = true;
  }
}

function load(): StoreState {
  // A different state dir (tests) means a different store.
  const dir = config.stateDir();
  if (store.dir !== dir) {
    store.dir = dir;
    store.state = undefined;
    store.mtimeMs = undefined;
    store.memoryOnly = undefined;
  }
  const file = storePath();
  if (!store.memoryOnly) {
    try {
      const stat = fs.statSync(file);
      // Reload when another process (npm run reset / seed / night) rewrote the file.
      if (!store.state || stat.mtimeMs !== store.mtimeMs) {
        store.state = JSON.parse(fs.readFileSync(file, "utf8")) as StoreState;
        store.mtimeMs = stat.mtimeMs;
      }
      return store.state;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT" && !(err instanceof SyntaxError)) {
        if (!isReadOnlyError(err)) throw err;
        store.memoryOnly = true;
      }
    }
  }
  if (!store.state) {
    const fresh = seedState();
    persist(fresh);
    if (store.memoryOnly) store.hydrator?.(fresh);
    store.state = fresh;
  }
  return store.state;
}

/** Read the current state. Treat the result as read-only; use updateState to change it. */
export async function getState(): Promise<StoreState> {
  await store.queue.catch(() => undefined);
  return load();
}

/** Serialized read-modify-write. The mutator edits state in place; the result is persisted. */
export function updateState<T>(fn: (state: StoreState) => T | Promise<T>): Promise<T> {
  const run = store.queue.catch(() => undefined).then(async () => {
    const state = load();
    const result = await fn(state);
    persist(state);
    return result;
  });
  store.queue = run;
  return run;
}

/** Wipe store.json and reseed from data/personas.json. */
export function resetStore(): Promise<StoreState> {
  return updateState((state) => {
    const fresh = seedState();
    if (store.memoryOnly) store.hydrator?.(fresh);
    Object.assign(state, fresh);
    return state;
  });
}

/** Test helper: forget cached state so the next read comes from disk. */
export function _forgetStore() {
  store.state = undefined;
  store.mtimeMs = undefined;
  store.memoryOnly = undefined;
  store.dir = undefined;
}

/** Test helper: force memory-only mode. */
export function _setMemoryOnly(on: boolean) {
  store.dir = config.stateDir();
  store.memoryOnly = on;
}
