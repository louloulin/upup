/**
 * @upup/sdk - UP SDK 入口文件
 *
 * 对外 SDK，提供 Agent SDK 功能
 *
 * @example
 * ```typescript
 * import { Agent, defineTool } from '@upup/sdk'
 *
 * // 创建 Agent
 * const agent = new Agent({ model: 'claude-sonnet-4' })
 * await agent.connect('npx', ['upup-agent'])
 *
 * // 注册工具
 * agent.registerTool(defineTool({
 *   name: 'get_stock_price',
 *   description: '获取股票价格',
 *   inputSchema: { ticker: { type: 'string' } },
 *   handler: async ({ ticker }) => ({ price: 1800 })
 * }))
 *
 * // 运行
 * const result = await agent.run({
 *   messages: [{ role: 'user', content: '茅台现在多少钱?' }]
 * })
 * ```
 */

// Agent 类
export { Agent, createAgent, defineTool, toolFromFunction } from './agent.js'

// Stdio Client
export { StdioAgentClient, createAgentProcess } from './stdio-client.js'

// 类型
export type {
  Message,
  ToolResult,
  RunParams,
  RunResult,
  ToolDefinition,
  ToolContext,
  ToolHandler,
  AgentConfig,
  HookEvent,
  HookContext,
  HookHandler,
  HookResult,
  StreamEvent,
  StreamEventType,
  SubagentConfig,
  HandoffResult,
  SessionConfig,
} from './types.js'
