// @ts-nocheck
import { getPiRuntimePort } from '@upup/pi-runtime';

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

export function getPlanModePortLocal(): PlanModePortLocal | null {
  return getPiRuntimePort<PlanModePortLocal>('platform.plan-mode') ?? null;
}

export function getSubagentPortLocal(): SubagentPortLocal | null {
  return getPiRuntimePort<SubagentPortLocal>('platform.subagent') ?? null;
}

export function getMcpRegistryPortLocal(): McpRegistryPortLocal | null {
  return getPiRuntimePort<McpRegistryPortLocal>('platform.mcp-registry') ?? null;
}

export function getStatePortLocal(): StatePortLocal | null {
  return getPiRuntimePort<StatePortLocal>('platform.state') ?? null;
}

export function getSandboxPortLocal(): SandboxPortLocal | null {
  return getPiRuntimePort<SandboxPortLocal>('platform.sandbox') ?? null;
}

export function getAgentMemoryPortLocal(): AgentMemoryPortLocal | null {
  return getPiRuntimePort<AgentMemoryPortLocal>('platform.agent-memory') ?? null;
}
