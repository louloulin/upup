/**
 * @upup/sdk - Hooks 模块
 */

export {
  HookExecutor,
  type HookExecutorConfig,
  type HookExecutionResult,
} from './executor'

export {
  HookRegistry,
  type HookEvent,
  type HookInput,
  type HookOutput,
  type HookCallback,
  type HookMatcher,
  type HookMap,
  type SDKMessage,
  HOOK_EVENTS,
} from './types'

// ============ PostSampling Hooks (P2) ============

export {
  PostSamplingHooks,
  createContentFilterHook,
  createLoggingHook,
  createMetadataHook,
  createAugmentHook,
} from './post-sampling'

export type {
  PostSamplingInput,
  PostSamplingOutput,
  PostSamplingCallback,
  PostSamplingConfig,
} from './post-sampling'
