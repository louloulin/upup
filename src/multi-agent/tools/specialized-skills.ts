/**
 * Specialized Skills Tools
 * 
 * 为LLM提供专业Skills工具:
 * - dream: 自主探索模式
 * - verify: 验证结果
 * - hunter: 发现追踪问题
 * - batch: 批量任务执行
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getAllSpecializedSkills } from '../../skills/bundled/index.js';

/**
 * Execute specialized skill
 */
export const executeSkillTool = new DynamicStructuredTool({
  name: 'execute_skill',
  description: 'Execute a specialized skill for specific tasks. Skills like /dream (autonomous exploration), /verify (validation), /hunter (bug finding), /batch (bulk execution) provide focused capabilities.',
  
  schema: z.object({
    skill_name: z.string().describe('Name of the skill to execute (dream, verify, hunter, batch)'),
    args: z.string().optional().describe('Arguments for the skill'),
  }),

  func: async ({ skill_name, args }): Promise<string> => {
    try {
      const skills = getAllSpecializedSkills();
      const skill = skills.find(s => 
        s.name === skill_name || s.aliases.includes(skill_name)
      );
      
      if (!skill) {
        return JSON.stringify({ 
          error: `Skill not found: ${skill_name}`,
          available: skills.map(s => s.name),
        });
      }
      
      const result = await skill.execute(args ?? '', {});
      return JSON.stringify(result);
    } catch (error) {
      return JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  },
});

/**
 * List available specialized skills
 */
export const listSkillsTool = new DynamicStructuredTool({
  name: 'list_skills',
  description: 'List all available specialized skills with their descriptions and aliases.',
  
  schema: z.object({}),

  func: async (): Promise<string> => {
    try {
      const skills = getAllSpecializedSkills();
      
      return JSON.stringify({
        skills: skills.map(s => ({
          name: s.name,
          description: s.description,
          aliases: s.aliases,
          context: s.context,
          agent: s.agent,
        })),
      });
    } catch (error) {
      return JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  },
});

export const specializedTools = [executeSkillTool, listSkillsTool];
