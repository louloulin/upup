/**
 * Agent Public Port (Local Accessors)
 *
 * Convenience accessors that read from the global `__upupAgentPorts`
 * registry populated by `@upup/agent-runtime/agent-port`. The canonical
 * type definitions and the registry itself live there; this module just
 * provides a thin read-side facade that returns `null` if a port is
 * missing, so callers can null-check without importing the registry.
 */

import type {
  AgentPorts,
  PlanModePort,
  SubagentPort,
  McpRegistryPort,
  StatePort,
} from '@upup/agent-runtime/agent-port';

export type { PlanModePort, SubagentPort, McpRegistryPort, StatePort };

export function getPlanModePortLocal(): PlanModePort | null {
  return (globalThis as { __upupAgentPorts?: AgentPorts }).__upupAgentPorts?.planMode ?? null;
}

export function getSubagentPortLocal(): SubagentPort | null {
  return (globalThis as { __upupAgentPorts?: AgentPorts }).__upupAgentPorts?.subagent ?? null;
}

export function getMcpRegistryPortLocal(): McpRegistryPort | null {
  return (globalThis as { __upupAgentPorts?: AgentPorts }).__upupAgentPorts?.mcpRegistry ?? null;
}

export function getStatePortLocal(): StatePort | null {
  return (globalThis as { __upupAgentPorts?: AgentPorts }).__upupAgentPorts?.state ?? null;
}
