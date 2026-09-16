/**
 * Wire `pi-capability-registry`'s session providers accessor so the
 * `definePiCapabilityHost` helper can transparently pick up rich providers
 * from the session-scoped store populated by `agent-session-factory`.
 *
 * Imported by `pi-runtime`'s index.ts so any consumer that pulls
 * `@upup/pi-runtime` (which all `@upup/pi-*` extensions do) automatically
 * wires the accessor before loading its first extension.
 */
import { bindSessionProvidersAccessor } from '@upup/pi-capability-registry';
import { getSessionProviders, listSessionProvidersKeys } from './session-providers-store';

let bootstrapped = false;

export function bootstrapSessionProvidersAccessor(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  bindSessionProvidersAccessor({
    getSessionProviders,
    listSessionProvidersKeys,
  });
}

bootstrapSessionProvidersAccessor();
