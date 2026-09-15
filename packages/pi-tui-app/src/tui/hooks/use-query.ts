/**
 * useQuery Hook
 *
 * 对标 Loucode QueryGuard integration
 * 提供在 pi-tui 组件中使用 QueryGuard 的方式
 */

import type { QueryState } from '../state/query-guard';
import { getQueryGuard } from '../state/query-guard';

/**
 * useQuery 返回类型
 */
export interface UseQueryResult {
  /** 当前查询状态 */
  status: QueryState;
  /** 查询是否活跃 */
  isActive: boolean;
  /** 订阅状态变化 */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Query Guard Hook
 *
 * 在 pi-tui 组件中使用 QueryGuard
 * 返回当前状态和订阅方法
 */
export function useQuery(): UseQueryResult {
  const guard = getQueryGuard();

  return {
    status: guard.getSnapshot(),
    isActive: guard.isActive,
    subscribe: guard.subscribe.bind(guard),
  };
}

/**
 * useQuerySubscription Hook
 *
 * 创建 QueryGuard 订阅
 * 返回取消订阅函数
 */
export function useQuerySubscription(
  callback: (status: QueryState) => void,
): () => void {
  const guard = getQueryGuard();

  const listener = () => {
    callback(guard.getSnapshot());
  };

  return guard.subscribe(listener);
}

/**
 * useQueryGeneration Hook
 *
 * 获取当前 generation 并订阅变化
 */
export interface UseQueryGenerationResult {
  /** 当前 generation */
  generation: number | null;
  /** 查询是否运行中 */
  isRunning: boolean;
  /** 订阅变化 */
  subscribe: (listener: () => void) => () => void;
}

/**
 * QueryGuard Generation Hook
 *
 * 返回当前 generation 和运行状态
 */
export function useQueryGeneration(): UseQueryGenerationResult & {
  subscribe: (listener: () => void) => () => void;
} {
  const guard = getQueryGuard();

  return {
    generation: guard['_generation'] || null,
    isRunning: guard.getSnapshot() === 'running',
    subscribe: guard.subscribe.bind(guard),
  };
}
