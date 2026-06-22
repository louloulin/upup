/**
 * @upup/sdk - Hook 类型定义
 */

// ============ Hook 事件类型 ============

/**
 * Hook 事件类型
 */
export type HookEvent =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'PostToolBatch'
  | 'Notification'
  | 'UserPromptSubmit'
  | 'UserPromptExpansion'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Stop'
  | 'StopFailure'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'PostCompact'
  | 'PermissionRequest'
  | 'PermissionDenied'
  // Stream + Session 一体架构新增事件
  | 'StreamStart'
  | 'StreamMessage'
  | 'StreamEnd'

/**
 * 所有 Hook 事件列表
 */
export const HOOK_EVENTS: readonly HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Notification',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  // Stream + Session 一体架构新增事件
  'StreamStart',
  'StreamMessage',
  'StreamEnd',
] as const

// ============ Hook 输入/输出 ============

/**
 * Hook 输入上下文
 */
export interface HookInput {
  /** 会话 ID */
  session_id?: string
  /** 当前工作目录 */
  cwd?: string
  /** Hook 事件名称 */
  hook_event_name: HookEvent
  /** 工具名称 (PreToolUse/PostToolUse) */
  tool_name?: string
  /** 工具输入 (PreToolUse) */
  tool_input?: Record<string, unknown>
  /** 工具结果 (PostToolUse) */
  tool_result?: unknown
  /** 工具使用 ID */
  tool_use_id?: string
  /** 用户输入的消息 (UserPromptSubmit) */
  message?: string | Record<string, unknown>
  /** 扩展后的消息 (UserPromptExpansion) */
  expanded_message?: string
  /** 通知内容 (Notification) */
  notification?: string
  /** 停止原因 (Stop) */
  stop_reason?: string
  /** 子代理配置 (SubagentStart) */
  subagent_config?: Record<string, unknown>
  /** 权限请求 (PermissionRequest) */
  permission_request?: {
    tool: string
    reason: string
  }
  /** 拒绝原因 (PermissionDenied) */
  denied_reason?: string
  // ============ Stream + Session 一体架构新增字段 ============
  /** Stream 消息内容 (StreamMessage) */
  stream_message?: SDKMessage
  /** 消息类型 (StreamMessage) */
  message_type?: 'stream_progress' | 'tool_use' | 'tool_result' | 'done'
  /** 消息文本内容 (StreamMessage) */
  message_content?: string
  /** Token 使用量 (StreamEnd) */
  token_usage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  /** 其他上下文数据 */
  [key: string]: unknown
}

/**
 * SDK 消息类型 (用于 StreamMessage Hook)
 */
export interface SDKMessage {
  type: string
  [key: string]: unknown
}

/**
 * Hook 输出结果
 */
export interface HookOutput {
  /** 是否继续执行 */
  continue?: boolean
  /** 是否抑制输出 */
  suppressOutput?: boolean
  /** 停止原因 */
  stopReason?: string
  /** 决策结果 */
  decision?: 'approve' | 'block' | 'ask'
  /** 系统消息 */
  systemMessage?: string
  /** 权限决策 */
  permissionDecision?: 'allow' | 'deny' | 'ask'
  /** 更新后的输入 */
  updatedInput?: Record<string, unknown>
  /** 扩展后的消息 */
  expandedMessage?: string
  /** Hook 特定输出 */
  hookSpecificOutput?: Record<string, unknown>
}

/**
 * Hook 回调函数
 */
export type HookCallback = (
  input: HookInput,
  options?: { signal?: AbortSignal }
) => Promise<HookOutput | void>

/**
 * Hook 匹配器
 */
export interface HookMatcher {
  /** 工具名称匹配模式 (glob 风格) */
  matcher?: string
  /** Hook 回调函数列表 */
  hooks: HookCallback[]
}

/**
 * Hook 映射表
 */
export type HookMap = Partial<Record<HookEvent, HookMatcher[]>>

// ============ Hook 注册表 ============

/**
 * Hook 注册表
 */
export class HookRegistry {
  private hooks: Map<HookEvent, HookMatcher[]> = new Map()

  /**
   * 注册 Hook
   */
  register(event: HookEvent, matcher: HookMatcher): void {
    const existing = this.hooks.get(event) || []
    existing.push(matcher)
    this.hooks.set(event, existing)
  }

  /**
   * 批量注册 Hooks
   */
  registerAll(hooks: HookMap): void {
    for (const [event, matchers] of Object.entries(hooks)) {
      if (matchers) {
        for (const matcher of matchers) {
          this.register(event as HookEvent, matcher)
        }
      }
    }
  }

  /**
   * 获取某个事件的 Hook
   */
  get(event: HookEvent): HookMatcher[] {
    return this.hooks.get(event) || []
  }

  /**
   * 获取所有 Hook
   */
  getAll(): Map<HookEvent, HookMatcher[]> {
    return new Map(this.hooks)
  }

  /**
   * 移除某个事件的 Hooks
   */
  remove(event: HookEvent): void {
    this.hooks.delete(event)
  }

  /**
   * 清空所有 Hooks
   */
  clear(): void {
    this.hooks.clear()
  }

  /**
   * 检查是否有 Hook
   */
  has(event: HookEvent): boolean {
    return this.hooks.has(event) && this.hooks.get(event)!.length > 0
  }
}
