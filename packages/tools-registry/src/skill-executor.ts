/**
 * Skill Executor - 统一 Skill 执行入口
 *
 * 修复问题：
 * 1. Skill 执行后上下文丢失
 * 2. /skill-creator 等 agent skills 无法执行
 * 3. 上下文传递不正确
 */

import { parseSlashCommand, getSkillCommandRegistry } from '@upup/skills/slash-command';
import { getSkillCommand, initializeSkills } from '@upup/skills/commands';
import { recordUsage } from '@upup/skills/recent-usage';
import type { SkillCommand } from '@upup/skills/types';
import { getSessionId } from '@upup/skills/executor';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionContext {
  cwd: string;
  getAppState?: () => {
    toolPermissionContext?: {
      alwaysAllowRules?: {
        command?: string[];
      };
    };
  };
}

export interface ExecutionResult {
  /** 是否处理了输入 */
  handled: boolean;
  /** 生成的 prompt */
  prompt?: string;
  /** 用于 inline 模式的新 messages */
  newMessages?: Array<{ role: string; content: string }>;
  /** 上下文修改器 */
  contextModifier?: ContextModifier;
  /** 错误信息 */
  error?: string;
}

export interface ContextModifier {
  /** 修改后的 system prompt */
  systemPrompt?: string;
  /** 允许的工具列表 */
  allowedTools?: string[];
  /** 模型偏好 */
  model?: string;
  /** 努力程度估算 */
  effort?: string | number;
  /** 执行模式 */
  mode?: 'inline' | 'fork' | 'swarm';
  /** 进度消息 */
  progressMessage?: string;
}

// ============================================================================
// Skill Executor
// ============================================================================

export class SkillExecutor {
  private initialized = false;

  /**
   * 执行 slash skill 命令
   */
  async execute(input: string, context: ExecutionContext): Promise<ExecutionResult> {
    // 确保已初始化
    if (!this.initialized) {
      await initializeSkills();
      this.initialized = true;
    }

    // 1. 解析 slash command
    const parsed = parseSlashCommand(input);
    if (!parsed) {
      return { handled: false };
    }

    // 2. 获取 skill command
    const command = getSkillCommand(parsed.name);
    if (!command) {
      // 尝试模糊匹配
      const fuzzyMatch = this.fuzzyMatch(parsed.name);
      if (fuzzyMatch) {
        return this.execute(fuzzyMatch, context);
      }
      return { handled: false, error: `Unknown skill: ${parsed.name}` };
    }

    // 3. 记录使用
    try {
      await recordUsage(command.name);
    } catch {
      // 忽略记录失败
    }

    // 4. 获取 prompt
    const promptResult = await command.getPromptForCommand(parsed.args || '', {
      cwd: context.cwd,
      getAppState: context.getAppState,
    });

    if (!promptResult || promptResult.length === 0) {
      return { handled: true, error: 'Empty prompt from skill' };
    }

    const skillPrompt = promptResult[0].text;

    // 5. 构建增强的 prompt (包含 skill 元信息)
    const enhancedPrompt = this.buildEnhancedPrompt(command, parsed.args || '', skillPrompt);

    // 6. 确定执行模式
    const mode = command.context || 'inline';

    // 7. 根据模式返回结果
    if (mode === 'fork') {
      // Fork 模式: 返回完整上下文和配置
      return {
        handled: true,
        prompt: enhancedPrompt,
        contextModifier: {
          mode: 'fork',
          allowedTools: command.allowedTools,
          model: command.model,
          effort: command.effort,
          progressMessage: command.progressMessage,
        },
      };
    }

    // Inline 模式: 返回 prompt 和 system fragment
    return {
      handled: true,
      prompt: enhancedPrompt,
      newMessages: [
        { role: 'system', content: this.buildSystemFragment(command) },
        { role: 'user', content: enhancedPrompt },
      ],
      contextModifier: {
        mode: 'inline',
        allowedTools: command.allowedTools,
        model: command.model,
        effort: command.effort,
        progressMessage: command.progressMessage,
      },
    };
  }

  /**
   * 检查输入是否包含 slash command
   */
  isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  /**
   * 获取所有可用技能
   */
  async getAvailableSkills(): Promise<string[]> {
    if (!this.initialized) {
      await initializeSkills();
      this.initialized = true;
    }

    const registry = getSkillCommandRegistry();
    return registry.getAllSkillCommands().map((cmd: SkillCommand) => cmd.name);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private buildEnhancedPrompt(
    command: SkillCommand,
    args: string,
    skillPrompt: string
  ): string {
    const lines: string[] = [];

    // Skill header
    lines.push('═'.repeat(60));
    lines.push(`Skill: ${command.name}`);
    if (command.description) {
      lines.push(`Description: ${command.description}`);
    }
    if (args) {
      lines.push(`Arguments: ${args}`);
    }
    lines.push('═'.repeat(60));
    lines.push('');

    // Skill instructions
    lines.push(skillPrompt);
    lines.push('');
    lines.push('═'.repeat(60));

    return lines.join('\n');
  }

  private buildSystemFragment(command: SkillCommand): string {
    const lines: string[] = [
      `You are executing the **${command.name}** skill.`,
      '',
    ];

    if (command.description) {
      lines.push(`Purpose: ${command.description}`);
      lines.push('');
    }

    if (command.whenToUse) {
      lines.push(`When to use: ${command.whenToUse}`);
      lines.push('');
    }

    if (command.argumentHint) {
      lines.push(`Usage: /${command.name} ${command.argumentHint}`);
      lines.push('');
    }

    if (command.allowedTools && command.allowedTools.length > 0) {
      lines.push(`Allowed tools: ${command.allowedTools.join(', ')}`);
      lines.push('');
    }

    lines.push('Follow the skill instructions above to complete the task.');

    return lines.join('\n');
  }

  private fuzzyMatch(input: string): string | null {
    const registry = getSkillCommandRegistry();
    const allCommands = registry.getAllSkillCommands();

    const lowerInput = input.toLowerCase();

    // 1. 前缀匹配
    for (const cmd of allCommands) {
      if (cmd.name.toLowerCase().startsWith(lowerInput)) {
        return `/${cmd.name}`;
      }
    }

    // 2. 包含匹配
    for (const cmd of allCommands) {
      if (cmd.name.toLowerCase().includes(lowerInput)) {
        return `/${cmd.name}`;
      }
    }

    // 3. 别名匹配
    for (const cmd of allCommands) {
      const aliases = (cmd as any).aliases || [];
      for (const alias of aliases) {
        if (alias.toLowerCase().startsWith(lowerInput) ||
            alias.toLowerCase().includes(lowerInput)) {
          return `/${cmd.name}`;
        }
      }
    }

    return null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalExecutor: SkillExecutor | null = null;

export function getSkillExecutor(): SkillExecutor {
  if (!globalExecutor) {
    globalExecutor = new SkillExecutor();
  }
  return globalExecutor;
}

// ============================================================================
// CLI Helper
// ============================================================================

export async function executeSkillFromCLI(args: string[]): Promise<void> {
  if (args.length === 0) {
    console.log('Usage: skill-executor <command> [args...]');
    console.log('');
    console.log('Available commands:');
    const skills = await getSkillExecutor().getAvailableSkills();
    for (const skill of skills) {
      console.log(`  /${skill}`);
    }
    return;
  }

  const input = args.join(' ');
  const executor = getSkillExecutor();

  if (!executor.isSlashCommand(input)) {
    console.error('Error: Input must start with /');
    return;
  }

  const result = await executor.execute(input, { cwd: process.cwd() });

  if (!result.handled) {
    console.error(`Error: ${result.error || 'Skill not found'}`);
    process.exit(1);
  }

  console.log(result.prompt);
}
