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

  return {
    name: data.name,
    description: data.description,
    path,
    source,
    model,
    userInvocable: data['user-invocable'] === true,
    argumentHint: data['argument-hint'] as string | undefined,
    instructions: instructions.trim(),
  };
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
  };
}
