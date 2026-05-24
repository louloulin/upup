/**
 * Skills Menu UI
 *
 * Implements terminal-based skills menu for Dexter:
 * - Display skills grouped by source
 * - Search/filter skills
 * - Execute skills by number or name
 * - Show skill metadata (description, triggers)
 *
 * Reference: Claude Code's src/components/skills/SkillsMenu.tsx
 */

import { SkillCommandRegistry, getSkillCommandRegistry, type SkillMetadata } from './slash-command.js';
import { getAllSkillCommands } from './commands.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Skill source categories
 */
export type SkillSource =
  | 'policySettings'  // ~/.claude/skills/
  | 'userSettings'    // ~/.claude/skills/
  | 'projectSettings' // .claude/skills/
  | 'localSettings'  // Local/project skills
  | 'flagSettings'    // CLI flag enabled
  | 'plugin'          // Plugin-provided skills
  | 'mcp';            // MCP server skills

/**
 * Skill display item
 */
export interface SkillMenuItem {
  id: string;
  name: string;
  description: string;
  source: SkillSource;
  triggers: string[];
  user_invocable: boolean;
  path?: string;
  pluginName?: string;
  mcpServer?: string;
}

/**
 * Skills menu options
 */
export interface SkillsMenuOptions {
  /** Filter by source */
  source?: SkillSource;
  /** Filter by search term */
  search?: string;
  /** Show only user-invocable skills */
  userInvocableOnly?: boolean;
  /** Max items to show (0 = no limit) */
  limit?: number;
}

// ============================================================================
// Constants
// ============================================================================

const SKILL_SOURCE_LABELS: Record<SkillSource, string> = {
  policySettings: '🔒 Policy',
  userSettings: '👤 User',
  projectSettings: '📁 Project',
  localSettings: '💻 Local',
  flagSettings: '⚑ Flag',
  plugin: '🔌 Plugin',
  mcp: '🌐 MCP',
};

// ============================================================================
// Skills Menu
// ============================================================================

/**
 * Skills Menu - Terminal-based skills browser
 */
export class SkillsMenu {
  private registry: SkillCommandRegistry;
  private items: SkillMenuItem[] = [];
  private filteredItems: SkillMenuItem[] = [];

  constructor(registry?: SkillCommandRegistry) {
    this.registry = registry ?? getSkillCommandRegistry();
    this.loadSkills();
  }

  /**
   * Load all skills from registry
   */
  private loadSkills(): void {
    this.items = [];
    // Use getAllSkillCommands() for consistency with commands.ts
    const commands = getAllSkillCommands();

    for (const cmd of commands) {
      const item: SkillMenuItem = {
        id: cmd.name,
        name: cmd.name,
        description: cmd.description ?? 'No description',
        source: this.detectSourceFromCommand(cmd),
        triggers: cmd.argumentHint ? [cmd.argumentHint] : [],
        user_invocable: cmd.userInvocable ?? true,
        path: cmd.skillRoot,
      };

      this.items.push(item);
    }

    // Sort by name
    this.items.sort((a, b) => a.name.localeCompare(b.name));
    this.filteredItems = [...this.items];
  }

  /**
   * Detect skill source from SkillCommand
   */
  private detectSourceFromCommand(cmd: { source?: string }): SkillSource {
    if (cmd.source === 'builtin') {
      return 'policySettings';
    }
    if (cmd.source === 'user') {
      return 'userSettings';
    }
    if (cmd.source === 'project') {
      return 'projectSettings';
    }
    if (cmd.source === 'plugin') {
      return 'plugin';
    }
    return 'userSettings';
  }

  /**
   * Detect skill source from metadata
   */
  private detectSource(skill: SkillMetadata): SkillSource {
    if (skill.path.includes('.claude/skills/')) {
      return 'userSettings';
    }
    if (skill.path.includes('src/skills') || skill.path.includes('.upup/skills')) {
      return 'localSettings';
    }
    if (skill.path.includes('plugin')) {
      return 'plugin';
    }
    if (skill.path.includes('mcp')) {
      return 'mcp';
    }
    return 'userSettings';
  }

  /**
   * Get skills grouped by source
   */
  getGroupedSkills(): Map<SkillSource, SkillMenuItem[]> {
    const grouped = new Map<SkillSource, SkillMenuItem[]>();

    for (const item of this.filteredItems) {
      if (!grouped.has(item.source)) {
        grouped.set(item.source, []);
      }
      grouped.get(item.source)!.push(item);
    }

    return grouped;
  }

  /**
   * Filter skills by options
   */
  filter(options: SkillsMenuOptions): void {
    this.filteredItems = this.items.filter(item => {
      // Source filter
      if (options.source && item.source !== options.source) {
        return false;
      }

      // User invocable filter
      if (options.userInvocableOnly && !item.user_invocable) {
        return false;
      }

      // Search filter
      if (options.search) {
        const search = options.search.toLowerCase();
        const matchesName = (item.name || "").toLowerCase().includes(search);
        const matchesDesc = item.description.toLowerCase().includes(search);
        const matchesTrigger = item.triggers.some(t =>
          t.toLowerCase().includes(search)
        );
        if (!matchesName && !matchesDesc && !matchesTrigger) {
          return false;
        }
      }

      return true;
    });

    // Apply limit
    if (options.limit && options.limit > 0) {
      this.filteredItems = this.filteredItems.slice(0, options.limit);
    }
  }

  /**
   * Get all filtered items
   */
  getItems(): SkillMenuItem[] {
    return this.filteredItems;
  }

  /**
   * Get skill by name or index
   */
  getSkill(identifier: string | number): SkillMenuItem | null {
    if (typeof identifier === 'number') {
      return this.filteredItems[identifier] ?? null;
    }

    // Try exact match first
    let item = this.filteredItems.find(
      i => (i.name || '').toLowerCase() === (identifier || '').toLowerCase()
    );
    if (item) return item;

    // Try partial match
    item = this.filteredItems.find(
      i => (i.name || "").toLowerCase().includes((identifier || "").toLowerCase())
    );
    return item ?? null;
  }

  /**
   * Get total count
   */
  getTotalCount(): number {
    return this.items.length;
  }

  /**
   * Get filtered count
   */
  getFilteredCount(): number {
    return this.filteredItems.length;
  }

  /**
   * Reload skills from registry
   */
  reload(): void {
    this.loadSkills();
  }
}

// ============================================================================
// Terminal UI Rendering
// ============================================================================

/**
 * Render skills menu as terminal output
 */
export function renderSkillsMenu(menu: SkillsMenu, options?: SkillsMenuOptions): string {
  const grouped = menu.getGroupedSkills();
  const lines: string[] = [];

  lines.push('');
  lines.push('╔════════════════════════════════════════════════════════════════════════╗');
  lines.push('║                           Skills Menu                               ║');
  lines.push('╠════════════════════════════════════════════════════════════════════════╣');
  lines.push(`║  Total: ${menu.getTotalCount()} skills | Filtered: ${menu.getFilteredCount()}                      ║`);
  lines.push('╚════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  let index = 0;
  const sourceOrder: SkillSource[] = [
    'userSettings',
    'projectSettings',
    'localSettings',
    'plugin',
    'mcp',
    'flagSettings',
    'policySettings',
  ];

  for (const source of sourceOrder) {
    const items = grouped.get(source);
    if (!items || items.length === 0) continue;

    lines.push(`  ${SKILL_SOURCE_LABELS[source]}:`);
    lines.push('  ─────────────────────────────────────────────────────────');

    for (const item of items) {
      const num = (index + 1).toString().padStart(2, ' ');
      const name = (item.name || '').padEnd(25, ' ');
      const desc = item.description.length > 35
        ? item.description.slice(0, 32) + '...'
        : item.description;

      lines.push(`    [${num}] ${name} ${desc}`);
      index++;
    }
    lines.push('');
  }

  lines.push('  Usage: /skill-name [args]  or  select number');
  lines.push('  Filter: --search <term>  --source <source>');
  lines.push('');

  return lines.join('\n');
}

/**
 * Render single skill details
 */
export function renderSkillDetail(item: SkillMenuItem): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('╔════════════════════════════════════════════════════════════════════════╗');
  lines.push(`║  Skill: ${(item.name || "").padEnd(60)}║`);
  lines.push('╠════════════════════════════════════════════════════════════════════════╣');
  lines.push(`║ Source: ${SKILL_SOURCE_LABELS[item.source].padEnd(60)}║`);
  lines.push('╠════════════════════════════════════════════════════════════════════════╣');

  // Description
  const descLines = wrapText(item.description, 62);
  for (const line of descLines) {
    lines.push(`║ ${line.padEnd(62)}║`);
  }

  lines.push('╠════════════════════════════════════════════════════════════════════════╣');

  // Triggers
  if (item.triggers.length > 0) {
    lines.push(`║ Triggers: ${item.triggers.join(', ').padEnd(52)}║`);
  }

  // Path
  if (item.path) {
    const path = item.path.length > 62
      ? '...' + item.path.slice(-59)
      : item.path;
    lines.push(`║ Path: ${path.padEnd(60)}║`);
  }

  lines.push('╚════════════════════════════════════════════════════════════════════════╝');
  lines.push('');

  return lines.join('\n');
}

/**
 * Wrap text to fit terminal width
 */
function wrapText(text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) lines.push(currentLine);
  return lines;
}

// ============================================================================
// Global Skills Menu Instance
// ============================================================================

let globalMenu: SkillsMenu | null = null;

export function getSkillsMenu(): SkillsMenu {
  if (!globalMenu) {
    globalMenu = new SkillsMenu();
  }
  return globalMenu;
}

export function resetSkillsMenu(): void {
  if (globalMenu) {
    globalMenu.reload();
  }
}

// ============================================================================
// CLI Integration
// ============================================================================

/**
 * List all skills with formatting
 */
export function listSkills(options?: SkillsMenuOptions): string {
  const menu = getSkillsMenu();
  if (options) {
    menu.filter(options);
  }
  return renderSkillsMenu(menu, options);
}

/**
 * Show skill details
 */
export function showSkill(name: string): string {
  const menu = getSkillsMenu();
  const skill = menu.getSkill(name);

  if (!skill) {
    return `\n❌ Skill not found: ${name}\n`;
  }

  return renderSkillDetail(skill);
}

/**
 * Search skills by term
 */
export function searchSkills(term: string): string {
  const menu = getSkillsMenu();
  menu.filter({ search: term });

  if (menu.getFilteredCount() === 0) {
    return `\n❌ No skills found matching: ${term}\n`;
  }

  return renderSkillsMenu(menu);
}
