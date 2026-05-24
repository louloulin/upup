/**
 * Skill Slash Command Parser
 *
 * Implements Slash command parsing for skills:
 * - Parse /skill-name args format
 * - Skill command registration
 * - Skill invocation routing
 *
 * Reference: Claude Code's skills system
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Skill command parsed from input
 */
export interface SkillCommand {
  /** Skill name (without /) */
  name: string;
  /** Arguments after skill name */
  args?: string;
  /** Full original input */
  raw: string;
  /** Skill path */
  skillPath?: string;
}

/**
 * Skill metadata
 */
export interface SkillMetadata {
  name: string;
  description?: string;
  path: string;
  triggers: string[];
  user_invocable: boolean;
  model?: string;
  argument_hint?: string;
}

/**
 * Skill command registration
 */
export interface SkillCommandRegistration {
  name: string;
  description: string;
  skillPath: string;
  metadata?: SkillMetadata;
}

// ============================================================================
// Slash Command Parser
// ============================================================================

/**
 * Parse slash command from user input
 */
export function parseSlashCommand(input: string): SkillCommand | null {
  // Match /skill-name or /skill-name args
  // Support hyphens and underscores in skill names
  const match = input.match(/^\/([\w-]+)(?:\s+(.*))?$/);
  if (!match) return null;

  return {
    name: match[1].toLowerCase(),
    args: match[2]?.trim(),
    raw: input,
  };
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * Extract skill name from slash command
 */
export function getSkillName(input: string): string | null {
  const parsed = parseSlashCommand(input);
  return parsed?.name ?? null;
}

// ============================================================================
// Skill Command Registry
// ============================================================================

/**
 * Skill command registry
 */
export class SkillCommandRegistry {
  private commands: Map<string, SkillCommandRegistration> = new Map();
  private skills: Map<string, SkillMetadata> = new Map();

  /**
   * Register a skill command
   */
  register(registration: SkillCommandRegistration): void {
    this.commands.set((registration.name || "").toLowerCase(), registration);
  }

  /**
   * Register a skill (internal metadata)
   */
  registerSkill(metadata: SkillMetadata): void {
    this.skills.set((metadata.name || "").toLowerCase(), metadata);

    // Auto-register if user_invocable
    if (metadata.user_invocable) {
      this.register({
        name: metadata.name,
        description: metadata.description ?? '',
        skillPath: metadata.path,
        metadata,
      });

      // Also register triggers
      for (const trigger of metadata.triggers) {
        const triggerName = trigger.replace(/^\//, '').toLowerCase();
        if (triggerName !== (metadata.name || "").toLowerCase()) {
          this.register({
            name: triggerName,
            description: metadata.description ?? '',
            skillPath: metadata.path,
            metadata,
          });
        }
      }
    }
  }

  /**
   * Get command by name
   */
  getCommand(name: string): SkillCommandRegistration | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): SkillMetadata | undefined {
    return this.skills.get(name.toLowerCase());
  }

  /**
   * Get all commands
   */
  getAllCommands(): SkillCommandRegistration[] {
    return [...this.commands.values()];
  }

  /**
   * Get all skills
   */
  getAllSkills(): SkillMetadata[] {
    return [...this.skills.values()];
  }

  /**
   * Get user-invocable skills
   */
  getUserInvocableSkills(): SkillMetadata[] {
    return this.getAllSkills().filter(s => s.user_invocable);
  }

  /**
   * Check if command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Search commands by prefix
   */
  searchCommands(prefix: string): SkillCommandRegistration[] {
    const lowerPrefix = prefix.toLowerCase();
    return this.getAllCommands().filter(cmd =>
      cmd.name.startsWith(lowerPrefix)
    );
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.commands.clear();
    this.skills.clear();
  }

  /**
   * Get command count
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Get skill count
   */
  get skillCount(): number {
    return this.skills.size;
  }
}

// ============================================================================
// Skill Command Router
// ============================================================================

/**
 * Route slash command to skill
 */
export async function routeSlashCommand(
  input: string,
  registry: SkillCommandRegistry
): Promise<{
  matched: boolean;
  command?: SkillCommandRegistration;
  skill?: SkillMetadata;
  error?: string;
}> {
  const parsed = parseSlashCommand(input);

  if (!parsed) {
    return {
      matched: false,
      error: 'Invalid slash command format',
    };
  }

  const command = registry.getCommand(parsed.name);

  if (!command) {
    return {
      matched: false,
      error: `Unknown skill: ${parsed.name}`,
    };
  }

  const skill = registry.getSkill(parsed.name);

  return {
    matched: true,
    command,
    skill,
  };
}

// ============================================================================
// Global Registry Instance
// ============================================================================

let globalRegistry: SkillCommandRegistry | null = null;

export function getSkillCommandRegistry(): SkillCommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillCommandRegistry();
  }
  return globalRegistry;
}

export function resetSkillCommandRegistry(): void {
  if (globalRegistry) {
    globalRegistry.clear();
    globalRegistry = null;
  }
}

// ============================================================================
// Skill Load Utilities
// ============================================================================

/**
 * Parse SKILL.md frontmatter
 */
export function parseSkillFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const frontmatterBlock = match[1];

  // Split by lines and handle multi-line values
  const lines = frontmatterBlock.split('\n');
  let currentKey = '';
  let currentValue = '';

  for (const line of lines) {
    // Check if this is a new key (starts with non-space or spaces followed by key:)
    const keyMatch = line.match(/^(\w[\w-]*)\s*:/);
    if (keyMatch) {
      // Save previous key-value pair
      if (currentKey) {
        result[currentKey] = currentValue.trim();
      }

      // Start new key
      currentKey = keyMatch[1];
      currentValue = line.substring(keyMatch[0].length).trim();
    } else if (currentKey) {
      // Continuation of previous value (indented line)
      if (line.trim() && (line.startsWith('  ') || line.startsWith('-') || line.startsWith('['))) {
        currentValue += '\n' + line;
      }
    }
  }

  // Save last key-value pair
  if (currentKey) {
    result[currentKey] = currentValue.trim();
  }

  return result;
}

/**
 * Extract triggers from frontmatter
 */
export function extractTriggers(frontmatter: Record<string, string>): string[] {
  const triggers: string[] = [];

  // Check 'triggers' field (array format)
  const triggersField = frontmatter['triggers'];
  if (triggersField) {
    // Handle YAML array format - match bracket content with DOTALL flag
    if (triggersField.includes('[')) {
      // Match everything between [ and ] (including newlines)
      const match = triggersField.match(/\[([\s\S]*?)\]/);
      if (match && match[1]) {
        // Split by comma and clean up each item
        const items = match[1]
          .split(',')
          .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
          .filter(t => t.length > 0);
        triggers.push(...items);
      }
    } else if (triggersField.includes('-')) {
      // Handle YAML list format: "  - /trigger1\n  - /trigger2"
      const lines = triggersField.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('-')) {
          const trigger = trimmed.substring(1).trim().replace(/^['"]|['"]$/g, '');
          if (trigger) {
            triggers.push(trigger);
          }
        }
      }
    } else {
      triggers.push(triggersField);
    }
  }

  // Check 'trigger' field (single)
  const triggerField = frontmatter['trigger'];
  if (triggerField && !triggers.includes(triggerField)) {
    triggers.push(triggerField);
  }

  return triggers;
}

/**
 * Register skills from directory
 */
export async function registerSkillsFromDirectory(
  dir: string,
  registry: SkillCommandRegistry
): Promise<number> {
  const { readdir, readFile } = await import('fs/promises');
  const { join } = await import('path');

  let count = 0;

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(dir, entry.name, 'SKILL.md');

        try {
          const content = await readFile(skillPath, 'utf-8');
          const frontmatter = parseSkillFrontmatter(content);
          const triggers = extractTriggers(frontmatter);

          const skill: SkillMetadata = {
            name: frontmatter['name'] || entry.name,
            description: frontmatter['description'],
            path: skillPath,
            triggers,
            user_invocable: frontmatter['user-invocable'] === 'true' || frontmatter['user-invocable'] === '1',
            model: frontmatter['model'],
            argument_hint: frontmatter['argument-hint'],
          };

          registry.registerSkill(skill);
          count++;
        } catch {
          // SKILL.md not found, skip
        }
      }
    }
  } catch {
    // Directory doesn't exist, skip
  }

  return count;
}

/**
 * Auto-discover and register all skills
 */
export async function discoverAndRegisterSkills(
  registry: SkillCommandRegistry,
  skillDirs: string[] = ['.claude/skills', '.upup/skills', 'src/skills']
): Promise<number> {
  let totalCount = 0;

  for (const dir of skillDirs) {
    const count = await registerSkillsFromDirectory(dir, registry);
    totalCount += count;
  }

  return totalCount;
}