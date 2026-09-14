import { getPiRuntimePort, registerPiRuntimePort, resetPiRuntimePorts } from '@upup/pi-runtime';

/** Pi runtime public ports shared with platform packages. */

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

const PORT_NAMES = {
  planMode: 'platform.plan-mode', config: 'platform.config', session: 'platform.session', subagent: 'platform.subagent',
  mcpRegistry: 'platform.mcp-registry', state: 'platform.state', sandbox: 'platform.sandbox', agentMemory: 'platform.agent-memory',
} as const;

function register<T>(name: string, port: T): void { registerPiRuntimePort(name, port); }
function get<T>(name: string): T | null { return getPiRuntimePort<T>(name) ?? null; }

export function registerPlanModePort(port: PlanModePort): void { register(PORT_NAMES.planMode, port); }
export function registerAgentConfigPort(port: AgentConfigPort): void { register(PORT_NAMES.config, port); }
export function registerSessionPort(port: SessionPort): void { register(PORT_NAMES.session, port); }
export function registerSubagentPort(port: SubagentPort): void { register(PORT_NAMES.subagent, port); }
export function registerMcpRegistryPort(port: McpRegistryPort): void { register(PORT_NAMES.mcpRegistry, port); }
export function registerStatePort(port: StatePort): void { register(PORT_NAMES.state, port); }
export function registerSandboxPort(port: SandboxPort): void { register(PORT_NAMES.sandbox, port); }
export function registerAgentMemoryPort(port: AgentMemoryPort): void { register(PORT_NAMES.agentMemory, port); }

export function getPlanModePort(): PlanModePort | null { return get(PORT_NAMES.planMode); }
export function getAgentConfigPort(): AgentConfigPort | null { return get(PORT_NAMES.config); }
export function getSessionPort(): SessionPort | null { return get(PORT_NAMES.session); }
export function getSubagentPort(): SubagentPort | null { return get(PORT_NAMES.subagent); }
export function getMcpRegistryPort(): McpRegistryPort | null { return get(PORT_NAMES.mcpRegistry); }
export function getStatePort(): StatePort | null { return get(PORT_NAMES.state); }
export function getSandboxPort(): SandboxPort | null { return get(PORT_NAMES.sandbox); }
export function getAgentMemoryPort(): AgentMemoryPort | null { return get(PORT_NAMES.agentMemory); }

export function __resetAgentPorts(): void { resetPiRuntimePorts(); }
export function __saveAgentPorts(): AgentPorts {
  return {
    planMode: getPlanModePort() ?? undefined, config: getAgentConfigPort() ?? undefined, session: getSessionPort() ?? undefined,
    subagent: getSubagentPort() ?? undefined, mcpRegistry: getMcpRegistryPort() ?? undefined, state: getStatePort() ?? undefined,
    sandbox: getSandboxPort() ?? undefined, agentMemory: getAgentMemoryPort() ?? undefined,
  };
}
export function __restoreAgentPorts(saved: AgentPorts): void {
  __resetAgentPorts();
  if (saved.planMode) registerPlanModePort(saved.planMode);
  if (saved.config) registerAgentConfigPort(saved.config);
  if (saved.session) registerSessionPort(saved.session);
  if (saved.subagent) registerSubagentPort(saved.subagent);
  if (saved.mcpRegistry) registerMcpRegistryPort(saved.mcpRegistry);
  if (saved.state) registerStatePort(saved.state);
  if (saved.sandbox) registerSandboxPort(saved.sandbox);
  if (saved.agentMemory) registerAgentMemoryPort(saved.agentMemory);
}
