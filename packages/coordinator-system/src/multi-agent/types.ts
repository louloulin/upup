/**
 * Multi-Agent System Types
 * 
 * Based on Claude Code's swarm system design:
 * - Team management with file persistence
 * - SwarmCoordinator for agent orchestration
 * - Backend registry for multiple execution backends
 */

import type { StructuredToolInterface } from '@langchain/core/tools';

// ============================================================================
// Team Types
// ============================================================================

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'busy';
  joinedAt: number;
  lastActivity: number;
}

export interface TeamFile {
  name: string;
  lead: string;
  members: TeamMember[];
  description: string;
  createdAt: number;
  status: 'active' | 'paused' | 'completed';
}

export interface CreateTeamParams {
  name: string;
  description?: string;
  agentType?: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentInstance {
  id: string;
  teamId: string;
  name: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  lastActivity?: number;
  result?: string;
  error?: string;
}

export interface SpawnAgentParams {
  teamId: string;
  name: string;
  role: string;
  prompt?: string;
  context?: 'inline' | 'fork' | 'swarm';
  cwd?: string;
  tools?: string[] | '*';
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
}

export interface AgentMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

// ============================================================================
// Backend Types
// ============================================================================

export type BackendType = 'inprocess' | 'tmux' | 'iterm2' | 'workerpool';

export interface Backend {
  type: BackendType;
  name: string;
  spawn(config: SpawnAgentParams): Promise<AgentInstance>;
  terminate(agentId: string): Promise<void>;
  listActive(): Promise<AgentInstance[]>;
  isAvailable(): boolean;
}

// ============================================================================
// Coordinator Types
// ============================================================================

export interface CoordinatorConfig {
  maxConcurrentAgents: number;
  defaultTimeoutMs: number;
  backendType: BackendType;
}

export interface CoordinatorEvent {
  type: 'team_created' | 'agent_spawned' | 'agent_completed' | 'agent_failed' | 'message_sent';
  teamId?: string;
  agentId?: string;
  data?: unknown;
  timestamp: number;
}

export type CoordinatorEventListener = (event: CoordinatorEvent) => void;

// ============================================================================
// Tool Input/Output Types
// ============================================================================

export interface TeamCreateInput {
  team_name: string;
  description?: string;
  agent_type?: string;
}

export interface TeamCreateOutput {
  team_name: string;
  team_file_path: string;
  lead_agent_id: string;
}

export interface AgentSpawnInput {
  team_name: string;
  agent_name: string;
  role: string;
  prompt?: string;
  tools?: string[];
  model?: string;
  max_turns?: number;
}

export interface AgentSpawnOutput {
  agent_id: string;
  team_name: string;
  status: 'pending' | 'running';
}

export interface AgentMessageInput {
  from_agent: string;
  to_agent: string;
  message: string;
}

export interface AgentMessageOutput {
  success: boolean;
  delivered: boolean;
}

export interface AgentResultsInput {
  team_name: string;
  agent_id?: string;
}

export interface AgentResultsOutput {
  team_name: string;
  agents: Array<{
    id: string;
    name: string;
    status: string;
    result?: string;
  }>;
}
