/**
 * Wire the UpUp TUI widget extensions into the ecosystem mount.
 *
 * Pattern 5 (WatchlistWidget) and Pattern 6 (PlanFooter) ship from
 * `@upup/pi-runtime` as a single `createUpUpTuiWidgetsExtension`. The
 * ecosystem extension mounts it right after the `pi-subagents` subagent
 * registration so every session (TUI / RPC / stdio) gets the same widget
 * surface. Mounting is best-effort: a missing `setWidget`/`setFooter` on
 * Pi surfaces (older versions) silently skips the wiring.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createUpUpTuiWidgetsExtension } from './extensions/tui-widgets';

export function mountUpUpTuiWidgets(pi: ExtensionAPI, onError?: (where: string, error: unknown) => void): void {
  try {
    const factory = createUpUpTuiWidgetsExtension({ onError });
    factory(pi);
  } catch (error) {
    onError?.('mountUpUpTuiWidgets', error);
  }
}
