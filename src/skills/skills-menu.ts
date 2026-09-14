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

import { SkillCommandRegistry, getSkillCommandRegistry, type SkillMetadata } from '@upup/skills';
import { t } from '../i18n/strings.js';
import { getLocale, getLocalizedDescription } from './i18n-helper.js';
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

// ============================================================================
// Skill Suggestions (Based on getSkillsByTrigger)
// ============================================================================

/**
 * Suggest skills based on user input using getSkillsByTrigger
 * @param input - User's natural language input
 * @param limit - Maximum number of suggestions (default 5)
 * @returns Array of suggested skills with scores
 */
export function suggestSkills(input: string, limit: number = 5): Array<{ name: string; description: string; score: number }> {
  // Lazy import to avoid circular dependency
  const registry = getSkillCommandRegistry();
  
  if (!registry) {
    return [];
  }
  
  const matches = registry.getSkillsByTrigger(input, limit);
  
  return matches.map(m => ({
    name: m.skill.name,
    // Localized description (P1.7 — surfaced from frontmatter `description.zh-CN`)
    description: getLocalizedDescription(m.skill) || m.skill.description || '',
    score: m.score,
  }));
}

/**
 * Format skill suggestions for display
 * @param suggestions - Array of skill suggestions
 * @returns Formatted string for terminal display
 */
export function formatSkillSuggestions(suggestions: Array<{ name: string; description: string; score: number }>): string {
  if (suggestions.length === 0) {
    return t('cmd.no_skill_suggestions');
  }
  
  const lines = ['\n' + t('cmd.suggestions_title') + ':'];
  
  suggestions.forEach((s, i) => {
    lines.push(`  ${i + 1}. ${s.name} (score: ${s.score})`);
    // Show first line of description (truncated)
    const descPreview = s.description.split('\n')[0].slice(0, 60);
    if (descPreview) {
      lines.push(`     ${descPreview}${descPreview.length >= 60 ? '...' : ''}`);
    }
  });
  
  lines.push('\n  ' + t('cmd.invoke_hint') + '.');
  
  return lines.join('\n');
}

// ============================================================================
// CLI Integration Helper
// ============================================================================

/**
 * Check if input should trigger skill suggestion display
 * @param input - User's input
 * @returns true if input is not a slash command and has length > 3
 */
export function shouldSuggestSkills(input: string): boolean {
  // Don't suggest for slash commands (they're explicit)
  if (input.startsWith('/')) {
    return false;
  }
  // Don't suggest for very short inputs
  if (input.trim().length < 4) {
    return false;
  }
  return true;
}

/**
 * Get skill suggestion for CLI display
 * Returns formatted suggestion string or empty string
 * @param input - User's input
 * @param minScore - Minimum score threshold (default 30)
 * @returns Formatted suggestion or empty string
 */
export function getCliSkillSuggestion(input: string, minScore: number = 30): string {
  if (!shouldSuggestSkills(input)) {
    return '';
  }
  
  const suggestions = suggestSkills(input, 3);
  
  // Only show if there's a high-confidence match
  const topMatch = suggestions[0];
  if (!topMatch || topMatch.score < minScore) {
    return '';
  }
  
  const desc = topMatch.description.split('\n')[0].slice(0, 30);
  return '\n' + t('cmd.suggestion_hint').replace('{name}', topMatch.name).replace('{desc}', desc + '...');
}

// ============================================================================
// /skills Command — Sorted by Recent Usage
// ============================================================================

/**
 * One row in the /skills table.
 */
export interface InstalledSkillRow {
  name: string;
  source: SkillSource;
  sourceLabel: string;
  description: string;        // EN
  descriptionLocalized: string; // zh-CN if available + locale matches
  useCount: number;
  score: number;
  path?: string;
}

/**
 * Build the /skills list synchronously, sorted by recent-usage score
 * (descending). Async because we need to read ~/.upup/recent-skills.json.
 *
 * Source: SkillCommandRegistry (the single source of truth, populated by
 * `initializeSkills()` at startup). Score: from `getAllRecentScores()`
 * (7-day half-life, see recent-usage.ts).
 */
export async function listInstalledSkills(opts: { limit?: number } = {}): Promise<string> {
  const limit = opts.limit ?? 50;

  // Lazy import to avoid a circular dep with ./commands.js
  const { getAllRecentScores, getAllRecentCounts } = await import('@upup/skills');

  // 1. Get the skill rows from the registry
  const menu = getSkillsMenu();
  const items = menu.getItems();
  if (items.length === 0) {
    return t('cmd.skills_list_empty');
  }

  // 2. Read recent-usage data (best-effort; missing file = empty)
  const [scoreMap, countMap] = await Promise.all([
    getAllRecentScores().catch(() => new Map<string, number>()),
    getAllRecentCounts().catch(() => new Map<string, number>()),
  ]);

  // 3. Build rows
  const rows: InstalledSkillRow[] = items.map((item) => {
    const key = item.name.toLowerCase();
    return {
      name: item.name,
      source: item.source,
      sourceLabel: SKILL_SOURCE_LABELS[item.source],
      description: item.description,
      descriptionLocalized: getLocalizedDescription({
        description: item.description,
        descriptionZhCn: undefined,
      }),
      useCount: countMap.get(key) ?? 0,
      score: scoreMap.get(key) ?? 0,
      path: item.path,
    };
  });

  // 4. Sort: score desc, then name asc (stable)
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  // 5. Render
  const locale = getLocale();
  const title = t('cmd.skills_list_title', locale).replace('{n}', String(rows.length));
  const colName = t('cmd.skills_list_col_name', locale);
  const colSrc = t('cmd.skills_list_col_source', locale);
  const colUses = t('cmd.skills_list_col_uses', locale);
  const colScore = t('cmd.skills_list_col_score', locale);
  const colDesc = t('cmd.skills_list_col_desc', locale);
  const dash = t('cmd.skills_list_never_used', locale);

  const lines: string[] = [];
  lines.push('');
  lines.push(title);
  lines.push('');
  // Header row
  lines.push(
    `  ${colName.padEnd(28)} ${colSrc.padEnd(10)} ${colUses.padStart(4)}  ${colScore.padStart(6)}  ${colDesc}`,
  );
  lines.push(`  ${'-'.repeat(28)} ${'-'.repeat(10)} ${'-'.repeat(4)}  ${'-'.repeat(6)}  ${'-'.repeat(20)}`);

  // Body — top N
  for (const row of rows.slice(0, limit)) {
    const descOneLine = (row.descriptionLocalized || row.description || dash)
      .split('\n')[0]
      .slice(0, 60);
    const scoreStr = row.score > 0 ? row.score.toFixed(1) : dash;
    const usesStr = row.useCount > 0 ? String(row.useCount) : dash;
    lines.push(
      `  ${row.name.padEnd(28)} ${row.sourceLabel.padEnd(10)} ${usesStr.padStart(4)}  ${scoreStr.padStart(6)}  ${descOneLine}`,
    );
  }

  if (rows.length > limit) {
    lines.push('');
    lines.push(`  ... and ${rows.length - limit} more (use /skills to see all)`);
  }

  lines.push('');
  lines.push(t('cmd.skills_list_footer', locale));

  return lines.join('\n');
}

/**
 * Test-friendly variant: returns the raw rows without rendering.
 */
export async function getInstalledSkillsData(): Promise<InstalledSkillRow[]> {
  const { getAllRecentScores, getAllRecentCounts } = await import('@upup/skills');
  const menu = getSkillsMenu();
  const items = menu.getItems();
  const [scoreMap, countMap] = await Promise.all([
    getAllRecentScores().catch(() => new Map<string, number>()),
    getAllRecentCounts().catch(() => new Map<string, number>()),
  ]);

  return items.map((item) => {
    const key = item.name.toLowerCase();
    return {
      name: item.name,
      source: item.source,
      sourceLabel: SKILL_SOURCE_LABELS[item.source],
      description: item.description,
      descriptionLocalized: getLocalizedDescription({
        description: item.description,
        descriptionZhCn: undefined,
      }),
      useCount: countMap.get(key) ?? 0,
      score: scoreMap.get(key) ?? 0,
      path: item.path,
    };
  });
}
