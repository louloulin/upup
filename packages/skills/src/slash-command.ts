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
export interface ParsedSkillCommand {
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
export interface SlashSkillMetadata {
  name: string;
  description?: string;
  path: string;
  triggers: string[];
  user_invocable: boolean;
  model?: string;
  argument_hint?: string;
  whenToUse?: string;
  source?: string;
  userInvocable?: boolean;
  argumentHint?: string;
}

/**
 * Skill command registration
 */
export interface SkillCommandRegistration {
  name: string;
  description: string;
  skillPath: string;
  metadata?: SlashSkillMetadata;
}

// ============================================================================
// Slash Command Parser
// ============================================================================

/**
 * Parse slash command from user input
 */
export function parseSlashCommand(input: string): ParsedSkillCommand | null {
  // Match /skill-name or /skill-name args
  // Support hyphens and underscores in skill names
  const match = input.match(/^\/([\w-]+)(?:\s+(.*))?$/);
  if (!match) return null;

  return {
    name: match[1]?.toLowerCase() ?? '',
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
 *
 * This registry serves as the single source of truth for all skill commands.
 * It maintains two types of data:
 * - SkillCommandRegistration: lightweight metadata for autocomplete (includes triggers)
 * - SkillCommand: full command with getPromptForCommand() for execution
 *
 * Architecture aligns with Loucode's getSkillDirCommands() pattern.
 */
export class SkillCommandRegistry {
  // For autocomplete (includes triggers as aliases)
  private commands: Map<string, SkillCommandRegistration> = new Map();
  // For metadata lookup
  private skills: Map<string, SlashSkillMetadata> = new Map();
  // For execution (SkillCommand with getPromptForCommand)
  private skillCommands: Map<string, import('./types.js').SkillCommand> = new Map();
  // P2: Lazy initialization flag for fuzzy search
  private searchIndexInitialized = false;

  /**
   * Register a skill command (for autocomplete)
   */
  register(registration: SkillCommandRegistration): void {
    this.commands.set((registration.name || "").toLowerCase(), registration);
  }

  /**
   * Register a skill command for execution (SkillCommand with getPromptForCommand)
   * This stores the full command object needed for execution.
   */
  registerSkillCommand(name: string, command: import('./types.js').SkillCommand): void {
    this.skillCommands.set(name.toLowerCase(), command);
  }

  /**
   * Register a skill (internal metadata)
   * @param metadata - Skill metadata
   * @param command - Optional SkillCommand for registering triggers to execution Map
   */
  registerSkill(metadata: SlashSkillMetadata, command?: import('./types.js').SkillCommand): void {
    this.skills.set((metadata.name || "").toLowerCase(), metadata);

    // Auto-register if user_invocable
    if (metadata.user_invocable) {
      this.register({
        name: metadata.name,
        description: metadata.description ?? '',
        skillPath: metadata.path,
        metadata,
      });

      // Also register triggers to both maps
      for (const trigger of metadata.triggers) {
        const triggerName = trigger.replace(/^\//, '').toLowerCase();
        if (triggerName !== (metadata.name || "").toLowerCase()) {
          // Register to commands Map (for autocomplete)
          this.register({
            name: triggerName,
            description: metadata.description ?? '',
            skillPath: metadata.path,
            metadata,
          });

          // Register to skillCommands Map (for execution) if command provided
          if (command) {
            this.skillCommands.set(triggerName, command);
          }
        }
      }
    }
  }

  /**
   * Get command by name (for autocomplete)
   */
  getCommand(name: string): SkillCommandRegistration | undefined {
    return this.commands.get(name.toLowerCase());
  }

  /**
   * Get skill command for execution (with getPromptForCommand)
   */
  getSkillCommand(name: string): import('./types.js').SkillCommand | undefined {
    return this.skillCommands.get(name.toLowerCase());
  }

  /**
   * Get skill by name
   */
  getSkill(name: string): SlashSkillMetadata | undefined {
    return this.skills.get(name.toLowerCase());
  }

  /**
   * Get all commands (for autocomplete)
   */
  getAllCommands(): SkillCommandRegistration[] {
    return [...this.commands.values()];
  }

  /**
   * Get all skill commands (for execution)
   */
  getAllSkillCommands(): import('./types.js').SkillCommand[] {
    return [...this.skillCommands.values()];
  }

  /**
   * Get all skills
   */
  getAllSkills(): SlashSkillMetadata[] {
    return [...this.skills.values()];
  }

  /**
   * Get user-invocable skills
   */
  getUserInvocableSkills(): SlashSkillMetadata[] {
    return this.getAllSkills().filter(s => s.user_invocable);
  }

  /**
   * Check if command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name.toLowerCase());
  }

  /**
   * Check if skill command exists (for execution)
   */
  hasSkillCommand(name: string): boolean {
    return this.skillCommands.has(name.toLowerCase());
  }

  /**
   * Search commands by prefix (for autocomplete)
   */
  searchCommands(prefix: string): SkillCommandRegistration[] {
    const lowerPrefix = prefix.toLowerCase();
    return this.getAllCommands().filter(cmd =>
      cmd.name.startsWith(lowerPrefix)
    );
  }

  /**
   * Fuzzy search skill commands using Fuse.js
   * Lazy initializes search index only when needed
   */
  searchSkillsFuzzy(query: string, limit?: number): import('./types.js').SkillCommand[] {
    // Lazy import to avoid circular dependency
    const { searchSkillsSorted, initFuseSearch } = require('./search.js');

    // Lazy initialization: only init once
    if (!this.searchIndexInitialized) {
      initFuseSearch(this.getAllSkillCommands());
      this.searchIndexInitialized = true;
    }

    return searchSkillsSorted(query, { limit });
  }

  /**
   * Fuzzy search with recent usage boost
   * Prioritizes recently/frequently used skills
   */
  searchSkillsWithRecent(query: string, limit?: number): import('./types.js').SkillCommand[] {
    // Lazy import to avoid circular dependency
    const { searchSkillsWithRecent: searchWithRecent, initFuseSearch } = require('./search.js');

    // Lazy initialization: only init once
    if (!this.searchIndexInitialized) {
      initFuseSearch(this.getAllSkillCommands());
      this.searchIndexInitialized = true;
    }

    return searchWithRecent(query, { limit });
  }

  /**
   * Initialize search index for fuzzy search (explicit)
   */
  initSearchIndex(): void {
    if (this.searchIndexInitialized) {
      return; // Already initialized
    }
    const { initFuseSearch } = require('./search.js');
    initFuseSearch(this.getAllSkillCommands());
    this.searchIndexInitialized = true;
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.commands.clear();
    this.skills.clear();
    this.skillCommands.clear();
    this.searchIndexInitialized = false; // P2: Reset search index
  }

  /**
   * Unregister a single skill by name. Removes from all three maps
   * (commands / skills / skillCommands) including any trigger aliases
   * that were registered for it.
   *
   * Returns true if a skill was removed, false if it wasn't registered.
   * (P1.5/P1.6 — added in unify-skills-and-plugins-registries)
   */
  unregister(name: string): boolean {
    const key = (name || '').toLowerCase();
    if (!key) return false;

    const skill = this.skills.get(key);
    if (!skill) {
      // Still try to clean up command/command entries (defensive)
      this.commands.delete(key);
      this.skillCommands.delete(key);
      return false;
    }

    // 1. Remove the primary name from all three maps
    this.commands.delete(key);
    this.skills.delete(key);
    this.skillCommands.delete(key);

    // 2. Remove any trigger aliases that were auto-registered for this skill
    const triggers = skill.triggers ?? [];
    for (const trigger of triggers) {
      const triggerKey = trigger.replace(/^\//, '').toLowerCase();
      if (triggerKey !== key) {
        // Only remove if the command/skillCommand entry points back to this skill
        const cmd = this.commands.get(triggerKey);
        if (cmd?.metadata?.name?.toLowerCase() === key) {
          this.commands.delete(triggerKey);
        }
        this.skillCommands.delete(triggerKey);
      }
    }

    // 3. Invalidate search index (fuzzy index is now stale)
    this.searchIndexInitialized = false;

    return true;
  }

  /**
   * Get command count (for autocomplete)
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * Get skill command count (for execution)
   */
  get skillCommandCount(): number {
    return this.skillCommands.size;
  }

  /**
   * Get skill count
   */
  get skillCount(): number {
    return this.skills.size;
  }
  /**
   * Find skills matching user input based on triggers, whenToUse, and description
   * Used for automatic skill activation when user doesn't use slash command
   * @param input - User's natural language input
   * @param limit - Maximum number of matches to return (default 5)
   * @returns Array of SkillMatch with score and skill metadata
   */
  getSkillsByTrigger(input: string, limit: number = 5): Array<{ score: number; skill: SlashSkillMetadata }> {
    const normalizedInput = input.toLowerCase();
    const userKeywords = this.extractKeywords(normalizedInput);
    const results: Array<{ score: number; skill: SlashSkillMetadata }> = [];

    for (const skill of this.getAllSkills()) {
      let score = 0;

      // 1. Exact command name match (highest priority)
      if (normalizedInput.includes(skill.name.toLowerCase())) {
        score += 100;
      }

      // 2. Check if skill description contains user keywords
      const skillDesc = (skill.description || '').toLowerCase();
      const skillWhenToUse = (skill.whenToUse || '').toLowerCase();
      
      for (const keyword of userKeywords) {
        // Higher score for whenToUse match
        if (skillWhenToUse.includes(keyword)) {
          score += 30;
        }
        // Lower score for description match
        if (skillDesc.includes(keyword)) {
          score += 15;
        }
      }

      // 3. Check triggers
      const triggers = skill.triggers || [];
      for (const trigger of triggers) {
        const normalizedTrigger = trigger.toLowerCase().replace(/^\//, '');
        if (normalizedInput.includes(normalizedTrigger)) {
          score += 50;
        }
      }

      if (score > 0) {
        results.push({ score, skill });
      }
    }

    // Sort by score descending and limit
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Extract keywords from user input
   */
  private extractKeywords(text: string): string[] {
    const keywords: string[] = [];
    // Match Chinese words (2-4 chars) - split by punctuation and spaces
    // This gives us individual meaningful words
    const chineseRegex = /[\u4e00-\u9fff]{2,4}/g;
    const chineseMatches = text.match(chineseRegex);
    if (chineseMatches) keywords.push(...chineseMatches);
    // Also extract longer phrases (up to 6 chars)
    const longChineseRegex = /[\u4e00-\u9fff]{5,6}/g;
    const longMatches = text.match(longChineseRegex);
    if (longMatches) {
      for (const match of longMatches) {
        // Split into smaller parts
        for (let i = 0; i < match.length - 1; i += 2) {
          keywords.push(match.slice(i, i + 2));
        }
      }
    }
    // Match English words (3+ chars)
    const englishRegex = /[a-zA-Z]{3,}/g;
    const englishMatches = text.match(englishRegex);
    if (englishMatches) keywords.push(...englishMatches.map(w => w.toLowerCase()));
    return keywords;
  }


  /**
   * Parse keywords from whenToUse field
   */

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
  skill?: SlashSkillMetadata;
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
  const frontmatterBlock = match[1] ?? '';

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
      currentKey = keyMatch[1] ?? '';
      currentValue = line.substring(keyMatch[0]?.length ?? 0).trim();
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

          const skill: SlashSkillMetadata = {
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
