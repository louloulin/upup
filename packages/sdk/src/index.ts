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
  ToolRegistry,
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