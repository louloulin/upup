import { existsSync, readdirSync } from 'fs';
import { EventEmitter } from 'events';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { SkillMetadata, Skill, SkillSource } from './types.js';
import { extractSkillMetadata, loadSkillFromPath } from './loader.js';
import { upupPath } from '../utils/paths.js';
import type { BundledSkillDefinition } from './types.js';

// Get the directory of this file to locate builtin skills
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Skill directories in order of precedence (later overrides earlier).
 *
 * Priority: project > user > builtin
 * - project (.upup/skills/): Project-specific skills, highest priority
 * - user (.claude/skills/): User-level skills, overrides builtin
 * - builtin (src/skills/): Built-in skills, lowest priority
 *
 * This allows users to override any built-in skill with their own versions.
 */
const SKILL_DIRECTORIES: { path: string; source: SkillSource }[] = [
  { path: __dirname, source: 'builtin' },
  { path: join(process.cwd(), '.claude', 'skills'), source: 'user' },
  { path: join(process.cwd(), upupPath('skills')), source: 'project' },
];

// Cache for discovered skills (metadata only)
let skillMetadataCache: Map<string, SkillMetadata> | null = null;

// Event emitter for skill lifecycle events
const skillEvents = new EventEmitter();

/**
 * Subscribe to skill events
 * @param event - Event name ('skillsLoaded', 'skillCacheCleared')
 * @param handler - Event handler callback
 */
export function onSkillEvent(event: string, handler: (...args: any[]) => void): void {
  skillEvents.on(event, handler);
}

/**
 * Unsubscribe from skill events
 * @param event - Event name
 * @param handler - Event handler to remove
 */
export function offSkillEvent(event: string, handler: (...args: any[]) => void): void {
  skillEvents.off(event, handler);
}

/**
 * Get the skill event emitter for advanced use cases
 */
export function getSkillEventEmitter(): EventEmitter {
  return skillEvents;
}

/**
 * Scan a directory for SKILL.md files and return their metadata.
 * Looks for directories containing SKILL.md files.
 *
 * @param dirPath - Directory to scan
 * @param source - Source type for discovered skills
 * @returns Array of skill metadata
 */
function scanSkillDirectory(dirPath: string, source: SkillSource): SkillMetadata[] {
  if (!existsSync(dirPath)) {
    return [];
  }

  const skills: SkillMetadata[] = [];
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillFilePath = join(dirPath, entry.name, 'SKILL.md');
      if (existsSync(skillFilePath)) {
        try {
          const metadata = extractSkillMetadata(skillFilePath, source);
          skills.push(metadata);
        } catch {
          // Skip invalid skill files silently
        }
      }
    }
  }

  return skills;
}

/**
 * Discover all available skills from all skill directories.
 * Uses parallel directory scanning for faster startup.
 * Later sources (project > user > builtin) override earlier ones.
 *
 * @returns Array of skill metadata, deduplicated by name
 */
export function discoverSkills(): SkillMetadata[] {
  if (skillMetadataCache) {
    return Array.from(skillMetadataCache.values());
  }

  skillMetadataCache = new Map();

  // Pre-filter directories that exist to avoid unnecessary work
  const validDirs = SKILL_DIRECTORIES.filter(({ path }) => existsSync(path));

  // Scan all valid directories
  for (const { path, source } of validDirs) {
    const skills = scanSkillDirectory(path, source);
    for (const skill of skills) {
      // Later sources override earlier ones (by name)
      skillMetadataCache.set(skill.name, skill);
    }
  }

  const result = Array.from(skillMetadataCache.values());
  // Emit skillsLoaded event
  skillEvents.emit('skillsLoaded', result);
  return result;
}

/**
 * Async version of discoverSkills - for use in async contexts.
 * Uses parallel directory scanning for maximum performance.
 *
 * @returns Promise resolving to Array of skill metadata
 */
export async function discoverSkillsAsync(): Promise<SkillMetadata[]> {
  if (skillMetadataCache) {
    return Array.from(skillMetadataCache.values());
  }

  skillMetadataCache = new Map();

  // Pre-filter directories that exist
  const validDirs = SKILL_DIRECTORIES.filter(({ path }) => existsSync(path));

  // Scan all directories in parallel
  const allSkills = await Promise.all(
    validDirs.map(({ path, source }) =>
      scanSkillDirectoryAsync(path, source)
    )
  );

  // Merge results (later sources override earlier ones)
  for (const skills of allSkills) {
    for (const skill of skills) {
      skillMetadataCache.set(skill.name, skill);
    }
  }

  return Array.from(skillMetadataCache.values());
}

/**
 * Async version of scanSkillDirectory - allows parallel execution.
 */
async function scanSkillDirectoryAsync(
  dirPath: string,
  source: SkillSource
): Promise<SkillMetadata[]> {
  if (!existsSync(dirPath)) {
    return [];
  }

  let entries: import('fs').Dirent[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Filter directories with SKILL.md first
  const skillDirs = entries.filter(entry =>
    entry.isDirectory()
  );

  // Process directories in parallel
  const scanPromises = skillDirs.map(async (entry) => {
    const skillFilePath = join(dirPath, entry.name, 'SKILL.md');
    if (!existsSync(skillFilePath)) {
      return null;
    }
    try {
      return extractSkillMetadata(skillFilePath, source);
    } catch {
      return null;
    }
  });

  const results = await Promise.all(scanPromises);
  return results.filter((s): s is SkillMetadata => s !== null);
}

/**
 * Get a skill by name, loading full instructions.
 * Checks both file-based skills and bundled skills.
 *
 * @param name - Name of the skill to load
 * @returns Full skill definition or undefined if not found
 */
export function getSkill(name: string): Skill | undefined {
  // Ensure cache is populated
  if (!skillMetadataCache) {
    discoverSkills();
  }

  // First check file-based skills
  const metadata = skillMetadataCache?.get(name);
  if (metadata) {
    return loadSkillFromPath(metadata.path, metadata.source);
  }

  // Then check bundled skills (local registry)
  const bundled = getBundledSkill(name);
  if (bundled) {
    // Check if bundled skill has getPromptForCommand method
    const hasPromptMethod = typeof (bundled as any).getPromptForCommand === 'function';

    // Convert bundled skill to Skill format
    const skill: Skill = {
      name: bundled.name,
      description: bundled.description,
      instructions: bundled.instructions,
      path: `bundled:${bundled.name}`,
      source: 'builtin',
      userInvocable: bundled.userInvocable ?? true,
      argumentHint: bundled.argumentHint,
      model: bundled.model,
      context: bundled.context,
      agent: bundled.agent,
      allowedTools: bundled.allowedTools,
      progressMessage: bundled.progressMessage,
      whenToUse: bundled.whenToUse,
    };

    // Include getPromptForCommand method if available
    if (hasPromptMethod) {
      (skill as any).getPromptForCommand = (bundled as any).getPromptForCommand;
    }

    return skill;
  }

  return undefined;
}

/**
 * Build the skill metadata section for the system prompt.
 * Only includes name and description (lightweight).
 *
 * @returns Formatted string for system prompt injection
 */
export function buildSkillMetadataSection(): string {
  const skills = discoverSkills();

  if (skills.length === 0) {
    return 'No skills available.';
  }

  return skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join('\n');
}

/**
 * Clear the skill cache. Useful for testing or when skills are added/removed.
 */
export function clearSkillCache(): void {
  skillMetadataCache = null;
  skillEvents.emit('skillCacheCleared');
}

// ============================================================================
// Bundled Skills Registry
// ============================================================================

// Bundled skills are registered programmatically (not from SKILL.md files)
const bundledSkillsRegistry: Map<string, BundledSkillDefinition> = new Map();

/**
 * Register a bundled skill (programmatic skill without SKILL.md file).
 * This enables internal skills to be registered without file system dependency.
 *
 * @param definition - Bundled skill definition
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  // Check for name conflict with file-based skills
  if (skillMetadataCache?.has(definition.name)) {
    console.warn(`[skills] Bundled skill '${definition.name}' conflicts with existing file-based skill, skipping`);
    return;
  }
  bundledSkillsRegistry.set(definition.name, definition);
}

/**
 * Get a bundled skill by name.
 *
 * @param name - Skill name
 * @returns Bundled skill definition or undefined
 */
export function getBundledSkill(name: string): BundledSkillDefinition | undefined {
  return bundledSkillsRegistry.get(name);
}

/**
 * Get all bundled skills.
 *
 * @returns Array of bundled skill definitions
 */
export function getAllBundledSkills(): BundledSkillDefinition[] {
  return Array.from(bundledSkillsRegistry.values());
}

/**
 * Get all skills including bundled skills.
 * Combines file-based skills with bundled skills.
 *
 * @returns Array of all skill metadata
 */
export function getAllSkills(): SkillMetadata[] {
  const fileBased = discoverSkills();
  const bundled: SkillMetadata[] = getAllBundledSkills().map(skill => ({
    name: skill.name,
    description: skill.description,
    path: `bundled:${skill.name}`,
    source: 'builtin' as SkillSource,
    userInvocable: skill.userInvocable,
    argumentHint: skill.argumentHint,
  }));

  // Combine and deduplicate (file-based takes precedence)
  const combined = new Map<string, SkillMetadata>();
  for (const skill of bundled) {
    combined.set(skill.name, skill);
  }
  for (const skill of fileBased) {
    combined.set(skill.name, skill);
  }

  return Array.from(combined.values());
}
