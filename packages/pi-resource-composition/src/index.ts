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
  /** Install the session-scoped host/resource bindings. */
  install: () => void | (() => void | Promise<void>);
  /** Reload the Pi resource loader while the bindings are installed. */
  reload: () => Promise<TResult>;
}

/**
 * Serialize Pi resource reloads and guarantee restoration.
 *
 * Requests are FIFO. A failed reload does not poison the queue: the next
 * request can proceed after restoration. If installation itself fails, no
 * restore callback is required and the queue is still released.
 */
export async function withSerializedPiResourceReload<TResult>(
  options: PiResourceReloadOptions<TResult>,
): Promise<TResult> {
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

/** Reset the process-local queue for isolated tests and worker shutdown. */
export function resetPiResourceReloadQueue(): void {
  reloadTail = Promise.resolve();
}
