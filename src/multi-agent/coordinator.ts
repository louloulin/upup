/**
 * Swarm Coordinator - 多智能体编排器 (v2.0)
 * 
 * 基于Claude Code Swarm设计:
 * - team_create: 创建团队
 * - agent_spawn: spawn子Agent
 * - message_pass: Agent间通信
 * - state_sync: 状态同步
 * - output_aggregate: 结果聚合
 * 
 * 集成Backend系统进行Agent执行
 */

import type {
  TeamFile,
  AgentInstance,
  SpawnAgentParams,
  CoordinatorEvent,
  CoordinatorEventListener,
  BackendType,
} from './types.js';
import { TeamManager, getTeamManager } from './team-manager.js';
import { getBackendForSpawn, initializeBackends, type Backend } from './backends/index.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';

/**
 * Swarm Coordinator - manages multi-agent orchestration
 */
export class SwarmCoordinator {
  private readonly teamManager: TeamManager;
  private readonly agents: Map<string, AgentInstance> = new Map();
  private readonly events: Map<string, CoordinatorEventListener[]> = new Map();
  private readonly messages: Map<string, Array<{from: string; to: string; content: string; timestamp: number}>> = new Map();
  private readonly backends: Map<string, Backend> = new Map();
  private initialized = false;

  constructor() {
    this.teamManager = getTeamManager();
  }

  /**
   * Initialize coordinator and backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    await this.teamManager.initialize();
    initializeBackends();
    
    // Setup default backends
    const { type, backend } = getBackendForSpawn();
    this.backends.set('default', backend);
    
    this.initialized = true;
    info('agent', `SwarmCoordinator initialized with ${type} backend`);
  }

  /**
   * Ensure coordinator is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Create a team
   */
  createTeam(name: string, description?: string, agentType?: string): TeamFile {
    const team = this.teamManager.create({ name, description, agentType });
    this.emitEvent({ type: 'team_created', teamId: team.name, timestamp: Date.now() });
    return team;
  }

  /**
   * Spawn an agent in a team
   */
  async spawnAgent(params: SpawnAgentParams): Promise<AgentInstance> {
    await this.ensureInitialized();
    
    const team = this.teamManager.getTeam(params.teamId);
    if (!team) {
      throw new Error(`Team not found: ${params.teamId}`);
    }

    const agent: AgentInstance = {
      id: crypto.randomUUID(),
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.agents.set(agent.id, agent);

    // Add as team member
    this.teamManager.addMember(params.teamId, params.name, params.role);

    this.emitEvent({ type: 'agent_spawned', teamId: params.teamId, agentId: agent.id, timestamp: Date.now() });

    // Get backend for execution
    const backendType = params.tools === '*' ? undefined : (params as any).backendType;
    const { backend } = getBackendForSpawn(backendType as BackendType);
    
    // Execute agent using backend
    try {
      const spawnedAgent = await backend.spawn(params);
      
      // Sync status from spawned agent
      agent.id = spawnedAgent.id;
      agent.status = spawnedAgent.status;
      agent.startedAt = spawnedAgent.startedAt;
      
      // Monitor agent completion
      this.monitorAgent(agent, backend);
      
      return agent;
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      this.emitEvent({ 
        type: 'agent_failed', 
        teamId: params.teamId, 
        agentId: agent.id, 
        data: { error: agent.error }, 
        timestamp: Date.now() 
      });
      throw error;
    }
  }

  /**
   * Monitor agent status changes
   */
  private monitorAgent(agent: AgentInstance, backend: Backend): void {
    const checkInterval = setInterval(async () => {
      try {
        const activeAgents = await backend.listActive();
        const isActive = activeAgents.some(a => a.id === agent.id);
        
        if (!isActive && agent.status === 'running') {
          // Agent completed or failed
          clearInterval(checkInterval);
          
          // Try to get final status
          const results = this.getAgentResults(agent.teamId, agent.id);
          if (results.length > 0) {
            const finalAgent = results[0];
            agent.status = finalAgent.status;
            agent.result = finalAgent.result;
            agent.completedAt = finalAgent.completedAt;
            
            if (finalAgent.status === 'completed') {
              this.emitEvent({ 
                type: 'agent_completed', 
                teamId: agent.teamId, 
                agentId: agent.id, 
                data: { result: agent.result }, 
                timestamp: Date.now() 
              });
            } else if (finalAgent.status === 'failed') {
              this.emitEvent({ 
                type: 'agent_failed', 
                teamId: agent.teamId, 
                agentId: agent.id, 
                data: { error: finalAgent.error }, 
                timestamp: Date.now() 
              });
            }
          }
        }
      } catch {
        clearInterval(checkInterval);
      }
    }, 500);
  }

  /**
   * Send message between agents
   */
  sendMessage(from: string, to: string, content: string): boolean {
    // Verify agents exist
    const fromAgent = this.agents.get(from);
    const toAgent = this.agents.get(to);

    if (!fromAgent) {
      warn('agent', `Message failed: source agent not found (${from})`);
      return false;
    }
    
    if (!toAgent) {
      warn('agent', `Message failed: target agent not found (${to})`);
      return false;
    }

    const message = { from, to, content, timestamp: Date.now() };
    
    // Store message
    if (!this.messages.has(to)) {
      this.messages.set(to, []);
    }
    this.messages.get(to)!.push(message);

    // Update agent activity
    fromAgent.lastActivity = Date.now();
    toAgent.lastActivity = Date.now();

    this.emitEvent({ type: 'message_sent', agentId: to, data: { from, content }, timestamp: Date.now() });
    
    return true;
  }

  /**
   * Broadcast message to all team agents
   */
  broadcastMessage(teamId: string, from: string, content: string): number {
    const teamAgents = this.getTeamAgents(teamId);
    let count = 0;
    
    for (const agent of teamAgents) {
      if (agent.id !== from && agent.status === 'running') {
        if (this.sendMessage(from, agent.id, content)) {
          count++;
        }
      }
    }
    
    return count;
  }

  /**
   * Get messages for an agent
   */
  getMessages(agentId: string): Array<{from: string; to: string; content: string; timestamp: number}> {
    return this.messages.get(agentId) ?? [];
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId: string): AgentInstance | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents in a team
   */
  getTeamAgents(teamId: string): AgentInstance[] {
    return Array.from(this.agents.values()).filter(a => a.teamId === teamId);
  }

  /**
   * Get agent results
   */
  getAgentResults(teamId: string, agentId?: string): AgentInstance[] {
    const teamAgents = this.getTeamAgents(teamId);
    if (agentId) {
      const agent = this.agents.get(agentId);
      return agent ? [agent] : [];
    }
    return teamAgents;
  }

  /**
   * Terminate an agent
   */
  async terminateAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    // Try to terminate via all backends
    for (const backend of this.backends.values()) {
      try {
        await backend.terminate(agentId);
      } catch {
        // Backend might not own this agent
      }
    }

    agent.status = 'cancelled';
    agent.completedAt = Date.now();
    
    info('agent', `Agent terminated: ${agentId}`);
  }

  /**
   * Get active agent count
   */
  getActiveAgentCount(): number {
    return Array.from(this.agents.values()).filter(a => a.status === 'running').length;
  }

  /**
   * Get team statistics
   */
  getTeamStats(teamId: string): {
    total: number;
    active: number;
    completed: number;
    failed: number;
    pending: number;
  } {
    const teamAgents = this.getTeamAgents(teamId);
    return {
      total: teamAgents.length,
      active: teamAgents.filter(a => a.status === 'running').length,
      completed: teamAgents.filter(a => a.status === 'completed').length,
      failed: teamAgents.filter(a => a.status === 'failed').length,
      pending: teamAgents.filter(a => a.status === 'pending').length,
    };
  }

  /**
   * Subscribe to events
   */
  subscribe(eventType: string, listener: CoordinatorEventListener): () => void {
    if (!this.events.has(eventType)) {
      this.events.set(eventType, []);
    }
    this.events.get(eventType)!.push(listener);
    return () => {
      const listeners = this.events.get(eventType);
      if (listeners) {
        const index = listeners.indexOf(listener);
        if (index !== -1) listeners.splice(index, 1);
      }
    };
  }

  /**
   * Emit event
   */
  private emitEvent(event: CoordinatorEvent): void {
    const listeners = this.events.get(event.type) ?? [];
    const allListeners = this.events.get('*') ?? [];
    
    for (const listener of [...listeners, ...allListeners]) {
      try {
        listener(event);
      } catch (e) {
        logError('agent', `Event listener error: ${event.type}`, e instanceof Error ? e : undefined);
      }
    }
  }
}

// Singleton
let coordinator: SwarmCoordinator | null = null;

export function getSwarmCoordinator(): SwarmCoordinator {
  if (!coordinator) {
    coordinator = new SwarmCoordinator();
  }
  return coordinator;
}

/**
 * Reset coordinator (for testing)
 */
export function resetSwarmCoordinator(): void {
  coordinator = new SwarmCoordinator();
}

/**
 * Additional exports for monitoring integration
 */
export function getAgents(): AgentInstance[] {
  return Array.from(this.agents.values());
}

export function getMessageCount(): number {
  let count = 0;
  for (const messages of this.messages.values()) {
    count += messages.length;
  }
  return count;
}

// Add methods to prototype
const proto = SwarmCoordinator.prototype as any;
proto.getAgents = getAgents;
proto.getMessageCount = getMessageCount;
