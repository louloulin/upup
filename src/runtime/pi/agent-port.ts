/**
 * Pi runtime public ports shared with platform packages.
 *
 * The registry contains only lifecycle/platform capabilities. Agent
 * execution itself is provided by Pi AgentSession and never by this port.
 */

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

export interface SubagentTaskSummary {
  id: string;
  status: string;
  prompt: string;
}

export interface SubagentPort {
  createTask(config: { description: string; prompt: string; runInBackground?: boolean }): Promise<{ id: string }>;
  getAllTasks(): SubagentTaskSummary[];
  cancelTask?(id: string): Promise<boolean>;
}

export interface McpServerStatus {
  name: string;
  state: string;
  toolCount: number;
  error?: string;
}

export interface McpStatus {
  totalServers: number;
  connectedServers: number;
  totalTools: number;
  servers: McpServerStatus[];
}

export interface McpRegistryPort {
  getStatus(): McpStatus;
}

export interface SessionSummary {
  id: string;
  customTitle?: string;
  firstPrompt?: string;
  created?: Date;
  modified?: Date;
  messageCount?: number;
  tags?: string[];
}

export interface StatePort {
  getAppState(): { getState(): Record<string, unknown>; [key: string]: unknown };
  formatCost(cost: number): string;
  formatTokens(tokens: number): string;
  getSessionManager(): { listSessions(limit: number): Promise<SessionSummary[]> };
}

export interface SandboxDependencyCheckPort {
  available: boolean;
  errors: string[];
  warnings: string[];
  platform: string;
  nodeVersion: string;
  capabilities: { filesystem: boolean; network: boolean; process: boolean; sandbox: boolean };
}

export interface SandboxPort {
  getStatus(): { mode: string; enabled: boolean; autoAllow: boolean; additionalDirs: string[] };
  checkDependencies(): Promise<SandboxDependencyCheckPort>;
}

export interface AgentMemoryPort {
  getContext(agentId: string): string;
}

export interface AgentPorts {
  planMode?: PlanModePort;
  config?: AgentConfigPort;
  session?: SessionPort;
  subagent?: SubagentPort;
  mcpRegistry?: McpRegistryPort;
  state?: StatePort;
  sandbox?: SandboxPort;
  agentMemory?: AgentMemoryPort;
}

declare global {
  // eslint-disable-next-line no-var
  var __upupAgentPorts: AgentPorts | undefined;
}

function getRegistry(): AgentPorts {
  globalThis.__upupAgentPorts ??= {};
  return globalThis.__upupAgentPorts;
}

export function registerPlanModePort(port: PlanModePort): void { getRegistry().planMode = port; }
export function registerAgentConfigPort(port: AgentConfigPort): void { getRegistry().config = port; }
export function registerSessionPort(port: SessionPort): void { getRegistry().session = port; }
export function registerSubagentPort(port: SubagentPort): void { getRegistry().subagent = port; }
export function registerMcpRegistryPort(port: McpRegistryPort): void { getRegistry().mcpRegistry = port; }
export function registerStatePort(port: StatePort): void { getRegistry().state = port; }
export function registerSandboxPort(port: SandboxPort): void { getRegistry().sandbox = port; }
export function registerAgentMemoryPort(port: AgentMemoryPort): void { getRegistry().agentMemory = port; }

export function getPlanModePort(): PlanModePort | null { return getRegistry().planMode ?? null; }
export function getAgentConfigPort(): AgentConfigPort | null { return getRegistry().config ?? null; }
export function getSessionPort(): SessionPort | null { return getRegistry().session ?? null; }
export function getSubagentPort(): SubagentPort | null { return getRegistry().subagent ?? null; }
export function getMcpRegistryPort(): McpRegistryPort | null { return getRegistry().mcpRegistry ?? null; }
export function getStatePort(): StatePort | null { return getRegistry().state ?? null; }
export function getSandboxPort(): SandboxPort | null { return getRegistry().sandbox ?? null; }
export function getAgentMemoryPort(): AgentMemoryPort | null { return getRegistry().agentMemory ?? null; }

export function __resetAgentPorts(): void { globalThis.__upupAgentPorts = {}; }
export function __saveAgentPorts(): AgentPorts { return { ...(globalThis.__upupAgentPorts ?? {}) }; }
export function __restoreAgentPorts(saved: AgentPorts): void { globalThis.__upupAgentPorts = { ...saved }; }
