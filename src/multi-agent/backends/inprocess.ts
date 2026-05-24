/**
 * InProcessBackend - 进程内执行后端
 * 
 * 复用现有UpUp Agent系统进行子Agent执行
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';

export class InProcessBackend implements Backend {
  readonly type = 'inprocess' as const;
  readonly name = 'In-Process Backend';
  
  private agents: Map<string, AgentInstance> = new Map();
  
  isAvailable(): boolean {
    return true; // 始终可用
  }
  
  async spawn(params: SpawnAgentParams): Promise<AgentInstance> {
    const agent: AgentInstance = {
      id: randomUUID(),
      teamId: params.teamId,
      name: params.name,
      role: params.role,
      status: 'pending',
      createdAt: Date.now(),
    };
    
    this.agents.set(agent.id, agent);
    
    // 执行Agent (异步模拟)
    this.executeAgent(agent, params).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
    });
    
    return agent;
  }
  
  private async executeAgent(agent: AgentInstance, params: SpawnAgentParams): Promise<void> {
    try {
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      // 模拟执行延迟 (实际会调用Agent系统)
      const maxTurns = params.maxTurns ?? 10;
      const timeout = params.timeoutMs ?? 300000;
      const startTime = Date.now();
      
      // 简单模拟: 执行几个回合
      let turns = 0;
      while (turns < maxTurns && agent.status === 'running') {
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // 检查超时
        if (Date.now() - startTime > timeout) {
          agent.status = 'failed';
          agent.error = 'Timeout exceeded';
          return;
        }
        
        turns++;
        
        // 模拟完成
        if (turns >= Math.min(3, maxTurns)) {
          agent.status = 'completed';
          agent.completedAt = Date.now();
          agent.result = `Agent ${agent.name} completed ${turns} turns`;
          return;
        }
      }
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
    }
  }
  
  async terminate(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      this.agents.delete(agentId);
    }
  }
  
  async listActive(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).filter(a => a.status === 'running');
  }
}
