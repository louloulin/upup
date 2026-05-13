import { readFileSync } from 'fs';
import matter from 'gray-matter';
import type { Skill, SkillSource, SkillMetadata, SkillModel } from './types.js';

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

  // Parse optional fields
  const model = parseModelField(data.model);
  const context = parseContextField(data.context);

  return {
    name: data.name,
    description: data.description,
    path,
    source,
    model,
    userInvocable: data['user-invocable'] === true,
    argumentHint: data['argument-hint'] as string | undefined,
    dependsOn: parseDependsOnField(data['depends-on'] ?? data.dependsOn),
    // New fields for dual-mode execution
    context,
    agent: data.agent as string | undefined,
    allowedTools: parseAllowedToolsField(data['allowed-tools'] ?? data.allowedTools),
    progressMessage: data['progress-message'] as string | undefined,
    whenToUse: data['when-to-use'] as string | undefined,
    aliases: parseAliasesField(data.aliases),
    instructions: instructions.trim(),
  };
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
 * Parse allowed tools field
 */
function parseAllowedToolsField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    // Split by comma
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return undefined;
}

/**
 * Parse aliases field
 */
function parseAliasesField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return undefined;
}

/**
 * Parse model field from frontmatter
 */
function parseModelField(value: unknown): SkillModel | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase().trim();
    if (['sonnet', 'haiku', 'opus', 'default'].includes(normalized)) {
      return normalized as SkillModel;
    }
  }
  return undefined;
}

/**
 * Parse depends-on field from frontmatter.
 * Accepts either a string (single dependency) or an array of strings.
 */
function parseDependsOnField(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  return undefined;
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
 * @param path - Absolute path to the SKILL.md file
 * @param source - Where this skill came from
 * @returns Skill metadata (name, description, path, source)
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
    name: data.name,
    description: data.description,
    path,
    source,
    model: parseModelField(data.model),
    userInvocable: data['user-invocable'] === true,
    argumentHint: data['argument-hint'] as string | undefined,
    dependsOn: parseDependsOnField(data['depends-on'] ?? data.dependsOn),
    // New fields for dual-mode execution
    context: parseContextField(data.context),
    agent: data.agent as string | undefined,
    allowedTools: parseAllowedToolsField(data['allowed-tools'] ?? data.allowedTools),
    progressMessage: data['progress-message'] as string | undefined,
    whenToUse: data['when-to-use'] as string | undefined,
    aliases: parseAliasesField(data.aliases),
  };
}

// ============================================================================
// Built-in Plugin Skill Integration
// ============================================================================

/**
 * Bundled skill definition from plugins
 */
export interface PluginBundledSkill {
  /** Skill name */
  name: string;
  /** Skill description */
  description: string;
  /** Markdown instructions */
  instructions: string;
  /** Plugin name that provides this skill */
  pluginName: string;
  /** Optional model specification */
  model?: string;
  /** Optional allowed tools */
  allowedTools?: string[];
  /** Optional execution context */
  context?: 'inline' | 'fork';
  /** Optional user invocable flag */
  userInvocable?: boolean;
  /** Optional argument hint */
  argumentHint?: string;
}

/**
 * Convert a plugin bundled skill to the internal Skill format.
 *
 * @param skill - Plugin bundled skill
 * @returns Skill in internal format
 */
export function convertPluginSkill(skill: PluginBundledSkill): Skill {
  return {
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    path: `plugin:${skill.pluginName}/${skill.name}`,
    source: 'plugin',
    model: parseModelField(skill.model),
    userInvocable: skill.userInvocable ?? false,
    argumentHint: skill.argumentHint,
    context: skill.context,
    allowedTools: skill.allowedTools,
  };
}

/**
 * Convert multiple plugin skills to internal format.
 *
 * @param skills - Array of plugin bundled skills
 * @returns Array of skills in internal format
 */
export function convertPluginSkills(skills: PluginBundledSkill[]): Skill[] {
  return skills.map(convertPluginSkill);
}
