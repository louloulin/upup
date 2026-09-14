/**
 * Pi Native Bootstrap
 *
 * Wires Pi session/background services to the root Pi AgentSession factory
 * and the root Pi prompt runner. Call `bootstrapPiNativeServices()` once at
 * process startup (CLI, stdio, bridge, management, cron, daemon) before any
 * code calls `getPiSessionService()` or `getPiBackgroundService()`.
 */
import { configurePiSessionService, type PiSessionListItem } from '@upup/pi-session';
import { configurePiBackgroundService } from '@upup/pi-session';
import { createPiAgentRuntime } from './agent-session-factory.js';
import { runPiPrompt } from './runner.js';

let bootstrapped = false;

export function bootstrapPiNativeServices(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  configurePiSessionService(() => createPiAgentRuntime());
  configurePiBackgroundService(() => runPiPrompt);
}

export type { PiSessionListItem };
