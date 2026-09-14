/**
 * Serialized Pi resource reload lifecycle.
 *
 * Pi's resource loader mutates process-level extension/host state while it
 * reloads. The runtime must therefore serialize reloads, install a scoped
 * host binding before reload, and always restore the previous binding after
 * reload succeeds or fails. This package owns that lifecycle contract;
 * callers inject the domain-specific install and reload functions.
 */
let reloadTail: Promise<void> = Promise.resolve();

export interface PiResourceReloadOptions<TResult> {
  install: () => void | (() => void | Promise<void>);
  reload: () => Promise<TResult>;
}

export async function withSerializedPiResourceReload<TResult>(options: PiResourceReloadOptions<TResult>): Promise<TResult> {
  const previous = reloadTail;
  let release!: () => void;
  reloadTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  let restore: void | (() => void | Promise<void>);
  try {
    restore = options.install();
  } catch (error) {
    release();
    throw error;
  }
  try {
    return await options.reload();
  } finally {
    try {
      if (typeof restore === 'function') await restore();
    } finally {
      release();
    }
  }
}

export function resetPiResourceReloadQueue(): void {
  reloadTail = Promise.resolve();
}
