/**
 * WorkerPoolBackend - Worker池执行后端
 * 
 * 复用Daemon Worker系统进行子Agent执行
 */

import type { AgentInstance, SpawnAgentParams } from '../types.js';
import { Backend } from './index.js';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { info } from '../../utils/logging/logger.js';
import { createPiWorker, extractPiAssistantText } from './pi-worker.js';
import type { UpUpAgentSession } from '../../runtime/pi/index.js';

export class WorkerPoolBackend implements Backend {
  readonly type = 'workerpool' as const;
  readonly name = 'Worker Pool Backend';
  
  private workers: Map<string, { id: string; busy: boolean }> = new Map();
  private maxWorkers = 5;
  private agents: Map<string, AgentInstance> = new Map();
  private sessions: Map<string, UpUpAgentSession> = new Map();
  
  isAvailable(): boolean {
    // 检查Daemon是否运行
    const daemonPidPath = '.upup/daemon.pid';
    return existsSync(daemonPidPath);
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
    
    // 分配Worker
    const workerId = this.assignWorker();
    this.workers.set(agent.id, { id: workerId, busy: true });
    this.agents.set(agent.id, agent);
    
    // 执行Agent (Worker池执行)
    this.executeViaWorker(agent, params, workerId).catch(err => {
      agent.status = 'failed';
      agent.error = err.message;
    });
    
    return agent;
  }
  
  private assignWorker(): string {
    // 简单轮询分配
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => !w.busy);
    
    if (availableWorkers.length > 0) {
      return availableWorkers[0].id;
    }
    
    // 创建新Worker (模拟)
    return `worker-${this.workers.size + 1}`;
  }
  
  private async executeViaWorker(
    agent: AgentInstance, 
    params: SpawnAgentParams, 
    workerId: string
  ): Promise<void> {
    try {
      agent.status = 'running';
      agent.startedAt = Date.now();
      
      info('agent', `Worker ${workerId} executing agent ${agent.id}`);
      
      const session = await createPiWorker(params);
      this.sessions.set(agent.id, session);
      agent.piSpec = session.spec;
      agent.piSessionId = session.id;
      agent.piToolNames = session.getAvailableToolNames();
      await session.prompt(params.prompt || `You are a ${params.role || 'agent'} named ${params.name}.`);
      await session.waitForIdle();
      const output = extractPiAssistantText(session.getMessages());
      agent.status = output ? 'completed' : 'failed';
      agent.completedAt = Date.now();
      agent.result = output;
      if (!output) agent.error = 'Pi session completed without an assistant result';
      session.dispose();
      this.sessions.delete(agent.id);
      
      // 释放Worker
      this.workers.set(agent.id, { id: workerId, busy: false });
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
      agent.completedAt = Date.now();
      this.workers.set(agent.id, { id: workerId, busy: false });
      this.sessions.get(agent.id)?.dispose();
      this.sessions.delete(agent.id);
    }
  }
  
  async terminate(agentId: string): Promise<void> {
    await this.sessions.get(agentId)?.abort();
    this.sessions.get(agentId)?.dispose();
    this.sessions.delete(agentId);
    const worker = this.workers.get(agentId);
    if (worker) {
      worker.busy = false;
      this.workers.delete(agentId);
    }
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.status = 'cancelled';
      agent.completedAt = Date.now();
      this.agents.delete(agentId);
    }
  }
  
  async listActive(): Promise<AgentInstance[]> {
    return Array.from(this.workers.entries())
      .filter(([, worker]) => worker.busy)
      .map(([agentId]) => this.agents.get(agentId))
      .filter((agent): agent is AgentInstance => Boolean(agent && agent.status === 'running'));
  }
  
  /**
   * 获取Worker统计
   */
  getStats(): { total: number; busy: number; available: number } {
    const total = this.workers.size;
    const busy = Array.from(this.workers.values()).filter(w => w.busy).length;
    return { total, busy, available: this.maxWorkers - busy };
  }
}
