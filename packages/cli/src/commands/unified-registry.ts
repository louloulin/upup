/**
 * Unified Command Registry
 *
 * Single source of truth for all commands in UpUp.
 * Combines:
 * - CLI Commands (from @upup/commands)
 * - Skill Commands (from src/skills)
 * - Plugin Commands (future)
 *
 * Reference: loucode/src/commands.ts - loadAllCommands()
 */

import Fuse from 'fuse.js';
import { type SlashCommand, matchCommands, builtInCommandNames } from '@upup/commands';
import { getSkillCommandRegistry } from '@upup/skills/slash-command';

// ============================================================================
// Types
// ============================================================================

/**
 * Unified command entry for autocomplete
 */
export interface UnifiedCommand {
  /** Command name (without slash) */
  name: string;
  /** Display name */
  displayName: string;
  /** Short description */
  description: string;
  /** Category for grouping */
  category: string;
  /** Source: 'cli' | 'skill' | 'plugin' */
  source: 'cli' | 'skill' | 'plugin';
  /** Aliases */
  aliases?: string[];
  /** Usage count for sorting */
  usageCount: number;
}

/**
 * Command category
 */
export type CommandCategory =
  | 'core'
  | 'agent'
  | 'mcp'
  | 'permissions'
  | 'system'
  | 'git'
  | 'plan'
  | 'skill'
  | 'plugin'
  | 'workflow'
  | 'other';

// ============================================================================
// Category Inference
// ============================================================================

const CATEGORY_MAP: Record<string, CommandCategory> = {
  // Core
  help: 'core',
  status: 'core',
  cost: 'core',
  clear: 'core',
  compact: 'core',
  version: 'core',
  commands: 'core',

  // Agent
  agent: 'agent',
  agents: 'agent',
  fork: 'agent',
  tasks: 'agent',
  model: 'agent',

  // Permissions
  permissions: 'permissions',
  sandbox: 'permissions',
  approve: 'permissions',
  deny: 'permissions',
  resetPermissions: 'permissions',

  // Git
  git: 'git',
  branch: 'git',
  commit: 'git',
  diff: 'git',
  log: 'git',
  stash: 'git',
  remote: 'git',

  // Plan
  plan: 'plan',
  exitPlan: 'plan',
  addStep: 'plan',
  steps: 'plan',

  // MCP
  mcp: 'mcp',
  mcpAdd: 'mcp',

  // System
  config: 'system',
  theme: 'system',
  doctor: 'system',
  history: 'system',
  memory: 'system',
  rules: 'system',
  heartbeat: 'system',
  exit: 'system',
  resume: 'system',
  session: 'system',
  init: 'system',
  effort: 'system',
  feedback: 'system',
  usage: 'system',
  export: 'system',
  files: 'system',
  keybindings: 'system',
  review: 'system',
  skills: 'skill',
  extraUsage: 'system',
};

function inferCategory(name: string): CommandCategory {
  return CATEGORY_MAP[name] || 'other';
}

// ============================================================================
// Simple Usage Tracking (placeholder)
// ============================================================================

// Simple in-memory usage tracking
const usageCache = new Map<string, number>();

function getCommandUsage(name: string): number {
  return usageCache.get(name.toLowerCase()) || 0;
}

export function recordCommandUsage(name: string): void {
  const current = getCommandUsage(name);
  usageCache.set(name.toLowerCase(), current + 1);
}

// ============================================================================
// Unified Registry
// ============================================================================

class UnifiedCommandRegistry {
  private cliCommands: UnifiedCommand[] = [];
  private skillCommands: UnifiedCommand[] = [];
  private fuseIndex: Fuse<UnifiedCommand> | null = null;
  private lastBuildTime = 0;
  private readonly REBUILD_INTERVAL_MS = 5000;

  constructor() {
    this.buildIndex();
  }

  /**
   * Build the command index from all sources
   */
  buildIndex(): void {
    this.cliCommands = [];
    this.skillCommands = [];
    this.lastBuildTime = Date.now();

    // 1. Load CLI commands using matchCommands
    // Get all commands (empty string returns all)
    const allSlashCommands: SlashCommand[] = matchCommands('');

    for (const cmd of allSlashCommands) {
      // Skip hidden commands (if hidden property exists)
      if ((cmd as any).hidden) continue;

      this.cliCommands.push({
        name: cmd.name,
        displayName: cmd.name,
        description: cmd.description || '',
        category: cmd.category || inferCategory(cmd.name),
        source: 'cli',
        aliases: (cmd as any).aliases,
        usageCount: getCommandUsage(cmd.name),
      });
    }

    // 2. Load Skill commands from SkillCommandRegistry
    try {
      const registry = getSkillCommandRegistry();
      const skills = registry.getAllSkillCommands();

      for (const skill of skills) {
        // Skip if already covered by CLI command
        const lowerName = skill.name.toLowerCase();
        if (builtInCommandNames.has(lowerName)) continue;

        this.skillCommands.push({
          name: skill.name,
          displayName: skill.name,
          description: skill.description || '',
          category: 'skill',
          source: 'skill',
          usageCount: getCommandUsage(skill.name),
        });
      }
    } catch {
      // Skill registry not available
    }

    // 3. Build Fuse.js index
    const allCommands = [...this.cliCommands, ...this.skillCommands];
    this.fuseIndex = new Fuse(allCommands, {
      includeScore: true,
      threshold: 0.4,
      keys: [
        { name: 'name', weight: 3 },
        { name: 'displayName', weight: 2 },
        { name: 'aliases', weight: 2 },
        { name: 'description', weight: 0.5 },
      ],
    });
  }

  /**
   * Check if index needs rebuilding
   */
  private ensureIndex(): void {
    const now = Date.now();
    if (now - this.lastBuildTime > this.REBUILD_INTERVAL_MS) {
      this.buildIndex();
    }
  }

  /**
   * Get all commands
   */
  getAllCommands(): UnifiedCommand[] {
    this.ensureIndex();
    return [...this.cliCommands, ...this.skillCommands];
  }

  /**
   * Search commands by prefix (fast path)
   */
  searchByPrefix(query: string): UnifiedCommand[] {
    this.ensureIndex();
    const lowerQuery = query.toLowerCase();

    // First: exact alias match
    for (const cmd of this.cliCommands) {
      if (cmd.aliases?.includes(lowerQuery)) {
        return [cmd];
      }
    }

    // Second: exact name match
    for (const cmd of this.cliCommands) {
      if (cmd.name.toLowerCase() === lowerQuery) {
        return [cmd];
      }
    }

    // Third: prefix matches (sorted by usage)
    const matches = this.cliCommands.filter(cmd =>
      cmd.name.toLowerCase().startsWith(lowerQuery)
    );

    return matches.sort((a, b) => b.usageCount - a.usageCount);
  }

  /**
   * Fuzzy search commands
   */
  fuzzySearch(query: string, limit = 10): UnifiedCommand[] {
    this.ensureIndex();

    if (!query) {
      return this.cliCommands
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, limit);
    }

    if (!this.fuseIndex) {
      return [];
    }

    const results = this.fuseIndex.search(query, { limit });
    return results.map(r => r.item);
  }

  /**
   * Get suggestions for slash command input
   */
  getSuggestions(input: string, limit = 10): SlashCommand[] {
    const query = input.startsWith('/') ? input.slice(1) : input;

    if (!query) {
      return this.cliCommands
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, limit)
        .map(cmd => ({
          name: cmd.name,
          description: cmd.description,
          category: cmd.category as any,
        }));
    }

    // Use matchCommands for prefix matching (the existing fast algorithm)
    const prefixResults = matchCommands('/' + query).slice(0, limit);

    if (prefixResults.length >= limit) {
      return prefixResults.map(cmd => ({
        name: cmd.name,
        description: cmd.description,
        category: cmd.category as any,
      }));
    }

    // Fill with fuzzy results from skills
    const skillResults = this.skillCommands
      .filter(cmd => cmd.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit - prefixResults.length);

    // Combine results
    const seen = new Set(prefixResults.map(c => c.name.toLowerCase()));
    const combined: SlashCommand[] = [...prefixResults];

    for (const skill of skillResults) {
      if (combined.length >= limit) break;
      if (!seen.has(skill.name.toLowerCase())) {
        combined.push({
          name: skill.name,
          description: skill.description,
          category: skill.category as any,
        });
        seen.add(skill.name.toLowerCase());
      }
    }

    return combined;
  }

  /**
   * Find a command by name
   */
  findCommand(name: string): UnifiedCommand | undefined {
    const lowerName = name.toLowerCase();
    const cli = this.cliCommands.find(c => c.name.toLowerCase() === lowerName);
    if (cli) return cli;
    return this.skillCommands.find(c => c.name.toLowerCase() === lowerName);
  }

  /**
   * Get command count
   */
  get totalCount(): number {
    this.ensureIndex();
    return this.cliCommands.length + this.skillCommands.length;
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalRegistry: UnifiedCommandRegistry | null = null;

export function getUnifiedCommandRegistry(): UnifiedCommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new UnifiedCommandRegistry();
  }
  return globalRegistry;
}

export function resetUnifiedCommandRegistry(): void {
  globalRegistry = null;
}

// ============================================================================
// Backward Compatibility Exports
// ============================================================================

/**
 * Get CLI commands for autocomplete (backward compatible)
 * Uses unified registry internally
 */
export function getCliCommands(text: string): SlashCommand[] {
  const registry = getUnifiedCommandRegistry();
  return registry.getSuggestions(text);
}

/**
 * Get command count
 */
export function getCommandCount(): number {
  return getUnifiedCommandRegistry().totalCount;
}
