import * as api from '@actual-app/api';
import { getConfig } from '../config';
import { logger } from '../lib/logger';

export type ActualApi = typeof api;

const log = logger.child({ module: 'actual' });

let ready = false;
let lastSyncAt: number | null = null;
let syncTimer: NodeJS.Timeout | null = null;

/**
 * `@actual-app/api` is a process-wide singleton backed by a local SQLite copy.
 * All access goes through this FIFO queue so that a reload/sync can never run
 * in the middle of another operation (REST and Telegram share the instance).
 */
let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}

async function syncNow(): Promise<void> {
  try {
    await api.sync();
    lastSyncAt = Date.now();
  } catch (err) {
    // A failed sync must not fail the caller; we keep serving the local copy.
    log.warn({ err }, 'Actual sync failed; serving local data');
  }
}

async function syncIfStale(): Promise<void> {
  const throttle = getConfig().ACTUAL_SYNC_THROTTLE_MS;
  if (lastSyncAt === null || Date.now() - lastSyncAt >= throttle) {
    await syncNow();
  }
}

async function doInit(): Promise<void> {
  const cfg = getConfig();
  await api.init({
    dataDir: cfg.ACTUAL_DATA_DIR,
    serverURL: cfg.ACTUAL_SERVER_URL,
    password: cfg.ACTUAL_PASSWORD,
  });
  await api.downloadBudget(cfg.ACTUAL_BUDGET_ID, {
    password: cfg.ACTUAL_E2E_PASSWORD,
  });
  ready = true;
  lastSyncAt = Date.now();
}

async function doShutdown(): Promise<void> {
  if (!ready) return;
  ready = false;
  await api.shutdown();
}

function startBackgroundSync(): void {
  const interval = getConfig().ACTUAL_SYNC_INTERVAL_MS;
  if (interval <= 0 || syncTimer) return;
  syncTimer = setInterval(() => {
    void enqueue(async () => {
      if (ready) await syncNow();
    });
  }, interval);
  syncTimer.unref();
}

function stopBackgroundSync(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}

export function initActual(): Promise<void> {
  return enqueue(async () => {
    await doShutdown();
    await doInit();
    startBackgroundSync();
  });
}

export function reloadActual(): Promise<void> {
  return enqueue(async () => {
    await doShutdown();
    await doInit();
  });
}

export function shutdownActual(): Promise<void> {
  stopBackgroundSync();
  return enqueue(doShutdown);
}

export interface WithActualOptions {
  /** Sync with the server first if the local copy is older than the throttle. Default: true. */
  fresh?: boolean;
  /** Push changes to the server after `fn` succeeds. Default: false. */
  write?: boolean;
}

/**
 * Run `fn` with exclusive access to the Actual API.
 * Do NOT call `withActual` from inside `fn` (it would deadlock the queue).
 */
export function withActual<T>(
  fn: (actual: ActualApi) => Promise<T>,
  opts: WithActualOptions = {},
): Promise<T> {
  const { fresh = true, write = false } = opts;
  return enqueue(async () => {
    if (!ready) throw new ActualNotReadyError();
    if (fresh) await syncIfStale();
    const result = await fn(api);
    if (write) await syncNow();
    return result;
  });
}

export function getActualStatus(): { ready: boolean; lastSyncAt: string | null } {
  return { ready, lastSyncAt: lastSyncAt ? new Date(lastSyncAt).toISOString() : null };
}

export class ActualNotReadyError extends Error {
  readonly status = 503;
  constructor() {
    super('Actual client not initialised');
    this.name = 'ActualNotReadyError';
  }
}
