/**
 * @upup/sdk - UP SDK 入口文件
 *
 * 对外 SDK，提供 Agent SDK 功能
 * 对齐 Claude Code Agent SDK 的 API 设计
 *
 * @example
 * ```typescript
 * import { createClient } from '@upup/sdk'
 *
 * // 创建客户端 (自动加载 ~/.upup/settings.json)
 * const client = await createClient()
 *
 * // 发送 query
 * const result = await client.query('分析茅台股票')
 * console.log(result.result)
 *
 * // 流式输出
 * for await (const msg of client.stream('分析 AAPL')) {
 *   console.log(msg)
 * }
 *
 * // 关闭
 * await client.close()
 * ```
 */

// ============ Client v2 ============

export {
  UpClient,
  createClient,
} from './client/client.js'

export type {
  ClientConfig,
  SDKMessage,
  UserMessage,
  AssistantMessage,
  ResultMessage,
  SystemMessage,
  EventMessage,
  Result,
  PromptOptions,
  UpupConfig,
  BinaryLocation,
  StdioTransportConfig,
} from './client/client.js'

// ============ Transport ============

export {
  StdioTransport,
  HttpTransport,
  createStdioTransport,
  createHttpTransport,
  loadUpupConfig,
} from './transport/index.js'

export type {
  Transport,
  TransportConfig,
  StdioTransportConfig,
  HttpTransportConfig,
  TransportMessage,
  EventHandler,
} from './transport/index.js'

// ============ Tools ============

export {
  ToolConfiguration,
} from './tools/index.js'

export type {
  Tool,
  ToolInputSchema,
  ToolUseResult,
  ToolEvent,
  ToolStartEvent,
  ToolEndEvent,
  ToolErrorEvent,
  JSONSchema,
} from './tools/index.js'

// ============ Permissions ============

export {
  PermissionManager,
} from './permissions/index.js'

export type {
  PermissionMode,
  PermissionResult,
  CanUseTool,
  PermissionContext,
  PermissionEvent,
  PermissionRequestEvent,
  PermissionDeniedEvent,
} from './permissions/index.js'

// ============ Hooks (Phase 4) ============

export {
  HookExecutor,
  HookRegistry,
  PostSamplingHooks,
  createContentFilterHook,
  createLoggingHook,
  createMetadataHook,
  createAugmentHook,
} from './hooks/index.js'

export type {
  HookEvent,
  HookInput,
  HookOutput,
  HookCallback,
  HookMatcher,
  HookMap,
  HookExecutorConfig,
  HookExecutionResult,
  HOOK_EVENTS,
  PostSamplingInput,
  PostSamplingOutput,
  PostSamplingCallback,
  PostSamplingConfig,
} from './hooks/index.js'

// ============ Session (Phase 4) ============

export {
  SessionManager,
} from './session/index.js'

export type {
  SessionStatus,
  SessionInfo,
  SessionConfig,
  SessionStore,
  SessionMessage,
  SessionEvent,
  SessionEventData,
} from './session/index.js'

// ============ Pool (Phase 5) ============

export {
  ProcessPool,
} from './pool/index.js'

export type {
  ProcessPoolConfig,
  PooledProcess,
  PooledProcessStatus,
  ProcessPoolEvent,
} from './pool/index.js'

// ============ Errors (P1) ============

export {
  SDKError,
  SessionError,
  TransportError,
  MemoryError,
  ValidationError,
  PermissionError,
  NetworkError,
  InitializationError,
  ErrorCode,
  isSDKError,
  isSessionError,
  isTransportError,
  toSDKError,
  tryRecoverError,
} from './errors.js'

// ============ Tool Errors (P1) ============

export {
  ToolError,
  ToolUseError,
  ToolResultError,
  ToolNotFoundError,
  ToolTimeoutError,
  ToolPermissionDeniedError,
  ToolAbortedError,
  ToolValidationError,
  isToolError,
  toToolError,
} from './tool-error.js'

// ============ Messages API (P1) ============

export {
  MessagesClient,
} from './messages.js'

export type {
  MessageParam,
  ContentBlock,
  TextContentBlock,
  ToolUseContentBlock,
  ToolResultContentBlock,
  MessageCreateParams,
  Message,
  TokenCount,
  StreamEvent,
  MessagesClientConfig,
  CountTokensParams,
} from './messages.js'

// ============ Tool Runner (P1) ============

export {
  ToolRunner,
  ClientToolRunner,
} from './tool-runner.js'

export type {
  ToolRunnerParams,
  RunnableTool,
  ToolContext,
  ToolResponse,
  RunResult,
} from './tool-runner.js'

// ============ Session Store (P2) ============

export {
  JsonSessionStore,
  FileSessionStore,
  MemorySessionStore,
  createSessionStore,
} from './session/store.js'

// ============ Beta Tools (P2) ============

export {
  betaTool,
  betaZodTool,
} from './beta-tool.js'

export type {
  BetaToolOptions,
  JsonSchema,
  JsonSchemaProperty,
  ToolContext as BetaToolContext,
  BetaZodToolOptions,
  ZodSchema,
} from './beta-tool.js'

// ============ Token Counter (P2) ============

export {
  TokenCounter,
  countTokens,
  countMessageTokens,
} from './token.js'

// ============ Memory Tools (P2) ============

export {
  createMemoryTools,
} from './memory/tool.js'

export type {
  MemoryType,
  MemoryToolOptions,
  MemoryTools,
} from './memory/tool.js'

// ============ Beta API (P2) ============

export {
  BetaAPI,
  BetaMessagesAPI,
  BetaToolRunner,
  createBetaAPI,
} from './beta/index.js'

export type {
  BetaToolRunnerParams,
  BetaMessageStreamParams,
  BetaToolRunnerResult,
} from './beta/index.js'

// ============ Batch API (P2) ============

export {
  BatchClient,
  BatchToolRunner,
} from './batch.js'

export type {
  BatchRequestItem,
  BatchRequestParams,
  BatchCreateParams,
  BatchProcessingStatus,
  BatchInfo,
  BatchResultItem,
  BatchCreateResponse,
  BatchToolRunnerParams,
  BatchToolRunnerResult,
} from './batch.js'
