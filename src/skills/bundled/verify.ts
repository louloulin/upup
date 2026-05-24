/**
 * Verify Skill - 验证执行
 * 
 * 基于Claude Code /verify设计:
 * - 验证实现结果
 * - 运行测试
 * - 检查代码质量
 * 
 * Phase 3: EnhancedSkillDefinition
 * - agent: 指定为 reviewer
 * - context: fork模式
 * - aliases: 命令别名
 */

import type { EnhancedSkillDefinition, ToolUseContext } from '../enhanced-types.js';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs';

export function createVerifySkill(): EnhancedSkillDefinition {
  return {
    name: 'verify',
    description: 'Verify implementation results. Run tests, check code quality, and validate that changes meet requirements.',
    aliases: ['/verify', '/test', '/check', '/validate'],
    whenToUse: 'After implementing changes to verify correctness, run tests, or validate code quality.',
    argumentHint: '<implementation or changes to verify>',
    allowedTools: ['bash', 'file_read', 'file_write', 'web_search', 'browser'],
    
    // Agent配置
    agent: 'reviewer',
    context: 'fork',
    
    // 进度消息
    progressMessage: '🔍 Starting verification...',
    
    // 工具模式
    disableModelInvocation: false,
    userInvocable: true,
    
    async getPromptForCommand(
      args: string,
      context: ToolUseContext
    ): Promise<ContentBlockParam[]> {
      const target = args.trim() || 'the current implementation';
      
      return [{
        type: 'text',
        text: `## 🔍 Verification Mode

You are in **verification mode**. You will verify the following implementation or changes.

### Target
${target}

### Verification Steps

1. **Read and understand** the implementation
2. **Run tests** (if available):
   \`\`\`bash
   bun test
   # or
   npm test
   # or
   yarn test
   \`\`\`
3. **Check code quality**:
   - Type correctness
   - Error handling
   - Edge cases
   - Documentation
4. **Validate**:
   - Does it meet requirements?
   - Are there any regressions?
   - Is the code maintainable?

### Output Format
Provide a structured report:
- ✅ **Pass**: What works correctly
- ⚠️ **Warning**: Areas needing attention
- ❌ **Fail**: Issues that must be fixed
- 📝 **Suggestions**: Improvement recommendations

### Guidelines
- Be thorough but pragmatic
- Focus on critical issues first
- Provide actionable feedback
- Don't modify the code unless explicitly asked`
      }];
    }
  };
}

export const verifySkill = createVerifySkill();

export function registerVerifySkill(): EnhancedSkillDefinition {
  return createVerifySkill();
}
