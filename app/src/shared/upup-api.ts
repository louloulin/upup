/**
 * UpUp SDK API 契约 — 渲染层看到的是这份类型化接口。
 *
 * 严格映射 @upup/sdk 的公开方法：
 * - UpClient.query() / .stream() / .close() / .tools.list() / .session.list()
 * - 不引入 SDK 不支持的字段（sessionId / signal）— 那是私有 API
 * - 会话管理由 SDK 内部处理（ClientConfig.useUpupSession = true）
 * - 取消机制在主进程层用 AbortController + for-await break 实现
 */
import type {
  ClientConfig,
  SDKMessage,
  Result,
  PromptOptions,
  Tool
} from '@upup/sdk'

export type UpupHealth = {
  ok: boolean
  engine: 'upup'
  version: string
  label: string
  uptime: number
  error?: string
}

export type UpupTool = { name: string; description: string }

export type UpupSkill = { name: string; description: string; category: string }

export type UpupSession = {
  id: string
  title: string
  updatedAt: number
  status: string
}

export type UpupTokenUsage = {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export type UpupQueryResult = {
  result: string
  usage?: UpupTokenUsage
}

export type UpupStreamEvent =
  | { turnId: string; event: 'assistant'; data: { text: string } }
  | { turnId: string; event: 'tool_use'; data: { name: string; input: unknown } }
  | { turnId: string; event: 'tool_result'; data: { name: string; output: unknown } }
  | { turnId: string; event: 'result'; data: { result: string; usage?: UpupTokenUsage; duration_ms?: number } }
  | { turnId: string; event: 'error'; data: { message: string } }
  | { turnId: string; event: 'done'; data: Record<string, never> }
  | { turnId: string; event: 'message'; data: SDKMessage }

/**
 * 渲染层可访问的 UpUp API 全部方法。
 */
export interface UpupApi {
  /** 引擎健康检查（不抛错） */
  health(): Promise<UpupHealth>
  /** 列出已注册的工具。引擎未就绪返回空数组。 */
  listTools(): Promise<UpupTool[]>
  /** 列出 SKILL.md。引擎未就绪返回空数组。 */
  listSkills(): Promise<UpupSkill[]>
  /** 列出所有会话。引擎未就绪返回空数组。 */
  listSessions(): Promise<UpupSession[]>
  /** 非流式 query */
  query(prompt: string, opts?: { systemPrompt?: string }): Promise<UpupQueryResult>
  /**
   * 流式调用。立即返回 turnId，事件通过 onStream 回调推送。
   */
  stream(prompt: string, opts?: { systemPrompt?: string }): Promise<{ turnId: string }>
  /** 取消进行中的流 */
  cancel(turnId: string): Promise<{ ok: boolean }>
  /** 订阅流事件；返回 unsubscribe 函数 */
  onStream(handler: (msg: UpupStreamEvent) => void): () => void
}

// ============ 内部辅助：renderer 需要的 SDK 类型 re-export ============

export type { ClientConfig, SDKMessage, Result, PromptOptions, Tool }
