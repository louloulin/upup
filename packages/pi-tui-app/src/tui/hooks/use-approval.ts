/**
 * useApproval Hook
 *
 * 对标 Loucode authorization handling
 * 处理工具执行授权的 Hook
 */

import { createStore } from '../state/store';

/**
 * 授权请求类型
 */
export type ApprovalRequest = {
  /** 唯一 ID */
  id: string;
  /** 工具名称 */
  tool: string;
  /** 工具参数 */
  params: Record<string, unknown>;
  /** 请求时间 */
  timestamp: number;
  /** 请求描述 */
  description?: string;
};

/**
 * 授权决策
 */
export type ApprovalDecision = 'approve' | 'deny' | 'approve-all' | 'deny-all';

/**
 * 授权状态
 */
export type ApprovalStatus = 'idle' | 'pending' | 'approved' | 'denied';

/**
 * Approval State
 */
export interface ApprovalState {
  /** 当前授权请求 */
  currentRequest: ApprovalRequest | null;
  /** 授权状态 */
  status: ApprovalStatus;
  /** 决策历史 */
  decisions: Array<{
    requestId: string;
    decision: ApprovalDecision;
    timestamp: number;
  }>;
}

/**
 * Approval Hook 返回类型
 */
export interface UseApprovalResult {
  /** 当前授权请求 */
  request: ApprovalRequest | null;
  /** 授权状态 */
  status: ApprovalStatus;
  /** 发起授权请求 */
  requestApproval: (request: Omit<ApprovalRequest, 'id' | 'timestamp'>) => string;
  /** 做出决策 */
  decide: (requestId: string, decision: ApprovalDecision) => void;
  /** 取消请求 */
  cancel: () => void;
  /** 检查是否有待处理请求 */
  hasPendingRequest: () => boolean;
  /** 获取请求历史 */
  getHistory: () => ApprovalState['decisions'];
}

/**
 * 创建 Approval Store
 */
function createApprovalStore() {
  const initialState: ApprovalState = {
    currentRequest: null,
    status: 'idle',
    decisions: [],
  };

  return createStore(initialState);
}

/**
 * useApproval Hook
 *
 * 处理工具执行的授权请求
 *
 * @example
 * ```typescript
 * const { request, status, requestApproval, decide, cancel } = useApproval();
 *
 * // 发起授权请求
 * const requestId = requestApproval({
 *   tool: 'bash',
 *   params: { command: 'rm -rf /' },
 *   description: '删除文件系统',
 * });
 *
 * // 用户决策
 * decide(requestId, 'approve');
 * ```
 */
export function useApproval(): UseApprovalResult {
  const store = createApprovalStore();

  const requestApproval = (
    req: Omit<ApprovalRequest, 'id' | 'timestamp'>,
  ): string => {
    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request: ApprovalRequest = {
      ...req,
      id,
      timestamp: Date.now(),
    };

    store.setState(prev => ({
      ...prev,
      currentRequest: request,
      status: 'pending',
    }));

    return id;
  };

  const decide = (requestId: string, decision: ApprovalDecision): void => {
    store.setState(prev => {
      if (!prev.currentRequest || prev.currentRequest.id !== requestId) {
        return prev;
      }

      return {
        ...prev,
        status: decision.startsWith('approve') ? 'approved' : 'denied',
        decisions: [
          ...prev.decisions,
          {
            requestId,
            decision,
            timestamp: Date.now(),
          },
        ],
        currentRequest: null,
      };
    });
  };

  const cancel = (): void => {
    store.setState(prev => ({
      ...prev,
      currentRequest: null,
      status: 'idle',
    }));
  };

  const hasPendingRequest = (): boolean => {
    const state = store.getState();
    return state.status === 'pending' && state.currentRequest !== null;
  };

  const getHistory = (): ApprovalState['decisions'] => {
    return store.getState().decisions;
  };

  return {
    get request() {
      return store.getState().currentRequest;
    },
    get status() {
      return store.getState().status;
    },
    requestApproval,
    decide,
    cancel,
    hasPendingRequest,
    getHistory,
  };
}

/**
 * useApprovalSubscription Hook
 *
 * 订阅授权状态变化
 */
export function useApprovalSubscription(
  callback: (state: ApprovalState) => void,
): () => void {
  const store = createApprovalStore();
  return store.subscribe(() => callback(store.getState()));
}
