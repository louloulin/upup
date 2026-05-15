/**
 * @upup/sdk - Client v2
 *
 * 基于 Transport 接口的 SDK 主入口
 * 对齐 Claude Code SDK 的 API 设计
 *
 * Phase 3: 工具和权限系统
 * Phase 4: Hooks 和会话管理
 * Phase 5: 进程池和 HTTP Transport
 */

import { EventEmitter } from 'events'
import {
  StdioTransport,
  createStdioTransport,
  loadUpupConfig,
  type StdioTransportConfig,
  type UpupConfig,
  type BinaryLocation,
} from '../transport/stdio-transport.js'
import type { Transport } from '../transport/transport.js'
import { PermissionManager, type PermissionMode, type CanUseTool } from '../permissions/index.js'
import { ToolRegistry, type Tool } from '../tools/index.js'
import { HookExecutor, type HookEvent, type HookInput, type HookMap } from '../hooks/index.js'
import { SessionManager, type SessionConfig, type SessionInfo } from '../session/index.js'
import { ProcessPool, type ProcessPoolConfig } from '../pool/index.js'
import { BetaAPI, createBetaAPI } from '../beta/index.js'
import type { RpcTransport } from '../messages.js'

// ============ 配置类型 ============

export interface ClientConfig {
  /** Provider: anthropic, deepseek, openai, google */
  provider?: 'anthropic' | 'deepseek' | 'openai' | 'google'
  /** 模型 ID */
  model?: string
  /** API Key */
  apiKey?: string
  /** Base URL */
  baseUrl?: string

  /** 覆盖自动检测的二进制位置 */
  binary?: BinaryLocation
  /** 开发模式：使用 bun run src/index.tsx */
  development?: boolean
  /** 环境变量（会与 process.env 合并） */
  env?: Record<string, string>
  /** 是否输出调试信息 */
  debug?: boolean
  /** 是否加载全局配置 */
  loadGlobalConfig?: boolean

  // ============ Phase 3: 工具和权限 ============

  /** 可用工具列表 */
  tools?: Tool[]
  /** 允许的工具列表 */
  allowedTools?: string[]
  /** 禁止的工具列表 */
  disallowedTools?: string[]
  /** 权限模式 */
  permissionMode?: PermissionMode
  /** 工具使用检查器 */
  canUseTool?: CanUseTool
  /** 回退模型 */
  fallbackModel?: string

  // ============ Phase 4: Hooks 和会话 ============

  /** Hooks 配置 */
  hooks?: HookMap
  /** 会话配置 */
  session?: SessionConfig

  // ============ Phase 5: 进程池 ============

  /** 是否启用进程池 (多个请求共用进程) */
  usePool?: boolean
  /** 进程池配置 */
  pool?: ProcessPoolConfig
}

// ============ 消息类型 ============

export interface SDKMessage {
  type: string
  [key: string]: unknown
}

export interface UserMessage {
  type: 'user'
  message: string
}

export interface AssistantMessage {
  type: 'assistant'
  message: {
    role: 'assistant'
    content: Array<{ type: string; text?: string; [key: string]: unknown }>
  }
}

export interface ResultMessage {
  type: 'result'
  result: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  duration_ms: number
}

export interface SystemMessage {
  type: 'system'
  apiKeySource: string
  model: string
}

export interface EventMessage {
  type: 'event'
  event: {
    type: string
    [key: string]: unknown
  }
}

// ============ Result 类型 ============

export interface Result {
  result: string
  usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  duration_ms?: number
}

// ============ PromptOptions ============

export interface PromptOptions {
  model?: string
  systemPrompt?: string
  appendSystemPrompt?: string
  maxTurns?: number
  tools?: object[]
  hooks?: Record<string, unknown>
}

// ============ UpClient ============

/**
 * UpClient - SDK 主入口
 *
 * Phase 3 支持:
 * - 工具注册和管理
 * - 权限管理
 * - canUseTool 回调
 *
 * Phase 4 支持:
 * - Hook 系统
 * - 会话管理
 *
 * Phase 5 支持:
 * - 进程池 (usePool 选项)
 * - HTTP Transport
 *
 * @example
 * ```typescript
 * import { createClient } from '@upup/sdk'
 *
 * const client = await createClient({
 *   provider: 'anthropic',
 *   model: 'claude-sonnet-4-6',
 *   tools: [getStockTool],
 *   permissionMode: 'acceptEdits',
 *   hooks: {
 *     PreToolUse: [{ matcher: 'bash*', hooks: [logToolUse] }]
 *   }
 * })
 *
 * const result = await client.query('Hello!')
 * console.log(result.result)
 *
 * await client.close()
 * ```
 */
export class UpClient extends EventEmitter implements AsyncDisposable {
  private transport: StdioTransport
  private config: ClientConfig
  private _connected = false
  private toolRegistry: ToolRegistry
  private permissionManager: PermissionManager
  private hookExecutor: HookExecutor
  private sessionManager: SessionManager
  private pool: ProcessPool | null = null
  private _beta: BetaAPI | null = null

  get connected(): boolean {
    return this._connected
  }

  get binarySource(): string {
    return this.transport.binarySource
  }

  /** 获取工具注册表 */
  get tools(): ToolRegistry {
    return this.toolRegistry
  }

  /** 获取权限管理器 */
  get permissions(): PermissionManager {
    return this.permissionManager
  }

  /** 获取 Hook 执行器 */
  get hooks(): HookExecutor {
    return this.hookExecutor
  }

  /** 获取会话管理器 */
  get session(): SessionManager {
    return this.sessionManager
  }

  /** 获取进程池 (如果有) */
  get processPool(): ProcessPool | null {
    return this.pool
  }

  /** 获取 Beta API (需要 HTTP Transport) */
  get beta(): BetaAPI {
    if (!this._beta) {
      // 需要 RpcTransport 才能使用 Beta API
      // StdioTransport 不支持 RPC 请求
      throw new Error('Beta API requires RpcTransport (HttpTransport)')
    }
    return this._beta
  }

  /** 检查 Beta API 是否可用 */
  get hasBeta(): boolean {
    return this._beta !== null
  }

  /**
   * 私有构造函数 - 使用 create() 工厂方法
   */
  private constructor(transport: StdioTransport, config: ClientConfig) {
    super()
    this.transport = transport
    this.config = config
    this.toolRegistry = new ToolRegistry()
    this.permissionManager = new PermissionManager({
      mode: config.permissionMode,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      canUseTool: config.canUseTool,
    })
    this.hookExecutor = new HookExecutor()
    this.sessionManager = new SessionManager(config.session)

    // 注册工具
    if (config.tools) {
      this.toolRegistry.registerAll(config.tools)
    }

    // 注册 Hooks
    if (config.hooks) {
      this.hookExecutor.registerAll(config.hooks)
    }
  }

  /**
   * 创建 UpClient 实例
   *
   * @param config 可选配置
   * @returns 初始化好的客户端
   */
  static async create(config: ClientConfig = {}): Promise<UpClient> {
    // 构建环境变量
    const env: Record<string, string> = { ...process.env } as Record<string, string>

    // 添加 API key 到环境变量
    if (config.apiKey) {
      switch (config.provider) {
        case 'anthropic':
          env.ANTHROPIC_API_KEY = config.apiKey
          break
        case 'deepseek':
          env.DEEPSEEK_API_KEY = config.apiKey
          break
        case 'openai':
          env.OPENAI_API_KEY = config.apiKey
          break
        case 'google':
          env.GOOGLE_API_KEY = config.apiKey
          break
        default:
          env.DEEPSEEK_API_KEY = config.apiKey
      }
    }

    // 添加用户自定义环境变量
    if (config.env) {
      Object.assign(env, config.env)
    }

    // 创建 Transport
    const transportConfig: StdioTransportConfig = {
      debug: config.debug,
      env,
      executablePath: config.binary?.command,
      args: config.binary?.args,
    }

    const transport = new StdioTransport(transportConfig)
    await transport.connect(transportConfig)

    const client = new UpClient(transport, config)
    client._connected = true

    // 初始化进程池
    if (config.usePool) {
      client.pool = new ProcessPool(config.pool, async () => {
        const poolTransport = new StdioTransport(transportConfig)
        await poolTransport.connect(transportConfig)
        return poolTransport
      })

      // 监听池事件
      client.pool.on('processCreated', (process) => {
        client.emit?.('pool:processCreated', process)
      })
      client.pool.on('processClosed', (process) => {
        client.emit?.('pool:processClosed', process)
      })
      client.pool.on('poolEmpty', () => {
        client.emit?.('pool:poolEmpty', {})
      })
    }

    // 初始化 Beta API (仅当有 RpcTransport 时)
    // 注意: StdioTransport 不支持 RPC，所以 Beta API 暂时不可用
    // 在未来通过 HttpTransport 时可以启用
    // client._beta = createBetaAPI(transport as unknown as RpcTransport)

    return client
  }

  /**
   * 设置 Beta API (需要 RpcTransport)
   *
   * 用于 HTTP Transport 模式下的 Beta API
   */
  setBetaAPI(transport: RpcTransport): void {
    this._beta = createBetaAPI(transport)
  }

  /**
   * 发送 query 并获取结果（非流式）
   * 对齐 Claude Code SDK 的 query() 方法
   */
  async query(query: string, options?: PromptOptions): Promise<Result> {
    // 收集所有消息
    const messages: SDKMessage[] = []

    for await (const msg of this.stream(query, options)) {
      messages.push(msg)

      // 检查消息类型
      const sdkMsg = msg as Record<string, unknown>

      // 如果是转换后的 SDK 格式
      if (sdkMsg.type === 'event' && sdkMsg.event) {
        const event = sdkMsg.event as Record<string, unknown>

        // 检查是否是 done 事件，有答案
        if (event?.type === 'done') {
          const answer = event.answer as string
          const usage = event.tokenUsage as Result['usage']
          const totalTime = event.totalTime as number | undefined

          if (answer && !answer.startsWith('Error:')) {
            return {
              result: answer,
              usage,
              duration_ms: totalTime,
            }
          }
        }
      }

      // 如果是原始 JSON-RPC 格式
      if (sdkMsg.method === 'event' && sdkMsg.params) {
        const params = sdkMsg.params as Record<string, unknown>
        const event = params.event as Record<string, unknown>

        // 检查是否是 done 事件，有答案
        if (event?.type === 'done') {
          const answer = event.answer as string
          const usage = event.tokenUsage as Result['usage']
          const totalTime = event.totalTime as number | undefined

          if (answer && !answer.startsWith('Error:')) {
            return {
              result: answer,
              usage,
              duration_ms: totalTime,
            }
          }
        }
      }
    }

    // 找到 result 消息
    const resultMsg = messages.find((m) => m.type === 'result') as ResultMessage | undefined

    if (resultMsg) {
      return {
        result: resultMsg.result,
        usage: resultMsg.usage,
        duration_ms: resultMsg.duration_ms,
      }
    }

    // 如果没有 result 消息，返回最后一条 assistant 消息
    const lastAssistant = messages.filter((m) => m.type === 'assistant').pop()
    if (lastAssistant) {
      const assistant = lastAssistant as AssistantMessage
      const text = assistant.message.content
        .filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
      return { result: text }
    }

    return { result: '' }
  }

  /**
   * 发送 query 并流式返回消息
   */
  async *stream(
    query: string,
    options?: PromptOptions
  ): AsyncGenerator<SDKMessage> {
    // 发送请求
    this.transport.send({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'run',
      params: {
        prompt: query,
        model: options?.model || this.config.model,
        systemPrompt: options?.systemPrompt,
        maxTurns: options?.maxTurns,
      },
    })

    // 接收消息
    for await (const msg of this.transport.messages()) {
      yield msg as SDKMessage

      // 收到 response 或 result 后结束
      const m = msg as Record<string, unknown>
      if (m.type === 'response' || m.type === 'result') {
        break
      }
    }
  }

  /**
   * 注册事件处理器
   */
  on(event: string, handler: (event: unknown) => void): void {
    let handlers = this.transport.eventHandlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this.transport.eventHandlers.set(event, handlers)
    }
    handlers.add(handler)
  }

  /**
   * 移除事件处理器
   */
  off(event: string, handler: (event: unknown) => void): void {
    this.transport.eventHandlers.get(event)?.delete(handler)
  }

  /**
   * 中断当前请求
   */
  async interrupt(): Promise<void> {
    await this.transport.interrupt()
  }

  // ============ Phase 3: 工具管理 ============

  /**
   * 注册工具
   */
  registerTool(tool: Tool): void {
    this.toolRegistry.register(tool)
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: Tool[]): void {
    this.toolRegistry.registerAll(tools)
  }

  /**
   * 获取工具
   */
  getTool(name: string): Tool | undefined {
    return this.toolRegistry.get(name)
  }

  /**
   * 获取所有工具
   */
  getTools(): Tool[] {
    return this.toolRegistry.getAll()
  }

  /**
   * 移除工具
   */
  unregisterTool(name: string): boolean {
    return this.toolRegistry.unregister(name)
  }

  /**
   * 获取工具名称列表
   */
  getToolNames(): string[] {
    return this.toolRegistry.getNames()
  }

  // ============ Phase 3: 权限管理 ============

  /**
   * 设置权限模式
   */
  setPermissionMode(mode: PermissionMode): void {
    this.permissionManager.setMode(mode)
  }

  /**
   * 获取当前权限模式
   */
  getPermissionMode(): PermissionMode {
    return this.permissionManager.getMode()
  }

  /**
   * 允许使用工具
   */
  allowTool(toolName: string): void {
    this.permissionManager.allowTool(toolName)
  }

  /**
   * 禁止使用工具
   */
  disallowTool(toolName: string): void {
    this.permissionManager.disallowTool(toolName)
  }

  /**
   * 设置工具使用检查器
   */
  setCanUseTool(checker: CanUseTool | undefined): void {
    this.permissionManager.setCanUseTool(checker)
  }

  /**
   * 检查工具使用权限
   */
  async checkToolPermission(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<{ allowed: boolean; reason?: string }> {
    const result = await this.permissionManager.checkPermission(toolName, input)

    if (result.behavior === 'allow') {
      return { allowed: true }
    }

    return {
      allowed: false,
      reason: result.message || 'Tool use denied by permission manager',
    }
  }

  // ============ Phase 4: Hooks ============

  /**
   * 注册 Hook
   */
  registerHook(event: HookEvent, matcher: { matcher?: string; hooks: Array<(input: HookInput) => Promise<void>> }): void {
    this.hookExecutor.register(event, matcher)
  }

  /**
   * 批量注册 Hooks
   */
  registerHooks(hooks: HookMap): void {
    this.hookExecutor.registerAll(hooks)
  }

  /**
   * 执行 Hook
   */
  async executeHook(event: HookEvent, input: HookInput): Promise<{ continue: boolean }> {
    const result = await this.hookExecutor.execute(event, input)
    return { continue: result.continue }
  }

  // ============ Phase 4: 会话管理 ============

  /**
   * 创建新会话
   */
  async createSession(config?: SessionConfig): Promise<SessionInfo> {
    return this.sessionManager.create(config)
  }

  /**
   * 获取当前会话
   */
  getCurrentSession(): SessionInfo | null {
    return this.sessionManager.getCurrentSession()
  }

  /**
   * 继续会话
   */
  async resumeSession(sessionId: string): Promise<void> {
    await this.sessionManager.continue(sessionId)
  }

  /**
   * 保存会话
   */
  async saveSession(): Promise<void> {
    await this.sessionManager.save()
  }

  // ============ Phase 5: 进程池 ============

  /**
   * 获取进程池状态
   */
  getPoolStatus(): { total: number; idle: number; busy: number; error: number; waiting: number } | null {
    if (!this.pool) {
      return null
    }
    return this.pool.getStatus()
  }

  /**
   * 检查进程池是否启用
   */
  isPoolEnabled(): boolean {
    return this.pool !== null
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    // 关闭会话管理器
    await this.sessionManager.close()
    // 清空 Hooks
    this.hookExecutor.clear()
    // 关闭进程池
    if (this.pool) {
      await this.pool.close()
      this.pool = null
    }
    // 关闭传输
    await this.transport.close()
    this._connected = false
  }

  /**
   * 使用后自动关闭
   */
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close()
  }
}

// ============ 工厂函数 ============

/**
 * 创建 UpClient 实例（推荐）
 */
export async function createClient(
  config?: ClientConfig
): Promise<UpClient> {
  return UpClient.create(config)
}

// ============ 导出类型 ============

export type {
  UpupConfig,
  BinaryLocation,
  StdioTransportConfig,
} from '../transport/stdio-transport.js'

export type { Transport } from '../transport/transport.js'