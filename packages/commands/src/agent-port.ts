/**
 * Agent Public Port (Local Mirror)
 *
 * Cross-package boundary between packages/commands/ and src/agent/.
 *
 * The canonical interface lives in src/agent/agent-port.ts.
 * This file duplicates the small shape (4 lines) and reads from
 * globalThis to avoid a fragile 4-level `await import` chain.
 *
 * The risk of interface drift is mitigated by the test suite in
 * src/agent/agent-port.test.ts (planned for v6).
 */

export interface PlanModePortLocal {
  isActive(): boolean;
  getPlanId(): string | undefined;
  enter(planId: string): void;
  exit(): void;
}

interface AgentPortsLocal {
  planMode?: PlanModePortLocal;
}

declare global {
  // eslint-disable-next-line no-var
  var __upupAgentPorts: AgentPortsLocal | undefined;
}

export function getPlanModePortLocal(): PlanModePortLocal | null {
  return globalThis.__upupAgentPorts?.planMode ?? null;
}
