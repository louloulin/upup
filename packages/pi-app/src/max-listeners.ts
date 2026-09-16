/**
 * Bump Node's `EventEmitter.defaultMaxListeners` to silence the cosmetic
 * `MaxListenersExceededWarning` printed when >10 Pi package extensions
 * register one listener each on `upup.pi.capability.resolve.v1`. The
 * listeners are intentional; the warning has no diagnostic value for our
 * architecture.
 *
 * Lives in its own module so every entry point (CLI, stdio, bridge,
 * management, cron, daemon, eval, print) can import it once and the headroom
 * is installed before any `@earendil-works/pi-*` module constructs its own
 * `EventEmitter`.
 */
export const REQUIRED_MAX_LISTENERS = 64;

export function installMaxListenersHeadroom(): void {
  const globalScope = globalThis as { __upupMaxListenersInstalled?: boolean };
  if (globalScope.__upupMaxListenersInstalled) return;
  globalScope.__upupMaxListenersInstalled = true;
  // Node ≥ 14: `events.EventEmitter.defaultMaxListeners` is the default cap
  // applied when an emitter doesn't call `setMaxListeners` itself. Bumping it
  // before any `@earendil-works/pi-*` module loads means Pi's internal
  // `new EventEmitter()` (e.g. in `event-bus.js`) inherits the higher cap
  // without us forking Pi.
  const ee = require('node:events').EventEmitter as { defaultMaxListeners: number };
  if (ee.defaultMaxListeners < REQUIRED_MAX_LISTENERS) {
    ee.defaultMaxListeners = REQUIRED_MAX_LISTENERS;
  }
}

installMaxListenersHeadroom();
