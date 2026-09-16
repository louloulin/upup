import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';

const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 10;
const STALE_LOCK_MS = 30_000;

export interface PiFileLockOptions {
  timeoutMs?: number;
  staleMs?: number;
}

export async function withPiFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>,
  options: PiFileLockOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const staleMs = options.staleMs ?? STALE_LOCK_MS;
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  await mkdir(dirname(lockPath), { recursive: true });
  while (!acquired) {
    try {
      await mkdir(lockPath);
      acquired = true;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
      try {
        const lockStat = await stat(lockPath);
        if (Date.now() - lockStat.mtimeMs > staleMs) await rm(lockPath, { recursive: true, force: true });
      } catch {
        // The owner may have released the lock between stat and cleanup.
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for Pi session lock: ${lockPath}`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  try {
    return await operation();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}
