import { readFileSync } from 'fs';
import matter from 'gray-matter';
import type { Skill, SkillSource, SkillMetadata, SkillModel, HooksSettings, EffortValue } from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse effort value from frontmatter.
 * Supports both string values (minimal, short, medium, long, extended) and numbers.
 */
function parseEffortValue(value: unknown): EffortValue | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    if (['minimal', 'short', 'medium', 'long', 'extended'].includes(normalized)) {
      return normalized as EffortValue;
    }
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      return num;
    }
  }
  if (typeof value === 'number' && value >= 0) {
    return value;
  }
  return undefined;
}

/**
 * Parse context field (inline/fork execution mode)
 */
function parseContextField(value: unknown): 'inline' | 'fork' | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    if (normalized === 'inline' || normalized === 'fork') {
      return normalized;
    }
  }
  return undefined;
}

/**
 * Parse model field from frontmatter
 */
function parseModelField(value: unknown): SkillModel | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    return value as SkillModel;
  }
  return undefined;
}

/**
 * Parse allowed tools field from frontmatter
 */
function parseAllowedToolsField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse dependsOn field from frontmatter
 */
function parseDependsOnField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse aliases field from frontmatter
 */
function parseAliasesField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse shell field from frontmatter
 */
function parseShellField(value: unknown): { commands?: string[]; cwd?: string } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const shell = value as Record<string, unknown>;
  if (shell.commands && Array.isArray(shell.commands)) {
    return {
      commands: shell.commands.filter((c): c is string => typeof c === 'string'),
      cwd: typeof shell.cwd === 'string' ? shell.cwd : undefined,
    };
  }
  return undefined;
}

/**
 * Parse paths field from frontmatter
 */
function parsePathsField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/[,\n]+/).map(p => p.trim()).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse hooks field from frontmatter
 */
function parseHooksField(value: unknown): HooksSettings | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const hooks = value as Record<string, unknown>;
  const result: HooksSettings = {};
  if (hooks.preTool && Array.isArray(hooks.preTool)) {
    result.preTool = hooks.preTool
      .filter((h): h is { name: string; enabled?: boolean } =>
        typeof h === 'object' && h !== null && typeof h.name === 'string'
      );
  }
  if (hooks.postTool && Array.isArray(hooks.postTool)) {
    result.postTool = hooks.postTool
      .filter((h): h is { name: string; enabled?: boolean } =>
        typeof h === 'object' && h !== null && typeof h.name === 'string'
      );
  }
  return result.preTool || result.postTool ? result : undefined;
}

/**
 * Parse files field from frontmatter
 */
function parseFilesField(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const files: Record<string, string> = {};
  for (const [key, val] of Object.entries(value)) {
    if (typeof val === 'string') {
      files[key] = val;
    }
  }
  return Object.keys(files).length > 0 ? files : undefined;
}

/**
 * Parse argument names field from frontmatter
 */
function parseArgumentNamesField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse triggers field from frontmatter
 */
function parseTriggersField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/[,\s]+/).filter(Boolean);
  }
  return undefined;
}

/**
 * Parse effort field from frontmatter (for extractSkillMetadata)
 */
function parseEffortField(value: unknown): 'minimal' | 'short' | 'medium' | 'long' | 'extended' | undefined {
  if (!value) return undefined;
  const valid = ['minimal', 'short', 'medium', 'long', 'extended'];
  if (typeof value === 'string' && valid.includes(value)) {
    return value as 'minimal' | 'short' | 'medium' | 'long' | 'extended';
  }
  return undefined;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * Parse a SKILL.md file content into a Skill object.
 * Extracts YAML frontmatter (name, description) and the markdown body (instructions).
 *
 * @param content - Raw file content
 * @param path - Absolute path to the file (for reference)
 * @param source - Where this skill came from
 * @returns Parsed Skill object
 * @throws Error if required frontmatter fields are missing
 */
export function parseSkillFile(content: string, path: string, source: SkillSource): Skill {
  const { data, content: instructions } = matter(content);

  // Validate required frontmatter fields
  if (!data.name || typeof data.name !== 'string') {
    throw new Error(`Skill at ${path} is missing required 'name' field in frontmatter`);
  }
  if (!data.description || typeof data.description !== 'string') {
    throw new Error(`Skill at ${path} is missing required 'description' field in frontmatter`);
  }

  return {
    name: data.name,
    description: data.description,
    descriptionZhCn:
      typeof data['description.zh-CN'] === 'string'
        ? (data['description.zh-CN'] as string)
        : undefined,
    path,
    source,
    model: parseModelField(data.model),
    userInvocable: data['user-invocable'] !== false, // Default to true
    argumentHint: data['argument-hint'] as string | undefined,
    dependsOn: parseDependsOnField(data['depends-on'] ?? data.dependsOn),
    context: parseContextField(data.context),
    agent: data.agent as string | undefined,
    allowedTools: parseAllowedToolsField(data['allowed-tools'] ?? data.allowedTools),
    progressMessage: data['progress-message'] as string | undefined,
    whenToUse: data['when-to-use'] as string | undefined,
    aliases: parseAliasesField(data.aliases),
    instructions: instructions.trim(),
    paths: parsePathsField(data.paths),
    hooks: parseHooksField(data.hooks),
    effort: parseEffortValue(data.effort),
    version: typeof data.version === 'string' ? data.version : undefined,
    shell: parseShellField(data.shell),
  };
}

/**
 * Load a skill from a file path.
 *
 * @param path - Absolute path to the SKILL.md file
 * @param source - Where this skill came from
 * @returns Parsed Skill object
 * @throws Error if file cannot be read or parsed
 */
export function loadSkillFromPath(path: string, source: SkillSource): Skill {
  const content = readFileSync(path, 'utf-8');
  return parseSkillFile(content, path, source);
}

/**
 * Extract just the metadata from a skill file without loading full instructions.
 * Used for lightweight discovery at startup.
 *
 * Extended to parse 16+ frontmatter fields to match loucode's implementation.
 */
export function extractSkillMetadata(path: string, source: SkillSource): SkillMetadata {
  const content = readFileSync(path, 'utf-8');
  const { data } = matter(content);

  if (!data.name || typeof data.name !== 'string') {
    throw new Error(`Skill at ${path} is missing required 'name' field in frontmatter`);
  }
  if (!data.description || typeof data.description !== 'string') {
    throw new Error(`Skill at ${path} is missing required 'description' field in frontmatter`);
  }

  return {
    // === Core Fields (Required) ===
    name: data.name,
    description: data.description,
    descriptionZhCn:
      typeof data['description.zh-CN'] === 'string'
        ? (data['description.zh-CN'] as string)
        : undefined,
    path,
    source,

    // === Execution Configuration ===
    model: parseModelField(data.model),
    context: parseContextField(data.context),
    agent: data.agent as string | undefined,
    allowedTools: parseAllowedToolsField(data['allowed-tools'] ?? data.allowedTools),
    effort: parseEffortField(data.effort),
    disableModelInvocation: data['disable-model-invocation'] === true,

    // === User Invocation ===
    userInvocable: data['user-invocable'] !== false,
    argumentHint: data['argument-hint'] as string | undefined,
    argumentNames: parseArgumentNamesField(data['argument-names'] ?? data.argumentNames),
    aliases: parseAliasesField(data.aliases),
    triggers: parseTriggersField(data.triggers),

    // === Skill Relationships ===
    dependsOn: parseDependsOnField(data['depends-on'] ?? data.dependsOn),
    paths: parsePathsField(data.paths),

    // === Hooks & Files ===
    hooks: parseHooksField(data.hooks),
    files: parseFilesField(data.files),

    // === UI & Metadata ===
    progressMessage: data['progress-message'] as string | undefined,
    whenToUse: data['when-to-use'] as string | undefined,
    version: data.version as string | undefined,
  };
}

// ============================================================================
// Built-in Plugin Skill Integration
// ============================================================================

/**
 * Bundled skill definition from plugins
 */
export interface PluginBundledSkill {
  name: string;
  description: string;
  instructions: string;
  pluginName: string;
  model?: string;
  allowedTools?: string[];
  context?: 'inline' | 'fork';
  userInvocable?: boolean;
  argumentHint?: string;
}

/**
 * Convert a plugin bundled skill to the internal Skill format.
 */
export function convertPluginSkill(skill: PluginBundledSkill): Skill {
  return {
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    path: `plugin:${skill.pluginName}/${skill.name}`,
    source: 'plugin',
    model: parseModelField(skill.model),
    userInvocable: skill.userInvocable ?? true,
    argumentHint: skill.argumentHint,
    context: skill.context,
    allowedTools: skill.allowedTools,
  };
}

/**
 * Convert multiple plugin skills to internal format.
 */
export function convertPluginSkills(skills: PluginBundledSkill[]): Skill[] {
  return skills.map(convertPluginSkill);
}