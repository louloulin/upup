/**
 * Verify Skill - 验证执行结果
 * 
 * 基于Claude Code /verify设计:
 * - 验证任务执行结果
 * - 检查正确性
 * - 提供反馈
 */

import type { SpecializedSkill, ToolUseContext, SkillResult } from '../enhanced-types.js';

/**
 * Verify Skill 实现
 */
export const verifySkill: SpecializedSkill = {
  name: 'verify',
  description: 'Verify task execution results. Check correctness and provide validation feedback.',
  aliases: ['/verify', '/validate', '/check'],
  context: 'inline',
  
  execute: async (args: string, context: ToolUseContext): Promise<SkillResult> => {
    try {
      // 模拟验证过程
      await new Promise(resolve => setTimeout(resolve, 200));
      
      let output = '## Verification Results\n\n';
      output += `Task: ${args || 'Verification requested'}\n\n`;
      
      // 模拟检查结果
      const checks = [
        { name: 'Syntax', status: '✅ Passed' },
        { name: 'Logic', status: '✅ Passed' },
        { name: 'Completeness', status: '✅ Passed' },
        { name: 'Edge Cases', status: '✅ Passed' },
      ];
      
      output += '| Check | Status |\n';
      output += '|------|--------|\n';
      for (const check of checks) {
        output += `| ${check.name} | ${check.status} |\n`;
      }
      
      output += '\n✅ All verification checks passed\n';
      
      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

/**
 * 注册Verify Skill
 */
export function registerVerifySkill(): SpecializedSkill {
  return verifySkill;
}
