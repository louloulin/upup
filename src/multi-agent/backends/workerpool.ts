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

export class WorkerPoolBackend implements Backend {
  readonly type = 'workerpool' as const;
  readonly name = 'Worker Pool Backend';
  
  private workers: Map<string, { id: string; busy: boolean }> = new Map();
  private maxWorkers = 5;
  
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
      
      // 模拟Worker执行
      await new Promise(resolve => setTimeout(resolve, 150));
      
      agent.status = 'completed';
      agent.completedAt = Date.now();
      agent.result = `Agent ${agent.name} executed via worker ${workerId}`;
      
      // 释放Worker
      this.workers.set(agent.id, { id: workerId, busy: false });
    } catch (error) {
      agent.status = 'failed';
      agent.error = error instanceof Error ? error.message : String(error);
    }
  }
  
  async terminate(agentId: string): Promise<void> {
    const worker = this.workers.get(agentId);
    if (worker) {
      worker.busy = false;
      this.workers.delete(agentId);
    }
  }
  
  async listActive(): Promise<AgentInstance[]> {
    return []; // 由Worker系统管理
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
