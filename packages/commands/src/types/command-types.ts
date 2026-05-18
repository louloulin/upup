/**
 * Unified Command Types
 *
 * 定义三种命令类型 (prompt/local/local-jsx)，对齐 loucode 的命令类型体系。
 *
 * Reference: loucode/src/types/command.ts
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

// ============================================================================
// Tool Use Context (基础上下文)
// ============================================================================

export interface ToolUseContext {
  cwd: string
  env: Record<string, string>
  sessionId?: string
  model?: string
  /** Extended state from AppState */
  state?: {
    totalInputTokens?: number
    totalOutputTokens?: number
    totalTokens?: number
    totalCostUSD?: number
    totalToolCalls?: number
    totalToolErrors?: number
    messageCount?: number
    compactionCount?: number
    proactiveEventsCount?: number
    provider?: string
  }
  /** Session duration in milliseconds */
  sessionDuration?: number
  /** Additional context providers */
  getAppState?: () => { getState: () => Record<string, unknown> }
}

// ============================================================================
// Command Types
// ============================================================================

/**
 * Prompt 命令 - 注入 prompt 到模型
 *
 * 这种命令通过 getPromptForCommand() 返回 prompt 内容块，
 * 模型会将这些内容作为上下文处理。
 *
 * 用于:
 * - Skills (技能)
 * - 工作流
 * - 需要模型决策的命令
 */
export interface PromptCommand extends CommandBase {
  type: 'prompt'
  /** 进度消息，显示在工具执行中 */
  progressMessage: string
  /** 内容长度 (用于 token 估算) */
  contentLength: number
  /** 参数名列表 */
  argNames?: string[]
  /** 允许使用的工具 */
  allowedTools?: string[]
  /** 使用的模型 */
  model?: string
  /** 执行上下文: 'inline' 注入当前对话, 'fork' 运行子代理 */
  context?: 'inline' | 'fork'
  /** 子代理类型 */
  agent?: string
  /** 工作量估算 */
  effort?: 'minimal' | 'short' | 'medium' | 'long' | 'extended'

  /**
   * 获取命令的 prompt 内容
   * 返回的 ContentBlockParam 会被注入到模型的上下文中
   */
  getPromptForCommand(
    args: string,
    context: ToolUseContext,
  ): Promise<ContentBlockParam[]>
}

/**
 * Local 命令 - 直接执行的命令
 *
 * 这种命令直接在 CLI 中执行，不涉及模型。
 * 支持懒加载，load() 方法在首次调用时才加载命令模块。
 *
 * 用于:
 * - 系统命令 (status, cost, doctor)
 * - Git 命令 (git, diff, commit)
 * - 简单工具命令
 */
export interface LocalCommand extends CommandBase {
  type: 'local'
  /** 是否支持非交互模式 */
  supportsNonInteractive: boolean
  /** 懒加载命令模块 */
  load: () => Promise<LocalCommandModule>
}

/**
 * Local 命令模块
 */
export interface LocalCommandModule {
  /** 命令执行函数 */
  call: (args: string, context: ToolUseContext) => Promise<LocalCommandResult>
}

/**
 * Local 命令执行结果
 */
export type LocalCommandResult =
  | { type: 'text'; value: string }
  | { type: 'compact'; displayText?: string }
  | { type: 'skip' }

/**
 * Local JSX 命令 - 渲染 React 组件
 *
 * 这种命令返回一个 React 组件，用于复杂的 UI 交互。
 * 命令在执行时返回 ReactNode，由 TUI 渲染。
 *
 * 用于:
 * - Skills 菜单
 * - 复杂的选择器
 * - 实时更新的组件
 */
export interface LocalJSXCommand extends CommandBase {
  type: 'local-jsx'
  /** 懒加载命令模块 */
  load: () => Promise<LocalJSXCommandModule>
}

/**
 * Local JSX 命令模块
 */
export interface LocalJSXCommandModule {
  /** 命令执行函数 (返回 React 组件) */
  call: (
    onDone: LocalJSXCommandOnDone,
    context: ToolUseContext & LocalJSXCommandContext,
    args: string,
  ) => Promise<React.ReactNode>
}

/**
 * Local JSX 命令上下文
 */
export interface LocalJSXCommandContext {
  /** 是否可以使用特定工具 */
  canUseTool?: (toolName: string) => boolean
  /** 设置消息 (updater receives previous messages, returns new messages) */
  setMessages: (updater: (prev: unknown[]) => unknown[]) => void
  /** 额外选项 */
  options?: {
    dynamicMcpConfig?: Record<string, unknown>
    theme?: string
  }
  /** 变更 API 密钥回调 */
  onChangeAPIKey?: () => void
}

/**
 * Local JSX 命令完成回调
 */
export type LocalJSXCommandOnDone = (
  result?: string,
  options?: {
    display?: 'skip' | 'system' | 'user'
    shouldQuery?: boolean
    nextInput?: string
    submitNextInput?: boolean
  },
) => void

// ============================================================================
// Command Base (所有命令的共同属性)
// ============================================================================

/**
 * 命令可用性
 * 声明命令在哪些认证/提供商环境下可用
 */
export type CommandAvailability = 'claude-ai' | 'console'

/**
 * 命令基础属性
 * 所有命令类型都继承这些属性
 */
export interface CommandBase {
  /** 命令名称 */
  name: string
  /** 命令描述 */
  description: string
  /** 是否隐藏 (不在 help/autocomplete 中显示) */
  isHidden?: boolean
  /** 别名列表 */
  aliases?: string[]
  /** 参数提示 (灰色显示在命令后) */
  argumentHint?: string
  /** 使用场景描述 */
  whenToUse?: string
  /** 版本号 */
  version?: string
  /** 来源 */
  source?: 'builtin' | 'mcp' | 'plugin' | 'bundled' | 'skills'
  /** 可用性要求 */
  availability?: CommandAvailability[]
  /** 是否启用 (可被 feature flag 等控制) */
  isEnabled?: () => boolean
  /** 禁用模型调用 (不作为工具暴露给模型) */
  disableModelInvocation?: boolean
  /** 用户可调用 (输入 /name 可以触发) */
  userInvocable?: boolean
  /** 从哪里加载 */
  loadedFrom?: 'commands' | 'skills' | 'plugin' | 'bundled' | 'mcp'
  /** 工作流类型 (在 autocomplete 中显示 badge) */
  kind?: 'workflow'
  /** 立即执行 (不等待停止点) */
  immediate?: boolean
}

// ============================================================================
// Union Command Type
// ============================================================================

/**
 * 统一命令类型
 */
export type Command = CommandBase & (PromptCommand | LocalCommand | LocalJSXCommand)

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * 获取命令的用户可见名称
 */
export function getCommandName(cmd: CommandBase): string {
  return cmd.name
}

/**
 * 获取命令是否启用
 */
export function isCommandEnabled(cmd: CommandBase): boolean {
  return cmd.isEnabled?.() ?? true
}

/**
 * 检查命令是否满足可用性要求
 */
export function meetsAvailabilityRequirement(
  cmd: CommandBase,
  context: { isClaudeAISubscriber?: boolean; isConsoleUser?: boolean },
): boolean {
  if (!cmd.availability || cmd.availability.length === 0) {
    return true
  }

  for (const a of cmd.availability) {
    if (a === 'claude-ai' && context.isClaudeAISubscriber) {
      return true
    }
    if (a === 'console' && context.isConsoleUser) {
      return true
    }
  }

  return false
}

// ============================================================================
// Re-export from commands.ts for compatibility
// ============================================================================

export type {
  Command as LegacyCommand,
  CommandContext,
  CommandResult,
} from '../commands.js'