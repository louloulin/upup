/**
 * Agent Public Port (Local Mirror)
 *
 * Cross-package boundary between packages/commands/ and the Pi runtime.
 *
 * The canonical interface lives in src/runtime/pi/agent-port.ts.
 * This file duplicates the small shape (4 lines) and reads from
 * globalThis to avoid a fragile 4-level `await import` chain.
 *
 * The risk of interface drift is mitigated by the test suite in
 * Pi runtime port contract tests cover the shared shape.
 */

export interface PlanModePortLocal {
  isActive(): boolean;
  getPlanId(): string | undefined;
  enter(planId: string): void;
  exit(): void;
}



export interface SubagentTaskSummaryLocal {
  id: string;
  status: string;
  prompt: string;
}

export interface SubagentPortLocal {
  createTask(config: { description: string; prompt: string; runInBackground?: boolean }): Promise<{ id: string }>;
  getAllTasks(): SubagentTaskSummaryLocal[];
  cancelTask?(id: string): Promise<boolean>;
}

export interface McpServerStatusLocal {
  name: string;
  state: string;
  toolCount: number;
  error?: string;
}

export interface McpStatusLocal {
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  servers: McpServerStatusLocal[];
}

export interface McpRegistryPortLocal {
  getStatus(): McpStatusLocal;
}

export interface SessionSummaryLocal {
  id: string;
  customTitle?: string;
  firstPrompt?: string;
  created?: Date;
  modified?: Date;
  messageCount?: number;
  tags?: string[];
}

export interface StatePortLocal {
  getAppState(): { getState(): Record<string, unknown>; [k: string]: unknown };
  formatCost(cost: number): string;
  formatTokens(tokens: number): string;
  getSessionManager(): { listSessions(limit: number): Promise<SessionSummaryLocal[]> };
}

export interface SandboxPortLocal {
  getStatus(): { mode: string; enabled: boolean; autoAllow: boolean; additionalDirs: string[] };
  checkDependencies(): Promise<{
    available: boolean;
    errors: string[];
    warnings: string[];
    platform: string;
    nodeVersion: string;
    capabilities: { filesystem: boolean; network: boolean; process: boolean; sandbox: boolean };
  }>;
}

export interface AgentMemoryPortLocal {
  getContext(agentId: string): string;
}

interface AgentPortsLocal {
  planMode?: PlanModePortLocal;
  subagent?: SubagentPortLocal;
  mcpRegistry?: McpRegistryPortLocal;
  state?: StatePortLocal;
  sandbox?: SandboxPortLocal;
  agentMemory?: AgentMemoryPortLocal;
}

declare global {
  // eslint-disable-next-line no-var
  var __upupAgentPorts: AgentPortsLocal | undefined;
}

export function getPlanModePortLocal(): PlanModePortLocal | null {
  return globalThis.__upupAgentPorts?.planMode ?? null;
}

export function getSubagentPortLocal(): SubagentPortLocal | null {
  return globalThis.__upupAgentPorts?.subagent ?? null;
}

export function getMcpRegistryPortLocal(): McpRegistryPortLocal | null {
  return globalThis.__upupAgentPorts?.mcpRegistry ?? null;
}

export function getStatePortLocal(): StatePortLocal | null {
  return globalThis.__upupAgentPorts?.state ?? null;
}

export function getSandboxPortLocal(): SandboxPortLocal | null {
  return globalThis.__upupAgentPorts?.sandbox ?? null;
}

export function getAgentMemoryPortLocal(): AgentMemoryPortLocal | null {
  return globalThis.__upupAgentPorts?.agentMemory ?? null;
}
