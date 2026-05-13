/**
 * SkillTool - Skill Discovery and Execution
 *
 * Exposes UpUp's skill system as tools for:
 * - Listing available skills with metadata (including context/agent info)
 * - Loading a skill's full instructions
 * - Getting detailed info about a specific skill
 * - Searching skills by name/description
 * - Executing skills (inline/fork dual mode)
 *
 * Skills are discovered from builtin, user, and project directories.
 * See src/skills/ for the underlying skill system.
 */

import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { discoverSkills, getSkill } from '../skills/registry.js';
import type { SkillMetadata, Skill, SkillContext } from '../skills/types.js';
import type { SubagentRunner } from '../agent/subagent.js';
import { executeSkill, getExecutionMode, shouldUseForkMode } from '../skills/executor.js';

// ============================================================================
// Schemas
// ============================================================================

export const SkillListSchema = z.object({
  /** Optional category/source filter (e.g., "builtin", "user", "project") */
  category: z.string().optional().describe(
    'Filter skills by source category: "builtin", "user", or "project"'
  ),
});

export const SkillExecuteSchema = z.object({
  /** Skill name to execute */
  name: z.string().describe('Name of the skill to load'),
  /** Optional arguments to pass to the skill */
  args: z.string().optional().describe('Arguments to pass to the skill'),
  /** Execution mode override (inline or fork) */
  mode: z.enum(['inline', 'fork']).optional().describe('Execution mode: inline (default) or fork (subagent)'),
});

export const SkillInfoSchema = z.object({
  /** Skill name to inspect */
  name: z.string().describe('Name of the skill to get info about'),
});

export const SkillSearchSchema = z.object({
  /** Search query */
  query: z.string().describe('Search query for skill name or description'),
  /** Maximum number of results */
  limit: z.number().optional().default(5).describe('Maximum number of results'),
});

export type SkillListInput = z.infer<typeof SkillListSchema>;
export type SkillExecuteInput = z.infer<typeof SkillExecuteSchema>;
export type SkillInfoInput = z.infer<typeof SkillInfoSchema>;
export type SkillSearchInput = z.infer<typeof SkillSearchSchema>;

// ============================================================================
// Descriptions
// ============================================================================

export const SKILL_LIST_DESCRIPTION = `
List all available skills with metadata.

Use this when:
- Discovering what skills are available
- Finding a skill by name or category
- Showing the user what skills UpUp can use

Returns a formatted list of skills with name, description, source, model, and execution mode.
Optionally filter by source category: "builtin", "user", or "project".

Examples:
- List all available skills
- List only builtin skills
- List user-defined skills`;

export const SKILL_EXECUTE_DESCRIPTION = `
Load a skill and return its full instructions.

Use this when:
- The user invokes a skill by name
- You need to inject skill instructions into context
- Preparing to execute a skill's workflow

Returns the skill's complete instruction text, ready for injection into context.
If the skill is not found, returns an error message.

Optional mode parameter:
- inline (default): Execute in current agent context
- fork: Execute in isolated subagent context

Examples:
- Load the "dcf" skill instructions
- Load the "technical-analysis" skill with arguments`;

export const SKILL_INFO_DESCRIPTION = `
Get detailed metadata about a specific skill.

Use this when:
- Inspecting a skill before executing it
- Checking if a skill is user-invocable
- Viewing a skill's argument hint or model preference
- Checking execution mode (inline/fork) and agent type

Returns detailed metadata: name, description, source, model, user-invocable flag,
argument hint, execution mode, allowed tools, and file path.

Examples:
- Get info about the "dcf" skill
- Check execution mode of "backtesting" skill`;

export const SKILL_SEARCH_DESCRIPTION = `
Search for available skills by name or description.

Use this when:
- Finding skills matching a keyword
- Discovering similar skills
- Looking for skills in a category

Returns matching skills with name, description, and execution mode.

Examples:
- Search for "analysis" skills
- Find skills related to "stock"`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a skill's metadata into a single summary line.
 */
function formatSkillSummary(skill: SkillMetadata): string {
  const modelTag = skill.model ? ` [${skill.model}]` : '';
  const contextTag = skill.context ? ` [${skill.context}]` : '';
  return `  - ${skill.name}${modelTag}${contextTag}: ${skill.description} (${skill.source})`;
}

/**
 * Format the full list of skills.
 */
function formatSkillList(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return 'No skills available.';
  }

  const lines = skills.map(formatSkillSummary);
  return `Available skills (${skills.length}):\n${lines.join('\n')}`;
}

/**
 * Format detailed info about a single skill.
 */
function formatSkillInfo(skill: SkillMetadata): string {
  const lines = [
    `Name: ${skill.name}`,
    `Description: ${skill.description}`,
    `Source: ${skill.source}`,
    `Model: ${skill.model ?? 'default'}`,
    `User-invocable: ${skill.userInvocable ? 'yes' : 'no'}`,
    `Argument hint: ${skill.argumentHint ?? '(none)'}`,
    `Execution mode: ${skill.context ?? 'inline'}`,
    `Agent type: ${skill.agent ?? '(default)'}`,
    skill.allowedTools ? `Allowed tools: ${skill.allowedTools.join(', ')}` : null,
    skill.progressMessage ? `Progress message: ${skill.progressMessage}` : null,
    skill.whenToUse ? `When to use: ${skill.whenToUse}` : null,
    skill.aliases && skill.aliases.length > 0 ? `Aliases: ${skill.aliases.join(', ')}` : null,
    `Path: ${skill.path}`,
  ].filter((line) => line !== null && line !== undefined);
  return lines.join('\n');
}

/**
 * Format a skill's full instructions for context injection.
 */
function formatSkillInstructions(skill: Skill, args?: string): string {
  const header = `Skill: ${skill.name}`;
  const argLine = args ? `\nArguments: ${args}` : '';
  const separator = '='.repeat(40);

  return [
    separator,
    header,
    `Source: ${skill.source}`,
    argLine,
    separator,
    '',
    skill.instructions,
    '',
    separator,
  ].filter((line) => line !== undefined).join('\n');
}

// ============================================================================
// Tool Factories
// ============================================================================

export function createSkillListTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'skill_list',
    description: SKILL_LIST_DESCRIPTION,
    schema: SkillListSchema,
    async func(input): Promise<string> {
      try {
        let skills = discoverSkills();

        if (input.category) {
          const cat = input.category.toLowerCase();
          skills = skills.filter((s) => s.source === cat);
        }

        return formatSkillList(skills);
      } catch (err) {
        return `Skill list error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createSkillExecuteTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'skill_execute',
    description: SKILL_EXECUTE_DESCRIPTION,
    schema: SkillExecuteSchema,
    async func(input): Promise<string> {
      try {
        const skill = getSkill(input.name);

        if (!skill) {
          return `Skill not found: "${input.name}". Use skill_list to see available skills.`;
        }

        // Determine execution mode
        const mode = input.mode || skill.context || 'inline';

        // Format instructions with execution mode info
        let result = formatSkillInstructions(skill, input.args);

        // Add execution mode hint
        result += `\n[Execution mode: ${mode}]`;

        // Add fork mode suggestion if applicable
        if (shouldUseForkMode(skill)) {
          result += `\n[Hint: This skill may benefit from fork mode execution]`;
        }

        return result;
      } catch (err) {
        return `Skill execute error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createSkillInfoTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'skill_info',
    description: SKILL_INFO_DESCRIPTION,
    schema: SkillInfoSchema,
    async func(input): Promise<string> {
      try {
        const skills = discoverSkills();
        const skill = skills.find((s) => s.name === input.name);

        if (!skill) {
          return `Skill not found: "${input.name}". Use skill_list to see available skills.`;
        }

        return formatSkillInfo(skill);
      } catch (err) {
        return `Skill info error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

export function createSkillSearchTool(): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'skill_search',
    description: SKILL_SEARCH_DESCRIPTION,
    schema: SkillSearchSchema,
    async func(input): Promise<string> {
      try {
        const skills = discoverSkills();
        const query = input.query.toLowerCase();
        const limit = input.limit || 5;

        // Search by name, description, or whenToUse
        const matches = skills.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query) ||
            (s.whenToUse && s.whenToUse.toLowerCase().includes(query)) ||
            (s.aliases && s.aliases.some((a) => a.toLowerCase().includes(query)))
        ).slice(0, limit);

        if (matches.length === 0) {
          return `No skills found matching "${input.query}". Try skill_list to see all available skills.`;
        }

        const lines = [`Found ${matches.length} skill(s):`];
        for (const skill of matches) {
          lines.push(formatSkillSummary(skill));
        }

        return lines.join('\n');
      } catch (err) {
        return `Skill search error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

// ============================================================================
// Exports for tool registry
// ============================================================================

// Descriptions are exported inline at their definition above
// Tool factories: createSkillListTool, createSkillExecuteTool, createSkillInfoTool, createSkillSearchTool
