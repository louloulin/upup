/**
 * Enhanced Skill Types - 基于Claude Code BundledSkillDefinition
 * 
 * 扩展现有Skill系统，支持:
 * - agent: 指定运行的Agent类型
 * - files: 引用文件 (自动提取到磁盘)
 * - aliases: 命令别名
 * - model: 模型覆盖
 * - allowedTools: 允许的工具列表
 * - context: 执行模式 (inline/fork/background/swarm)
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';

// ============================================================================
// Enhanced Skill Definition
// ============================================================================

export interface EnhancedSkillDefinition {
  /** Skill名称 */
  name: string;
  
  /** 描述 */
  description: string;
  
  /** 命令别名 */
  aliases?: string[];
  
  /** 使用场景提示 */
  whenToUse?: string;
  
  /** 参数提示 */
  argumentHint?: string;
  
  /** 允许的工具列表 */
  allowedTools?: string[];
  
  /** 模型覆盖 */
  model?: string;
  
  /** 禁用模型调用 (纯工具skill) */
  disableModelInvocation?: boolean;
  
  /** 用户可调用 */
  userInvocable?: boolean;
  
  /** 进度消息 */
  progressMessage?: string;
  
  /** 启用检查函数 */
  isEnabled?: () => boolean;
  
  /** 执行上下文模式 */
  context?: 'inline' | 'fork' | 'background' | 'swarm';
  
  /** 指定Agent类型 */
  agent?: string;
  
  /** 引用文件 (key: 相对路径, value: 内容) */
  files?: Record<string, string>;
  
  /** 获取Skill提示内容 */
  getPromptForCommand: (
    args: string,
    context: ToolUseContext,
  ) => Promise<ContentBlockParam[]>;
}

export interface ToolUseContext {
  getAppState?: () => AppState;
  toolPermissionContext?: unknown;
  getTools?: () => unknown[];
}

export interface AppState {
  toolPermissionContext?: unknown;
  [key: string]: unknown;
}

// ============================================================================
// Specialized Skills (类似Claude Code /dream, /verify, /hunter)
// ============================================================================

export interface SpecializedSkill {
  name: string;
  description: string;
  aliases: string[];
  agent?: string;
  context: 'inline' | 'fork' | 'swarm';
  execute: (args: string, context: ToolUseContext) => Promise<SkillResult>;
}

export interface SkillResult {
  success: boolean;
  output: string;
  error?: string;
}

// ============================================================================
// Skill Execution Modes
// ============================================================================

export type SkillExecutionMode = 'inline' | 'fork' | 'background' | 'swarm';

/**
 * Skill执行配置
 */
export interface SkillExecutionConfig {
  mode: SkillExecutionMode;
  agent?: string;
  teamId?: string;
  maxTurns?: number;
  timeoutMs?: number;
}
