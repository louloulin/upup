/**
 * Backend Registry - 多智能体执行后端
 * 
 * 基于Claude Code Swarm Backends设计:
 * - InProcessBackend: 进程内执行 (复用现有Agent)
 * - WorkerPoolBackend: Worker池执行 (复用Daemon)
 * - TmuxBackend: Tmux终端执行
 * - ITerm2Backend: iTerm2终端执行
 * 
 * @version 2.0 - 完成所有4种后端实现
 */

import type { AgentInstance, BackendType, SpawnAgentParams } from '../types.js';
import { randomUUID } from 'crypto';
import { info, warn } from '@upup/utils/logging/logger';

// Re-export all backends
export { InProcessBackend } from './inprocess.js';
export { WorkerPoolBackend } from './workerpool.js';
export { TmuxBackend } from './tmux.js';
export { ITerm2Backend } from './iterm2.js';
export { initializeBackends, getBackendForSpawn } from './initialize.js';
export type { BackendType } from '../types.js';

/**
 * Backend基类接口
 */
export interface Backend {
  type: BackendType;
  name: string;
  isAvailable(): boolean;
  spawn(params: SpawnAgentParams): Promise<AgentInstance>;
  terminate(agentId: string): Promise<void>;
  listActive(): Promise<AgentInstance[]>;
}

/**
 * Backend注册表
 * 
 * 管理所有可用的执行后端，支持:
 * - 自动注册
 * - 默认后端设置
 * - 可用性检测
 * - 优先级排序
 */
export class BackendRegistry {
  private backends: Map<BackendType, Backend> = new Map();
  private defaultBackend: BackendType = 'inprocess';

  /**
   * 注册后端
   */
  register(backend: Backend): void {
    this.backends.set(backend.type, backend);
    info('agent', `Backend registered: ${backend.name} (${backend.type})`);
  }

  /**
   * 取消注册后端
   */
  unregister(type: BackendType): void {
    this.backends.delete(type);
    info('agent', `Backend unregistered: ${type}`);
  }

  /**
   * 获取后端
   */
  get(type?: BackendType): Backend | undefined {
    return type ? this.backends.get(type) : this.backends.get(this.defaultBackend);
  }

  /**
   * 列出所有可用后端
   */
  list(): Array<{ type: BackendType; name: string; available: boolean }> {
    return Array.from(this.backends.values()).map(b => ({
      type: b.type,
      name: b.name,
      available: b.isAvailable(),
    }));
  }

  /**
   * 获取所有已注册的后端
   */
  getAll(): Backend[] {
    return Array.from(this.backends.values());
  }

  /**
   * 设置默认后端
   */
  setDefault(type: BackendType): void {
    if (!this.backends.has(type)) {
      warn('agent', `Cannot set default backend: ${type} not registered`);
      return;
    }
    this.defaultBackend = type;
    info('agent', `Default backend set to: ${type}`);
  }

  /**
   * 获取默认后端类型
   */
  getDefault(): BackendType {
    return this.defaultBackend;
  }

  /**
   * 自动检测可用后端 (按优先级)
   * 
   * 优先级: workerpool > tmux > iterm2 > inprocess
   */
  detect(): Backend | undefined {
    const priority: BackendType[] = ['workerpool', 'tmux', 'iterm2', 'inprocess'];
    
    for (const type of priority) {
      const backend = this.backends.get(type);
      if (backend && backend.isAvailable()) {
        info('agent', `Auto-detected backend: ${type}`);
        return backend;
      }
    }
    
    return this.backends.get('inprocess');
  }

  /**
   * 列出可用的后端
   */
  getAvailable(): Backend[] {
    return Array.from(this.backends.values()).filter(b => b.isAvailable());
  }

  /**
   * 获取后端状态统计
   */
  getStats(): {
    total: number;
    available: number;
    byType: Array<{ type: BackendType; name: string; available: boolean }>;
  } {
    const byType = this.list();
    return {
      total: byType.length,
      available: byType.filter(b => b.available).length,
      byType,
    };
  }
}

// Singleton
let registry: BackendRegistry | null = null;

export function getBackendRegistry(): BackendRegistry {
  if (!registry) {
    registry = new BackendRegistry();
  }
  return registry;
}

/**
 * 重置后端注册表 (用于测试)
 */
export function resetBackendRegistry(): void {
  registry = new BackendRegistry();
}
