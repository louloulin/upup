/**
 * Skill Discovery Tools
 *
 * Provides skill discovery and search capabilities:
 * - List all available skills
 * - Search skills by keyword
 * - Get skill details
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { formatToolResult } from '../types.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

interface SkillInfo {
  name: string;
  path: string;
  description: string;
  user_invocable: boolean;
  model?: string;
  argument_hint?: string;
}

interface SkillMetadata {
  name?: string;
  description?: string;
  context?: string;
  'user-invocable'?: string;
  model?: string;
  'argument-hint'?: string;
}

/**
 * Parse SKILL.md frontmatter
 */
function parseFrontmatter(content: string): SkillMetadata {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: SkillMetadata = {};
  for (const line of match[1].split('\n')) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      const value = valueParts.join(':').trim();
      (result as Record<string, string>)[key.trim()] = value.replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

/**
 * Discover skills from skills directories
 */
export async function discoverSkills(
  skillsDirs: string[] = ['.claude/skills', '.upup/skills', 'src/skills']
): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];

  for (const dir of skillsDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skillPath = join(dir, entry.name, 'SKILL.md');
          try {
            const content = await readFile(skillPath, 'utf-8');
            const meta = parseFrontmatter(content);

            skills.push({
              name: meta.name || entry.name,
              path: skillPath,
              description: meta.description || 'No description',
              user_invocable: String(meta['user-invocable']) === 'true' || String(meta['user-invocable']) === '1',
              model: meta.model,
              argument_hint: meta['argument-hint'],
            });
          } catch {
            // SKILL.md not found, skip
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  return skills;
}

/**
 * Search skills by keyword
 */
export async function searchSkills(
  keyword: string,
  skillsDirs: string[] = ['.claude/skills', '.upup/skills', 'src/skills']
): Promise<SkillInfo[]> {
  const allSkills = await discoverSkills(skillsDirs);
  const lowerKeyword = keyword.toLowerCase();

  return allSkills.filter(skill =>
    (skill.name || '').toLowerCase().includes(lowerKeyword) ||
    (skill.description || '').toLowerCase().includes(lowerKeyword)
  );
}

// Tool schemas
const listSkillsSchema = z.object({
  format: z.enum(['simple', 'detailed']).optional().default('simple').describe('Output format'),
});

const searchSkillsSchema = z.object({
  keyword: z.string().describe('Keyword to search for in skills'),
});

const getSkillSchema = z.object({
  name: z.string().describe('Name of the skill to get details for'),
});

/**
 * Create list skills tool
 */
export function createListSkillsTool() {
  return new DynamicStructuredTool({
    name: 'list_skills',
    description: 'List all available skills in the system',
    schema: listSkillsSchema,
    func: async ({ format }) => {
      const skillsDirs = [
        '.claude/skills',
        '.upup/skills',
        'src/skills',
      ];

      const skills = await discoverSkills(skillsDirs);

      if (format === 'simple') {
        const skillList = skills
          .map(s => `  • ${s.name}${s.user_invocable ? ' (invocable)' : ''}`)
          .join('\n');

        return formatToolResult({
          type: 'Skills List',
          count: skills.length,
          skills: skills.map(s => ({
            name: s.name,
            invocable: s.user_invocable,
          })),
          message: `Available Skills (${skills.length}):\n${skillList}`,
        });
      } else {
        return formatToolResult({
          type: 'Skills List (Detailed)',
          count: skills.length,
          skills: skills.map(s => ({
            name: s.name,
            description: s.description.substring(0, 100) + (s.description.length > 100 ? '...' : ''),
            invocable: s.user_invocable,
            model: s.model,
            argument_hint: s.argument_hint,
          })),
          message: `Found ${skills.length} skills`,
        });
      }
    },
  });
}

/**
 * Create search skills tool
 */
export function createSearchSkillsTool() {
  return new DynamicStructuredTool({
    name: 'search_skills',
    description: 'Search for skills by keyword',
    schema: searchSkillsSchema,
    func: async ({ keyword }) => {
      const skillsDirs = [
        '.claude/skills',
        '.upup/skills',
        'src/skills',
      ];

      const results = await searchSkills(keyword, skillsDirs);

      if (results.length === 0) {
        return formatToolResult({
          type: 'Skill Search',
          keyword,
          count: 0,
          message: `No skills found matching "${keyword}"`,
        });
      }

      const skillList = results
        .map(s => `  • ${s.name}: ${s.description.substring(0, 60)}...`)
        .join('\n');

      return formatToolResult({
        type: 'Skill Search',
        keyword,
        count: results.length,
        results: results.map(s => ({
          name: s.name,
          description: s.description,
          invocable: s.user_invocable,
        })),
        message: `Found ${results.length} skill(s) matching "${keyword}":\n${skillList}`,
      });
    },
  });
}

/**
 * Create get skill tool
 */
export function createGetSkillTool() {
  return new DynamicStructuredTool({
    name: 'get_skill',
    description: 'Get detailed information about a specific skill',
    schema: getSkillSchema,
    func: async ({ name }) => {
      const skillsDirs = [
        '.claude/skills',
        '.upup/skills',
        'src/skills',
      ];

      const allSkills = await discoverSkills(skillsDirs);
      const skill = allSkills.find(s => s.name.toLowerCase() === name.toLowerCase());

      if (!skill) {
        const suggestions = allSkills
          .filter(s => s.name.toLowerCase().includes(name.toLowerCase().substring(0, 3)))
          .slice(0, 3)
          .map(s => s.name);

        return formatToolResult({
          type: 'Skill Not Found',
          name,
          message: `Skill "${name}" not found.${suggestions.length > 0 ? ` Did you mean: ${suggestions.join(', ')}?` : ''}`,
        });
      }

      return formatToolResult({
        type: 'Skill Details',
        name: skill.name,
        path: skill.path,
        description: skill.description,
        user_invocable: skill.user_invocable,
        model: skill.model,
        argument_hint: skill.argument_hint,
        message: `Skill: ${skill.name}\n\nDescription: ${skill.description}\n\nInvocable: ${skill.user_invocable ? 'Yes (use /' + skill.name + ')' : 'No'}\n\n${skill.argument_hint ? `Usage: /${skill.name} ${skill.argument_hint}` : ''}`,
      });
    },
  });
}

export const discoveryTools = [
  createListSkillsTool(),
  createSearchSkillsTool(),
  createGetSkillTool(),
];
