/**
 * Skill Commands - Unified command registration and management
 *
 * This module integrates the skill discovery system with the command registry,
 * creating a unified system similar to Loucode's getSkillDirCommands().
 *
 * Key responsibilities:
 * - Register all discovered skills as commands
 * - Provide initializeSkills() for startup
 * - Create SkillCommand objects with getPromptForCommand() method
 *
 * Architecture: Uses SkillCommandRegistry as the single source of truth.
 * This eliminates the previous dual-registry problem where registeredCommands
 * Map and SkillCommandRegistry could get out of sync.
 *
 * Reference: Loucode's getSkillDirCommands() pattern
 */

import type { Skill, SkillCommand, SkillMetadata } from './types.js';
import { discoverSkills, getSkill, getAllBundledSkills } from './registry.js';
import { createSkillCommand, bundledSkillToSkill } from './executor.js';
import { SkillCommandRegistry, getSkillCommandRegistry } from './slash-command.js';
import { registerBuiltinSkills } from './builtin-skills.js';


// ============================================================================
// Global State
// ============================================================================

let initialized = false;


// ============================================================================
// Initialize Skills (Core Startup Function)
// ============================================================================

/**
 * Initialize all skills and register them as commands.
 *
 * This function should be called during startup to:
 * 1. Initialize bundled skills
 * 2. Discover all file-based skills
 * 3. Load full skill content
 * 4. Create SkillCommand objects
 * 5. Register commands with the registry
 *
 * Uses SkillCommandRegistry as the single source of truth.
 *
 * @param registry - Optional registry instance (uses global if not provided)
 * @returns Number of skills registered
 */
export async function initializeSkills(
  registry?: SkillCommandRegistry
): Promise<number> {
  if (initialized) {
    return getSkillCommandRegistry().skillCommandCount;
  }

  const skillRegistry = registry || getSkillCommandRegistry();

  let count = 0;

  // Step 0: Register built-in bundled skills (P1)
  registerBuiltinSkills();

  // Step 1: Register bundled skills
  const bundledSkills = getAllBundledSkills();
  for (const bundled of bundledSkills) {
    if (bundled.userInvocable === false) {
      continue;
    }

    // Convert bundled skill to full skill
    const skill = bundledSkillToSkill(bundled);

    // Create SkillCommand with dynamic prompt support
    const command = createSkillCommand(skill, 'builtin');

    // Register for execution (SkillCommand with getPromptForCommand)
    skillRegistry.registerSkillCommand(skill.name, command);

    // Register for autocomplete + triggers (includes triggers/aliases)
    skillRegistry.registerSkill({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      triggers: skill.aliases || [],
      user_invocable: skill.userInvocable ?? true,
      model: skill.model,
      argument_hint: skill.argumentHint,
    }, command);  // Pass command to register triggers to skillCommands Map

    count++;
  }

  // Step 2: Register file-based skills (file-based takes precedence over bundled)
  const fileBasedSkills = discoverSkills();

  for (const metadata of fileBasedSkills) {
    // Skip skills that are not user invocable
    if (metadata.userInvocable === false) {
      continue;
    }

    // Load full skill content
    const skill = getSkill(metadata.name);
    if (!skill) {
      console.warn(`[skills] Failed to load skill: ${metadata.name}`);
      continue;
    }

    // Create SkillCommand
    const command = createSkillCommand(skill, metadata.source);

    // Register for execution
    skillRegistry.registerSkillCommand(skill.name, command);

    // Register for autocomplete + triggers (includes triggers/aliases)
    skillRegistry.registerSkill({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      triggers: skill.aliases || [],
      user_invocable: skill.userInvocable ?? true,
      model: skill.model,
    }, command);  // Pass command to register triggers to skillCommands Map

    count++;
  }

  initialized = true;
  console.log(`[skills] Initialized ${count} skills (${bundledSkills.length} bundled + ${fileBasedSkills.length} file-based)`);
  return count;
}

/**
 * Get the number of registered skill commands.
 * Uses SkillCommandRegistry as single source of truth.
 */
export function getRegisteredCommandCount(): number {
  return getSkillCommandRegistry().skillCommandCount;
}

/**
 * Check if skills have been initialized.
 */
export function isInitialized(): boolean {
  return initialized;
}

/**
 * Reset initialization state (for testing).
 */
export function resetInitialization(): void {
  initialized = false;
  getSkillCommandRegistry().clear();
}

/**
 * Get a registered skill command by name.
 * Uses SkillCommandRegistry as single source of truth.
 *
 * @param name - Command name (e.g., 'dcf')
 * @returns SkillCommand or undefined if not found
 */
export function getSkillCommand(name: string): SkillCommand | undefined {
  return getSkillCommandRegistry().getSkillCommand(name);
}

/**
 * Get all registered skill commands.
 * Uses SkillCommandRegistry as single source of truth.
 */
export function getAllSkillCommands(): SkillCommand[] {
  return getSkillCommandRegistry().getAllSkillCommands();
}

/**
 * Get commands filtered by source.
 * Uses SkillCommandRegistry as single source of truth.
 */
export function getCommandsBySource(source: string): SkillCommand[] {
  return getSkillCommandRegistry().getAllSkillCommands().filter(
    cmd => cmd.source === source
  );
}

/**
 * Check if a command exists.
 * Uses SkillCommandRegistry as single source of truth.
 */
export function hasCommand(name: string): boolean {
  return getSkillCommandRegistry().hasSkillCommand(name);
}

/**
 * Search commands by name prefix.
 * Uses SkillCommandRegistry as single source of truth.
 */
export function searchCommands(prefix: string): SkillCommand[] {
  const lowerPrefix = prefix.toLowerCase();
  return getSkillCommandRegistry().getAllSkillCommands().filter(
    cmd => cmd.name.startsWith(lowerPrefix)
  );
}

/**
 * Get unique skill commands by name (deduplicated).
 * Aliases point to the same skill, so this returns only unique skill names.
 * Useful for displaying skill lists without duplicates.
 */
export function getUniqueSkillCommands(): SkillCommand[] {
  const seen = new Set<string>();
  const unique: SkillCommand[] = [];

  for (const cmd of getSkillCommandRegistry().getAllSkillCommands()) {
    if (!seen.has(cmd.name)) {
      seen.add(cmd.name);
      unique.push(cmd);
    }
  }

  return unique;
}

// ============================================================================
// Command Execution (Wrapper for getPromptForCommand)
// ============================================================================

/**
 * Execute a skill command by name.
 *
 * @param name - Command name
 * @param args - Arguments to pass
 * @param context - Optional tool use context
 * @returns Promise resolving to content blocks or undefined if command not found
 */
export async function executeSkillCommand(
  name: string,
  args: string,
  context?: unknown
): Promise<Array<{ type: 'text'; text: string }> | undefined> {
  const command = getSkillCommand(name);
  if (!command) {
    return undefined;
  }
  return command.getPromptForCommand(args, context);
}

// ============================================================================
// Re-export types
// ============================================================================

export type { SkillCommand } from './types.js';
