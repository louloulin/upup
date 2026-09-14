// @ts-nocheck
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
 * 命令来源 (扩展)
 * 与 loucode 对齐
 */
export type CommandSource =
  | 'builtin'    // 内置命令
  | 'mcp'        // MCP 提供的命令
  | 'plugin'     // 插件提供的命令
  | 'bundled'    // 捆绑的技能
  | 'skills'     // 用户定义的技能
  | 'workflow'   // 工作流

/**
 * Feature Gate 定义
 * 用于根据环境变量或配置控制命令的可用性
 */
export interface FeatureGate {
  /** 环境变量名 */
  envVar?: string
  /** 值为 true 时启用 */
  envValue?: string
  /** 检查函数 */
  check?: () => boolean
}

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
  source?: CommandSource
  /** 可用性要求 */
  availability?: CommandAvailability[]
  /** 是否启用 (可被 feature flag 等控制) */
  isEnabled?: () => boolean
  /** Feature gate - 基于环境变量或配置启用/禁用命令 */
  featureGate?: FeatureGate
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
  /** 是否为敏感命令 (参数会被脱敏) */
  isSensitive?: boolean
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
 * 支持 isEnabled 回调和 featureGate 两种方式
 */
export function isCommandEnabled(cmd: CommandBase): boolean {
  // 1. 先检查 isEnabled 回调
  if (cmd.isEnabled && !cmd.isEnabled()) {
    return false
  }

  // 2. 检查 featureGate
  if (cmd.featureGate) {
    const { envVar, envValue, check } = cmd.featureGate

    // 环境变量检查
    if (envVar) {
      const envVal = process.env[envVar]
      if (envValue) {
        // 需要特定值才启用
        return envVal === envValue
      }
      // 任何真值都启用
      return envVal === 'true' || envVal === '1'
    }

    // 检查函数
    if (check && !check()) {
      return false
    }
  }

  return true
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

/**
 * 检查命令是否可用于远程模式
 * 远程模式下只允许不影响本地文件系统的命令
 */
export function isRemoteSafeCommand(cmd: Command): boolean {
  const REMOTE_SAFE = new Set([
    'session', 'exit', 'clear', 'help', 'theme', 'color',
    'cost', 'usage', 'copy', 'btw', 'feedback', 'plan',
    'keybindings', 'stickers', 'mobile',
  ])
  return REMOTE_SAFE.has(cmd.name)
}

/**
 * 检查命令是否可用于 Bridge (移动端/Web 端)
 * Bridge 模式下只允许不渲染本地 UI 的命令
 */
export function isBridgeSafeCommand(cmd: Command): boolean {
  // local-jsx 类型命令在 Bridge 中不可用
  if (cmd.type === 'local-jsx') {
    return false
  }

  const BRIDGE_SAFE = new Set([
    'compact', 'clear', 'cost', 'recap', 'summary', 'releaseNotes', 'files',
  ])
  return cmd.type === 'prompt' || BRIDGE_SAFE.has(cmd.name)
}

// ============================================================================
// Re-export from commands.ts for compatibility
// ============================================================================

export type {
  Command as LegacyCommand,
  CommandContext,
  CommandResult,
} from '../commands.js'