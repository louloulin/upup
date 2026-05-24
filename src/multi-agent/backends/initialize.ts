/**
 * Backend Initialization
 * 
 * 注册所有后端到BackendRegistry
 */

import { getBackendRegistry } from './index.js';
import { InProcessBackend } from './inprocess.js';
import { WorkerPoolBackend } from './workerpool.js';
import { info } from '../../utils/logging/logger.js';

export function initializeBackends(): void {
  const registry = getBackendRegistry();
  
  // 注册InProcessBackend (默认)
  registry.register(new InProcessBackend());
  
  // 注册WorkerPoolBackend
  registry.register(new WorkerPoolBackend());
  
  // 设置默认后端
  registry.setDefault('inprocess');
  
  info('agent', `Backend registry initialized with ${registry.list().length} backends`);
}

/**
 * 获取指定类型的执行后端
 */
export function getBackendForSpawn(): { type: 'inprocess' | 'workerpool'; backend: any } {
  const registry = getBackendRegistry();
  
  // 优先使用WorkerPool (如果可用)
  const workerPool = registry.get('workerpool');
  if (workerPool?.isAvailable()) {
    return { type: 'workerpool', backend: workerPool };
  }
  
  // 回退到InProcess
  const inProcess = registry.get('inprocess');
  return { type: 'inprocess', backend: inProcess };
}
