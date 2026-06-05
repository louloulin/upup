/**
 * Dream Skill - 自主探索模式
 * 
 * 基于Claude Code /dream设计:
 * - 自主思考和探索
 * - 不需要用户干预
 * - 持续执行直到完成
 * 
 * Phase 3 实现: EnhancedSkillDefinition
 * - agent: 指定运行的Agent类型 (researcher)
 * - context: fork模式 (子进程执行)
 * - aliases: 命令别名
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';
import { registerBundledSkill } from '../registry.js';

/**
 * Dream Skill 实现
 */
export function createDreamSkill(): EnhancedSkillDefinition {
  return {
    name: 'dream',
    description: 'Enter autonomous exploration mode. The agent will think deeply and explore various approaches without user intervention until completion or timeout.',
    aliases: ['/dream', '/explore', '/autonomous'],
    whenToUse: 'When you need deep analysis or exploration of a problem space without requiring user input.',
    argumentHint: '<task>',
    allowedTools: ['web_search', 'browser', 'file_read', 'file_write', 'bash'],
    
    // Agent配置
    agent: 'researcher',
    context: 'fork',
    
    // 进度消息
    progressMessage: '🔮 Starting autonomous exploration...',
    
    // 工具模式
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const task = args.trim() || 'Perform deep analysis';
      
      return [{
        type: 'text',
        text: `## 🔮 Autonomous Exploration Mode

You are in **autonomous exploration mode**. You will deeply analyze the following task without requiring user input.

### Task
${task}

### Your Approach
1. **Analyze**: Break down the problem into components
2. **Explore**: Consider multiple approaches and perspectives
3. **Research**: Gather relevant information using available tools
4. **Evaluate**: Assess the pros and cons of different solutions
5. **Synthesize**: Create a comprehensive solution or analysis

### Guidelines
- Think step-by-step and be thorough
- Use available tools to gather information
- Document your reasoning process
- Don't ask for confirmation - proceed autonomously
- Report progress as you go

### Execution
Begin your autonomous exploration now. Continue until completion or timeout.`
      }];
    }
  };
}

export const dreamSkill = createDreamSkill();

/**
 * 注册Dream Skill
 */
export function registerDreamSkill(): EnhancedSkillDefinition {
  const skill = createDreamSkill();
  registerBundledSkill(skill as any);
  return skill;
}
