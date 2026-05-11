/**
 * @upup/sdk - Agent 便捷类
 * 提供类似 Claude Agent SDK 的 fluent API
 */

import { StdioAgentClient } from './stdio-client.js'
import type {
  AgentConfig,
  RunParams,
  RunResult,
  StreamEvent,
  Message,
  ToolDefinition,
  ToolHandler,
  HookEvent,
  HookHandler,
  HookContext,
} from './types.js'

/**
 * Agent 类 - 对外 SDK 主入口
 *
 * @example
 * ```typescript
 * const agent = new Agent({ model: 'claude-sonnet-4' })
 *
 * agent.registerTool({
 *   name: 'get_stock_price',
 *   description: '获取股票价格',
 *   inputSchema: { ticker: { type: 'string' } },
 *   handler: async ({ ticker }) => ({ price: 1800 })
 * })
 *
 * const result = await agent.run({
 *   messages: [{ role: 'user', content: '茅台现在多少钱?' }]
 * })
 * ```
 */
export class Agent {
  private config: AgentConfig
  private client: StdioAgentClient | null = null
  private tools: Map<string, ToolDefinition> = new Map()
  private hooks: Map<string, HookHandler[]> = new Map()
  private _isRunning = false

  constructor(config: AgentConfig = {}) {
    this.config = config
  }

  /**
   * 连接 Agent 进程
   */
  async connect(
    command: string = 'npx',
    args: string[] = ['upup-agent']
  ): Promise<void> {
    this.client = await StdioAgentClient.connect(command, args)
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    await this.client?.shutdown()
    this.client = null
  }

  /**
   * 注册单个工具
   */
  registerTool(tool: ToolDefinition): this {
    this.tools.set(tool.name, tool)
    return this
  }

  /**
   * 批量注册工具
   */
  registerTools(tools: ToolDefinition[]): this {
    for (const tool of tools) {
      this.registerTool(tool)
    }
    return this
  }

  /**
   * 移除工具
   */
  removeTool(name: string): this {
    this.tools.delete(name)
    return this
  }

  /**
   * 获取已注册的工具
   */
  getTools(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /**
   * 注册 Hook
   */
  useHook(event: HookEvent, handler: HookHandler): this {
    const handlers = this.hooks.get(event) || []
    handlers.push(handler)
    this.hooks.set(event, handlers)
    return this
  }

  /**
   * 获取已注册的 Hooks
   */
  getHooks(): Map<string, HookHandler[]> {
    return this.hooks
  }

  /**
   * 设置模型
   */
  setModel(model: string): this {
    this.config.model = model
    return this
  }

  /**
   * 设置最大迭代次数
   */
  setMaxIterations(n: number): this {
    this.config.maxIterations = n
    return this
  }

  /**
   * 设置系统提示词
   */
  setSystemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt
    return this
  }

  /**
   * 运行 Agent（非流式）
   */
  async run(params: RunParams): Promise<RunResult> {
    if (!this.client) {
      throw new Error('Agent not connected. Call connect() first.')
    }

    const allTools = [
      ...this.tools.values(),
      ...(params.tools || []),
    ]

    return this.client.run({
      ...params,
      tools: allTools,
    })
  }

  /**
   * 流式运行 Agent
   */
  async *runStream(params: RunParams): AsyncGenerator<StreamEvent> {
    if (!this.client) {
      throw new Error('Agent not connected. Call connect() first.')
    }

    const allTools = [
      ...this.tools.values(),
      ...(params.tools || []),
    ]

    yield* this.client.streamRun({
      ...params,
      tools: allTools,
    })
  }

  /**
   * 是否正在运行
   */
  get isRunning(): boolean {
    return this._isRunning
  }

  /**
   * 是否已连接
   */
  get isConnected(): boolean {
    return this.client?.connected ?? false
  }
}

// ============ 便捷函数 ============

/**
 * 创建 Agent 并连接
 */
export async function createAgent(
  config: AgentConfig = {},
  command: string = 'npx',
  args: string[] = ['upup-agent']
): Promise<Agent> {
  const agent = new Agent(config)
  await agent.connect(command, args)
  return agent
}

/**
 * 创建工具定义（类似 Claude SDK 的 define_tool）
 */
export function defineTool<T extends Record<string, unknown>>(
  config: {
    name: string
    description: string
    inputSchema: T
    handler: ToolHandler
    concurrency?: 'serial' | 'concurrent'
  }
): ToolDefinition {
  return {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    handler: config.handler,
    concurrency: config.concurrency,
  }
}

/**
 * 从工具函数自动生成工具定义
 */
export function toolFromFunction<T extends Record<string, unknown>>(
  name: string,
  description: string,
  handler: ToolHandler,
  inputSchema?: T
): ToolDefinition {
  return defineTool({
    name,
    description,
    inputSchema: inputSchema || ({} as T),
    handler,
  })
}
