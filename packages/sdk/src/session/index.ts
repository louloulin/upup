/**
 * @upup/sdk - Session 模块
 */

export {
  SessionManager,
} from './manager.js'

// SDK v4: 基于 upup 核心的 Session (推荐)
export {
  UpupSessionManager,
} from './upup-session.js'

export type {
  RpcTransport,
  UpupSessionManagerConfig,
} from './upup-session.js'

export {
  JsonSessionStore,
  FileSessionStore,
  MemorySessionStore,
  createSessionStore,
} from './store.js'

export type {
  SessionStatus,
  SessionInfo,
  SessionConfig,
  SessionStore,
  SessionMessage,
  SessionEvent,
  SessionEventData,
} from './types.js'
