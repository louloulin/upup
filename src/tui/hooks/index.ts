/**
 * TUI Hooks Module
 *
 * 导出所有 Hooks
 */

// Store Hooks
export {
  useStore,
  useStoreSelector,
  useStoreSubscription,
} from './use-store.js';
export type { Store } from '../state/store.js';

// Query Hooks
export {
  useQuery,
  useQuerySubscription,
  useQueryGeneration,
  type UseQueryResult,
  type UseQueryGenerationResult,
} from './use-query.js';

// Input Hooks
export {
  useInput,
  useArrowKeys,
  useEnterEscape,
  type KeyHandler,
  type InputHandlerMap,
  type UseInputOptions,
  type UseInputResult,
} from './use-input.js';

// Streaming Hooks
export {
  useStreaming,
  useTypingEffect,
  type StreamingState,
  type UseStreamingOptions,
  type UseStreamingResult,
  type UseTypingEffectOptions,
  type UseTypingEffectResult,
} from './use-streaming.js';

// Approval Hooks
export {
  useApproval,
  useApprovalSubscription,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalStatus,
  type ApprovalState,
  type UseApprovalResult,
} from './use-approval.js';
