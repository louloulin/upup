/**
 * Swarm Coordinator - 多智能体编排器
 * 
 * 基于Claude Code Swarm设计:
 * - team_create: 创建团队
 * - agent_spawn: spawn子Agent
 * - message_pass: Agent间通信
 * - state_sync: 状态同步
 * - output_aggregate: 结果聚合
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type {
  TeamFile,
  AgentInstance,
  SpawnAgentParams,
  CoordinatorEvent,
  CoordinatorEventListener,
  BackendType,
} from './types.js';
import { TeamManager, getTeamManager } from './team-manager.js';
import { info, warn, error as logError } from '../utils/logging/logger.js';

/**
 * Swarm Coordinator - manages multi-agent orchestration
 */
export class SwarmCoordinator {
  private readonly teamManager: TeamManager;
  private readonly agents: Map<string, AgentInstance> = new Map();
  private readonly events: Map<string, CoordinatorEventListener[]> = new Map();
  private readonly messages: Map<string, Array<{from: string; to: string; content: string; timestamp: number}>> = new Map();

  constructor() {
    this.teamManager = getTeamManager();
  }

  /**
   * Initialize coordinator
   */
  async initialize(): Promise<void> {
    await this.teamManager.initialize();
    info('agent', 'SwarmCoordinator initialized');
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
    const team = this.teamManager.getTeam(params.teamId);
    if (!team) {
      throw new Error(`Team not found: ${params.teamId}`);
    }

    const agent: AgentInstance = {
      id: randomUUID(),
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

    // Start agent execution (using existing Subagent system)
    this.executeAgent(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
      this.emitEvent({ type: 'agent_failed', teamId: params.teamId, agentId: agent.id, data: { error: err.message }, timestamp: Date.now() });
    });

    return agent;
  }

  /**
   * Execute agent (using existing UpUp agent system)
   */
  private async executeAgent(agent: AgentInstance, params: SpawnAgentParams): Promise<void> {
    try {
      agent.status = 'running';
      agent.startedAt = Date.now();

      // TODO: Integrate with existing SubagentRunner
      // For now, simulate execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Mark as completed (placeholder for actual implementation)
      agent.status = 'completed';
      agent.completedAt = Date.now();
      agent.result = `Agent ${agent.name} completed`;

      this.emitEvent({ type: 'agent_completed', teamId: params.teamId, agentId: agent.id, data: { result: agent.result }, timestamp: Date.now() });
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      this.emitEvent({ type: 'agent_failed', teamId: params.teamId, agentId: agent.id, data: { error: agent.error }, timestamp: Date.now() });
    }
  }

  /**
   * Send message between agents
   */
  sendMessage(from: string, to: string, content: string): boolean {
    // Verify agents exist
    const fromAgent = this.agents.get(from);
    const toAgent = this.agents.get(to);

    if (!fromAgent || !toAgent) {
      warn('agent', `Message failed: agent not found (from=${from}, to=${to})`);
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

    agent.status = 'cancelled';
    agent.completedAt = Date.now();
    this.agents.delete(agentId);

    info('agent', `Agent terminated: ${agentId}`);
  }

  /**
   * Get active agent count
   */
  getActiveAgentCount(): number {
    return Array.from(this.agents.values()).filter(a => a.status === 'running').length;
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
