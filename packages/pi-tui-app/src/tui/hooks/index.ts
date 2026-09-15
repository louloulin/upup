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
} from './use-store';
export type { Store } from '../state/store';

// Query Hooks
export {
  useQuery,
  useQuerySubscription,
  useQueryGeneration,
  type UseQueryResult,
  type UseQueryGenerationResult,
} from './use-query';

// Input Hooks
export {
  useInput,
  useArrowKeys,
  useEnterEscape,
  type KeyHandler,
  type InputHandlerMap,
  type UseInputOptions,
  type UseInputResult,
} from './use-input';

// Streaming Hooks
export {
  useStreaming,
  useTypingEffect,
  type StreamingState,
  type UseStreamingOptions,
  type UseStreamingResult,
  type UseTypingEffectOptions,
  type UseTypingEffectResult,
} from './use-streaming';

// Approval Hooks
export {
  useApproval,
  useApprovalSubscription,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalStatus,
  type ApprovalState,
  type UseApprovalResult,
} from './use-approval';

// CLI Integration Hooks
export {
  useCLIIntegration,
  createCLISubscription,
  type UseCLIIntegrationOptions,
  type UseCLIIntegrationResult,
} from './use-cli-integration';

// Reactive Render Hooks
export {
  useReactiveRender,
  startGlobalReactiveRender,
  stopGlobalReactiveRender,
  isGlobalReactiveRenderActive,
  requestReactiveRender,
  type UseReactiveRenderOptions,
  type UseReactiveRenderResult,
} from './use-reactive-render';
