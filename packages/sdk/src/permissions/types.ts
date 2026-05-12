/**
 * @upup/sdk - 权限类型定义
 */

// ============ 权限模式 ============

/**
 * 权限模式 - 控制工具使用策略
 */
export type PermissionMode =
  | 'default'   // 默认权限检查
  | 'acceptEdits'  // 自动接受编辑操作
  | 'bypassPermissions'  // 绕过所有权限检查
  | 'plan'  // 计划模式，只读

// ============ 权限结果 ============

/**
 * 权限检查结果
 */
export type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message?: string }
  | { behavior: 'ask'; message?: string }

// ============ 权限检查器 ============

/**
 * 工具使用权限检查器
 */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: { signal: AbortSignal }
) => Promise<PermissionResult>

/**
 * 权限检查上下文
 */
export interface PermissionContext {
  toolName: string
  input: Record<string, unknown>
  sessionId?: string
  cwd?: string
}

// ============ 权限事件 ============

/**
 * 权限相关事件类型
 */
export type PermissionEvent =
  | 'permission_request'
  | 'permission_denied'
  | 'permission_granted'

/**
 * 权限请求事件
 */
export interface PermissionRequestEvent {
  type: 'permission_request'
  toolName: string
  input: Record<string, unknown>
  reason?: string
}

/**
 * 权限拒绝事件
 */
export interface PermissionDeniedEvent {
  type: 'permission_denied'
  toolName: string
  reason: string
}
