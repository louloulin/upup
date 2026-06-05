/**
 * Specialized Skills Tools
 * 
 * 为LLM提供专业Skills工具:
 * - dream: 自主探索模式
 * - verify: 验证结果
 * - hunter: 发现追踪问题
 * - batch: 批量任务执行
 * 
 * Phase 3: 集成EnhancedSkillDefinition
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getAllSpecializedSkills, getSkillByName } from '@upup/tools-registry/skills/bundled/index';

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
      const skill = getSkillByName(skill_name);
      
      if (!skill) {
        const allSkills = getAllSpecializedSkills();
        return JSON.stringify({ 
          error: `Skill not found: ${skill_name}`,
          available: allSkills.map(s => s.name),
        });
      }
      
      // Execute skill using getPromptForCommand
      const content = await skill.getPromptForCommand(args ?? '', {});
      
      return JSON.stringify({
        success: true,
        skill: skill.name,
        output: content,
        context: skill.context,
        agent: skill.agent,
      });
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
          aliases: s.aliases || [],
          context: s.context,
          agent: s.agent,
          whenToUse: s.whenToUse,
        })),
      });
    } catch (error) {
      return JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  },
});

/**
 * Get skill details
 */
export const skillInfoTool = new DynamicStructuredTool({
  name: 'skill_info',
  description: 'Get detailed information about a specific skill including its usage instructions.',
  
  schema: z.object({
    skill_name: z.string().describe('Name of the skill to get info about'),
  }),

  func: async ({ skill_name }): Promise<string> => {
    try {
      const skill = getSkillByName(skill_name);
      
      if (!skill) {
        return JSON.stringify({ 
          error: `Skill not found: ${skill_name}`,
        });
      }
      
      // Get the full prompt
      const prompt = await skill.getPromptForCommand('', {});
      
      return JSON.stringify({
        name: skill.name,
        description: skill.description,
        aliases: skill.aliases || [],
        context: skill.context,
        agent: skill.agent,
        allowedTools: skill.allowedTools || [],
        whenToUse: skill.whenToUse,
        argumentHint: skill.argumentHint,
        prompt: prompt,
      });
    } catch (error) {
      return JSON.stringify({ 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  },
});

export const specializedTools = [executeSkillTool, listSkillsTool, skillInfoTool];
