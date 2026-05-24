/**
 * Backend Initialization
 * 
 * 注册所有后端到BackendRegistry
 * 
 * @version 2.0 - 支持4种后端类型
 */

import { getBackendRegistry } from './index.js';
import { InProcessBackend } from './inprocess.js';
import { WorkerPoolBackend } from './workerpool.js';
import { TmuxBackend } from './tmux.js';
import { ITerm2Backend } from './iterm2.js';
import { info } from '../../utils/logging/logger.js';

/**
 * 初始化所有后端
 */
export function initializeBackends(): void {
  const registry = getBackendRegistry();
  
  // 注册InProcessBackend (默认/兜底)
  registry.register(new InProcessBackend());
  
  // 注册WorkerPoolBackend (Daemon Worker)
  registry.register(new WorkerPoolBackend());
  
  // 注册TmuxBackend (终端复用器)
  registry.register(new TmuxBackend());
  
  // 注册ITerm2Backend (iTerm2集成)
  registry.register(new ITerm2Backend());
  
  // 设置默认后端 (优先WorkerPool)
  const autoDetected = registry.detect();
  if (autoDetected) {
    registry.setDefault(autoDetected.type);
  } else {
    registry.setDefault('inprocess');
  }
  
  const stats = registry.getStats();
  info('agent', `Backend registry initialized: ${stats.available}/${stats.total} backends available`);
}

/**
 * 获取指定类型的执行后端
 * 
 * @param preferredType 优先使用的后端类型
 * @returns 后端实例和类型
 */
export function getBackendForSpawn(preferredType?: BackendType): { 
  type: BackendType; 
  backend: any;
} {
  const registry = getBackendRegistry();
  
  // 如果指定了类型，优先使用
  if (preferredType) {
    const backend = registry.get(preferredType);
    if (backend?.isAvailable()) {
      return { type: preferredType, backend };
    }
  }
  
  // 自动检测可用后端
  const autoDetected = registry.detect();
  if (autoDetected) {
    return { type: autoDetected.type, backend: autoDetected };
  }
  
  // 回退到InProcess
  const inProcess = registry.get('inprocess');
  return { type: 'inprocess', backend: inProcess };
}

/**
 * 列出所有可用的后端
 */
export function listAvailableBackends(): Array<{
  type: BackendType;
  name: string;
  available: boolean;
}> {
  const registry = getBackendRegistry();
  return registry.list();
}

// Re-export BackendType
import type { BackendType } from '../types.js';
export type { BackendType };
