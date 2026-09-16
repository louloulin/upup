/**
 * TUI port types — Sprint 1 cleanup (Pi Native migration).
 *
 * `TuiRuntime` and `TuiCommandCapabilities` were originally declared in
 * `Pi InteractiveMode/tui/agent-runner-ports.ts`. The full TUI package
 * (~38K lines of self-implemented Ink components, slash-command UI,
 * permission prompts, session selector, autocomplete, status line) is
 * being deleted in favour of Pi's own `InteractiveMode` + extension-host
 * surface, but `PiApp` still receives `tuiRuntimeFactory` and
 * `commandCapabilitiesFactory` from upstream callers (bridge, gateway,
 * daemon, cron worker) for backward compatibility. The shapes are
 * preserved here as **type-only ports** — every implementation is now a
 * thin delegate to the Pi session service.
 */

import type { AgentPortsLocal } from '@upup/commands';
import type {
  PiSessionService,
  SessionTracker,
  SessionMessage,
  RenderableMessage,
  PiSessionToolInfo,
} from '@upup/pi-session';
import type { PromptRunner } from '@upup/utils';

/**
 * Backward-compatible alias for the legacy TUI runtime port. The real
 * runtime lives inside Pi's InteractiveMode; the UpUp-facing port just
 * exposes the session-service handle plus a renderMessages adapter that
 * bridges Pi canonical events to the legacy render layer used by the
 * stdio/bridge/gateway adapters.
 */
export interface TuiRuntime {
  readonly sessionService: PiSessionService;
  readonly sessionTracker: SessionTracker;
  readonly getSessionTools: (sessionId: string) => readonly PiSessionToolInfo[];
  readonly renderMessages: (messages: SessionMessage[]) => RenderableMessage[];
  readonly promptRunner: PromptRunner;
}

/**
 * Backward-compatible alias for the command dispatch capability port. Pi
 * owns the actual command resolution; this type only describes the
 * minimum surface (MCP registry + sandbox status) that callers expect.
 */
export type TuiCommandCapabilities = AgentPortsLocal;
