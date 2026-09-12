/**
 * InProcessBackend - 进程内执行后端
 * 
 * 使用 Pi AgentSession 进行真实子 Agent 执行。
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { PiAgentSessionFactory, type UpUpAgentSession, type UpUpAgentSpec } from '../../runtime/pi/index.js';
import { info, warn, error as logError } from '../../utils/logging/logger.js';

export class InProcessBackend implements Backend {
  readonly type = 'inprocess' as const;
  readonly name = 'In-Process Backend';
  
  private agents: Map<string, AgentInstance> = new Map();
  private sessions: Map<string, UpUpAgentSession> = new Map();
  private readonly runtime = new PiAgentSessionFactory();
  
  isAvailable(): boolean {
    return true;
  }
  
  async spawn(params: SpawnAgentParams): Promise<AgentInstance> {
    const agentId = randomUUID();
    
    const agent: AgentInstance = {
      id: agentId,
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
    };
    
    this.agents.set(agentId, agent);
    
    // 使用真实Agent执行
    this.executeAgent(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
      logError('backend', `Agent execution failed: ${agent.name}`, err);
    });
    
    return agent;
  }
  
  private async executeAgent(agent: AgentInstance, params: SpawnAgentParams): Promise<void> {
    const timeout = params.timeoutMs ?? 300000;
    
    try {
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      info('backend', `Starting agent execution: ${agent.name}`);
      
      const prompt = params.prompt || `You are a ${params.role || 'agent'} named ${params.name}. Complete the assigned task.`;
      const session = await this.runtime.createSession(this.createSpec(params, timeout), {
        cwd: params.cwd,
        loadRegisteredTools: false,
        ...(params.piModel ? { model: params.piModel } : {}),
        ...(params.piModelRuntime ? { modelRuntime: params.piModelRuntime } : {}),
      });
      this.sessions.set(agent.id, session);
      agent.piSpec = session.spec;
      agent.piSessionId = session.id;
      agent.piToolNames = session.getAvailableToolNames();
      await session.prompt(prompt);
      await session.waitForIdle();
      const result = extractAssistantText(session.getMessages());
      if (result) {
        agent.status = 'completed';
        agent.completedAt = Date.now();
        agent.result = result;
        info('backend', `Agent completed: ${agent.name} in ${Date.now() - (agent.startedAt ?? Date.now())}ms`);
      } else {
        agent.status = 'failed';
        agent.error = 'Pi session completed without an assistant result';
        agent.completedAt = Date.now();
        warn('backend', `Agent failed: ${agent.name} - no assistant result`);
      }
      
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      agent.completedAt = Date.now();
      logError('backend', `Agent error: ${agent.name}`, error instanceof Error ? error : undefined);
    }
  }
  
  private createSpec(params: SpawnAgentParams, timeoutMs: number): UpUpAgentSpec {
    if (params.spec) return { ...params.spec, timeoutMs: params.spec.timeoutMs ?? timeoutMs };
    return {
      id: `worker-${params.role.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'agent'}`,
      version: '1.0.0',
      name: params.name,
      description: `Pi worker for ${params.role || 'general'} tasks`,
      systemPrompt: params.prompt,
      tools: params.tools ?? '*',
      model: params.model,
      mode: 'worker',
      capabilities: [params.role || 'general'],
      taskTypes: [params.role || 'general'],
      permissions: {
        id: 'multi-agent-read-only',
        allow: ['safe', 'warning'],
        requireApproval: [],
        deny: ['dangerous', 'critical'],
        allowExternalNetwork: true,
        allowCredentialAccess: false,
        allowFinancialWrites: false,
      },
      timeoutMs,
      outputContract: 'markdown',
    };
  }
  
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      await this.sessions.get(agentId)?.abort();
      this.sessions.get(agentId)?.dispose();
      this.sessions.delete(agentId);
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      this.agents.delete(agentId);
      info('backend', `Agent terminated: ${agent.name}`);
    }
  }
  
  async listActive(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).filter(a => a.status === 'running');
  }
  
  async getResult(agentId: string): Promise<string | undefined> {
    const agent = this.agents.get(agentId);
    return agent?.result;
  }
}

function extractAssistantText(messages: readonly unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== 'object' || !('role' in message) || message.role !== 'assistant') continue;
    const content = 'content' in message ? message.content : undefined;
    if (!Array.isArray(content)) continue;
    const text = content
      .filter((part): part is { type: 'text'; text: string } => Boolean(part && typeof part === 'object' && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string'))
      .map((part) => part.text)
      .join('\n')
      .trim();
    if (text) return text;
  }
  return undefined;
}
