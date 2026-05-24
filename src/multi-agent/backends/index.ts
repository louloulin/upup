/**
 * Backend Registry - 多智能体执行后端
 * 
 * 基于Claude Code Swarm Backends设计:
 * - InProcessBackend: 进程内执行 (复用现有Agent)
 * - WorkerPoolBackend: Worker池执行 (复用Daemon)
 * - TmuxBackend: Tmux终端执行
 * - ITerm2Backend: iTerm2终端执行
 */

import type { AgentInstance, BackendType, SpawnAgentParams } from '../types.js';
import { randomUUID } from 'crypto';
import { info, warn } from '../../utils/logging/logger.js';

export { InProcessBackend } from './inprocess.js';
export { WorkerPoolBackend } from './workerpool.js';
export { initializeBackends, getBackendForSpawn } from './initialize.js';

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
   * 自动检测可用后端
   */
  detect(): Backend | undefined {
    // 按优先级检测
    const priority: BackendType[] = ['workerpool', 'tmux', 'iterm2', 'inprocess'];
    
    for (const type of priority) {
      const backend = this.backends.get(type);
      if (backend && backend.isAvailable()) {
        return backend;
      }
    }
    
    return this.backends.get('inprocess');
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
