/**
 * @upup/sdk - Session 模块 (SDK v5)
 *
 * 基于 upup 核心的 Session 实现
 * 复用 upup SessionManager，不自己实现
 */

// ✅ SDK v5: 基于 upup 核心的 Session (推荐)
export {
  UpupSessionManager,
} from './upup-session.js'

// ✅ 导出类型
export type {
  RpcTransport,
  UpupSessionManagerConfig,
} from './upup-session.js'

// ✅ 公共类型
export type {
  SessionStatus,
  SessionInfo,
  SessionConfig,
  SessionStore,
  SessionMessage,
  SessionEvent,
  SessionEventData,
} from './types.js'

// ✅ 保留向后兼容的导出 (deprecated)
export {
  JsonSessionStore,
  FileSessionStore,
  MemorySessionStore,
  createSessionStore,
} from './store.js'
