/**
 * Agent Public Port Registry
 *
 * High-cohesion boundary between src/agent/ and packages/commands/.
 * Replaces fragile 4-level `await import('../../../../src/agent/...')`
 * patterns with a global registry populated at startup.
 *
 * Rules:
 *   1. src/agent/ modules register their port implementations at module init.
 *   2. packages/commands/ reads ports via `getAgentPort()` - no static import
 *      across the package boundary.
 *   3. A missing port is a typed no-op (returns null), never throws.
 *
 * Adding a new port:
 *   1. Add the interface and accessor here.
 *   2. Have the implementation in src/agent/ call `register*` on import.
 *   3. packages/commands/ calls `get*()` and null-checks the result.
 */

// ---------------------------------------------------------------------------
// Port interfaces
// ---------------------------------------------------------------------------

export interface PlanModePort {
  isActive(): boolean;
  getPlanId(): string | undefined;
  enter(planId: string): void;
  exit(): void;
}

export interface AgentConfigPort {
  getModel(): string;
  getProvider(): string;
}

export interface SessionPort {
  getSessionId(): string | undefined;
  getTurnCount(): number;
}

// ---------------------------------------------------------------------------
// Global registry
// ---------------------------------------------------------------------------

interface AgentPorts {
  planMode?: PlanModePort;
  config?: AgentConfigPort;
  session?: SessionPort;
}

declare global {
  // eslint-disable-next-line no-var
  var __upupAgentPorts: AgentPorts | undefined;
}

function getRegistry(): AgentPorts {
  if (!globalThis.__upupAgentPorts) {
    globalThis.__upupAgentPorts = {};
  }
  return globalThis.__upupAgentPorts;
}

// ---------------------------------------------------------------------------
// Registration API (called by src/agent/ at module init)
// ---------------------------------------------------------------------------

export function registerPlanModePort(port: PlanModePort): void {
  getRegistry().planMode = port;
}

export function registerAgentConfigPort(port: AgentConfigPort): void {
  getRegistry().config = port;
}

export function registerSessionPort(port: SessionPort): void {
  getRegistry().session = port;
}

// ---------------------------------------------------------------------------
// Consumer API (called by packages/commands/)
// ---------------------------------------------------------------------------

export function getPlanModePort(): PlanModePort | null {
  return getRegistry().planMode ?? null;
}

export function getAgentConfigPort(): AgentConfigPort | null {
  return getRegistry().config ?? null;
}

export function getSessionPort(): SessionPort | null {
  return getRegistry().session ?? null;
}

// Test-only: reset all ports
export function __resetAgentPorts(): void {
  globalThis.__upupAgentPorts = {};
}
