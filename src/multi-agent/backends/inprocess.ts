/**
 * InProcessBackend - 进程内执行后端
 * 
 * 集成UpUp Agent系统进行真实子Agent执行
 * 使用SubagentRunner进行Agent生命周期管理
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { getDefaultSubagentRunner, type SubagentRunner } from '../../agent/subagent-runner.js';
import type { SubagentConfig, SubagentResult } from '../../agent/subagent.js';
import { info, warn, error as logError } from '../../utils/logging/logger.js';

export class InProcessBackend implements Backend {
  readonly type = 'inprocess' as const;
  readonly name = 'In-Process Backend';
  
  private agents: Map<string, AgentInstance> = new Map();
  private runner: SubagentRunner;
  
  constructor() {
    this.runner = getDefaultSubagentRunner();
  }
  
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
      
      // 构建Agent配置
      const config: SubagentConfig = {
        agentType: params.role || 'executor',
        context: params.context || 'inline',
        timeoutMs: timeout,
        maxTurns: params.maxTurns ?? 10,
        tools: params.tools === '*' ? '*' : (params.tools || []),
        model: params.model,
        cwd: params.cwd,
        sessionId: `team-${params.teamId}-agent-${agent.id}`,
      };
      
      // 执行Agent
      const prompt = params.prompt || `You are a ${params.role || 'agent'} named ${params.name}.`;
      
      const result = await this.runner.run(
        config,
        prompt,
        undefined,
        (event) => {
          // Forward events
        }
      );
      
      // 更新Agent状态
      if (result.success) {
        agent.status = 'completed';
        agent.completedAt = Date.now();
        agent.result = result.output;
        info('backend', `Agent completed: ${agent.name} in ${result.duration}ms`);
      } else {
        agent.status = 'failed';
        agent.error = result.error;
        agent.completedAt = Date.now();
        warn('backend', `Agent failed: ${agent.name} - ${result.error}`);
      }
      
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      agent.completedAt = Date.now();
      logError('backend', `Agent error: ${agent.name}`, error instanceof Error ? error : undefined);
    }
  }
  
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
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
