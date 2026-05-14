/**
 * Auto Skill Activation
 *
 * Implements conditional skill activation based on file paths:
 * - Skills with `paths` frontmatter activate when matching files are present
 * - Supports glob patterns (gitignore-style)
 * - Uses `ignore` library for pattern matching
 *
 * Reference: Claude Code's src/skills/loadSkillsDir.ts:activateConditionalSkillsForPaths
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Skill with conditional activation
 */
export interface ConditionalSkill {
  name: string;
  path: string;
  paths: string[];       // Patterns that trigger activation
  ignore?: string[];     // Patterns that prevent activation
  description?: string;
  triggers: string[];
  user_invocable: boolean;
  activated: boolean;
}

/**
 * Skill activation event
 */
export interface SkillActivationEvent {
  skill: string;
  action: 'activated' | 'deactivated';
  matchedFiles: string[];
  timestamp: number;
}

// ============================================================================
// Ignore Pattern Matching (simplified implementation)
// ============================================================================

/**
 * Simple glob pattern matcher
 * Supports: **, *, ?, [abc], [!abc]
 */
export class PatternMatcher {
  private patterns: string[];

  constructor(patterns: string[]) {
    this.patterns = patterns;
  }

  /**
   * Check if a path matches any pattern
   */
  matches(path: string): boolean {
    for (const pattern of this.patterns) {
      if (this.matchPattern(pattern, path)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Match a single pattern against a path
   */
  private matchPattern(pattern: string, path: string): boolean {
    // Normalize path separators
    const normalizedPath = path.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    // Handle ** (matches any number of directories)
    if (normalizedPattern.includes('**')) {
      return this.matchGlobPattern(normalizedPattern, normalizedPath);
    }

    // Simple glob matching
    return this.matchGlobPattern(normalizedPattern, normalizedPath);
  }

  /**
   * Match glob pattern
   */
  private matchGlobPattern(pattern: string, path: string): boolean {
    // Convert glob to regex
    const regexPattern = this.globToRegex(pattern);
    const regex = new RegExp(`^${regexPattern}$`);

    // Try matching against path and all parent directories
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i++) {
      const subPath = parts.slice(i).join('/');
      if (regex.test(subPath)) {
        return true;
      }
    }

    // Also try with leading **
    const anyDirPattern = pattern.replace(/^\*\*/, '.*');
    const anyDirRegex = new RegExp(`^${this.globToRegex(anyDirPattern)}$`);
    return anyDirRegex.test(path);
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): string {
    let regex = '';
    let i = 0;

    while (i < pattern.length) {
      const char = pattern[i];

      if (char === '*') {
        if (pattern[i + 1] === '*') {
          // ** matches everything including /
          regex += '.*';
          i += 2;
        } else {
          // * matches everything except /
          regex += '[^/]*';
          i++;
        }
      } else if (char === '?') {
        // ? matches any single character except /
        regex += '[^/]';
        i++;
      } else if (char === '[') {
        // [abc] or [!abc]
        const negated = pattern[i + 1] === '!';
        const end = pattern.indexOf(']', i);
        if (end !== -1) {
          const chars = pattern.slice(i + (negated ? 2 : 1), end);
          if (negated) {
            regex += `[^${chars}]`;
          } else {
            regex += `[${chars}]`;
          }
          i = end + 1;
        } else {
          regex += '\\[';
          i++;
        }
      } else if (char === '/') {
        regex += '\\/';
        i++;
      } else if ('.+^${}|()\\'.includes(char)) {
        // Escape special regex characters
        regex += '\\' + char;
        i++;
      } else {
        regex += char;
        i++;
      }
    }

    return regex;
  }
}

/**
 * Parse gitignore-style patterns
 */
export function parseIgnorePatterns(patterns: string[]): string[] {
  return patterns
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('#'));
}

// ============================================================================
// Auto Skill Activation Manager
// ============================================================================

/**
 * Event listeners for skill activation
 */
type ActivationListener = (event: SkillActivationEvent) => void;

/**
 * Auto Skill Activation Manager
 */
export class AutoSkillActivator {
  private conditionalSkills: Map<string, ConditionalSkill> = new Map();
  private activatedSkills: Set<string> = new Set();
  private listeners: Set<ActivationListener> = new Set();
  private filePatterns: Map<string, PatternMatcher> = new Map();
  private ignorePatterns: Map<string, PatternMatcher> = new Map();

  /**
   * Register a conditional skill
   */
  registerSkill(skill: ConditionalSkill): void {
    this.conditionalSkills.set(skill.name, skill);

    // Create pattern matchers
    if (skill.paths.length > 0) {
      this.filePatterns.set(skill.name, new PatternMatcher(skill.paths));
    }
    if (skill.ignore && skill.ignore.length > 0) {
      this.ignorePatterns.set(
        skill.name,
        new PatternMatcher(parseIgnorePatterns(skill.ignore))
      );
    }
  }

  /**
   * Register multiple skills
   */
  registerSkills(skills: ConditionalSkill[]): void {
    for (const skill of skills) {
      this.registerSkill(skill);
    }
  }

  /**
   * Check if a skill should be activated based on file paths
   */
  shouldActivate(skillName: string, cwd: string, existingFiles: string[]): boolean {
    const skill = this.conditionalSkills.get(skillName);
    if (!skill) return false;

    // Check if already manually deactivated
    if (!skill.activated) return false;

    // Get pattern matcher
    const matcher = this.filePatterns.get(skillName);
    if (!matcher) return false;

    // Check ignore patterns first
    const ignoreMatcher = this.ignorePatterns.get(skillName);
    if (ignoreMatcher) {
      for (const file of existingFiles) {
        if (ignoreMatcher.matches(file)) {
          return false;
        }
      }
    }

    // Check if any file matches
    for (const file of existingFiles) {
      if (matcher.matches(file)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Activate skills based on current file paths
   * Returns list of newly activated skills
   */
  activateForPaths(
    cwd: string,
    filePaths: string[]
  ): SkillActivationEvent[] {
    const events: SkillActivationEvent[] = [];

    for (const [skillName, skill] of this.conditionalSkills) {
      if (this.activatedSkills.has(skillName)) {
        continue; // Already activated
      }

      if (this.shouldActivate(skillName, cwd, filePaths)) {
        this.activatedSkills.add(skillName);
        const matchedFiles = this.getMatchedFiles(skillName, filePaths);

        const event: SkillActivationEvent = {
          skill: skillName,
          action: 'activated',
          matchedFiles,
          timestamp: Date.now(),
        };

        events.push(event);
        this.emit(event);
      }
    }

    return events;
  }

  /**
   * Get files that matched a skill's patterns
   */
  private getMatchedFiles(skillName: string, filePaths: string[]): string[] {
    const matcher = this.filePatterns.get(skillName);
    if (!matcher) return [];

    return filePaths.filter(file => matcher.matches(file));
  }

  /**
   * Check if skill is currently activated
   */
  isActivated(skillName: string): boolean {
    return this.activatedSkills.has(skillName);
  }

  /**
   * Manually activate a skill
   */
  activateSkill(skillName: string): boolean {
    const skill = this.conditionalSkills.get(skillName);
    if (!skill) return false;

    if (!this.activatedSkills.has(skillName)) {
      this.activatedSkills.add(skillName);

      const event: SkillActivationEvent = {
        skill: skillName,
        action: 'activated',
        matchedFiles: [],
        timestamp: Date.now(),
      };

      this.emit(event);
      return true;
    }

    return false;
  }

  /**
   * Manually deactivate a skill
   */
  deactivateSkill(skillName: string): boolean {
    if (this.activatedSkills.has(skillName)) {
      this.activatedSkills.delete(skillName);

      const event: SkillActivationEvent = {
        skill: skillName,
        action: 'deactivated',
        matchedFiles: [],
        timestamp: Date.now(),
      };

      this.emit(event);
      return true;
    }

    return false;
  }

  /**
   * Get all activated skills
   */
  getActivatedSkills(): string[] {
    return [...this.activatedSkills];
  }

  /**
   * Get all conditional skills
   */
  getConditionalSkills(): ConditionalSkill[] {
    return [...this.conditionalSkills.values()];
  }

  /**
   * Add event listener
   */
  onActivation(listener: ActivationListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Emit activation event
   */
  private emit(event: SkillActivationEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Skill activation listener error:', error);
      }
    }
  }

  /**
   * Clear all registrations
   */
  clear(): void {
    this.conditionalSkills.clear();
    this.activatedSkills.clear();
    this.filePatterns.clear();
    this.ignorePatterns.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConditionalSkills: number;
    activatedSkills: number;
    patternsRegistered: number;
  } {
    return {
      totalConditionalSkills: this.conditionalSkills.size,
      activatedSkills: this.activatedSkills.size,
      patternsRegistered: this.filePatterns.size,
    };
  }
}

// ============================================================================
// Global Instance
// ============================================================================

let globalActivator: AutoSkillActivator | null = null;

export function getAutoSkillActivator(): AutoSkillActivator {
  if (!globalActivator) {
    globalActivator = new AutoSkillActivator();
  }
  return globalActivator;
}

export function resetAutoSkillActivator(): void {
  if (globalActivator) {
    globalActivator.clear();
    globalActivator = null;
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Parse conditional skill from SKILL.md frontmatter
 */
export function parseConditionalSkill(
  name: string,
  frontmatter: Record<string, string>,
  path: string
): ConditionalSkill | null {
  const pathsField = frontmatter['paths'];
  if (!pathsField) {
    return null; // Not a conditional skill
  }

  // Parse paths array
  let paths: string[];
  if (pathsField.includes('[')) {
    // Array format: ["*.py", "**/*.js"]
    const match = pathsField.match(/\[([\s\S]*?)\]/);
    if (match && match[1]) {
      paths = match[1]
        .split(',')
        .map(p => p.trim().replace(/^['"]|['"]$/g, ''))
        .filter(p => p.length > 0);
    } else {
      paths = [];
    }
  } else if (pathsField.includes('\n')) {
    // YAML list format
    paths = pathsField
      .split('\n')
      .map(line => line.trim().replace(/^-\s*/, ''))
      .filter(line => line.length > 0 && !line.startsWith('#'));
  } else {
    // Single path
    paths = [pathsField.trim()];
  }

  if (paths.length === 0) {
    return null;
  }

  // Parse ignore patterns
  const ignoreField = frontmatter['ignore'];
  const ignore: string[] = [];
  if (ignoreField) {
    if (ignoreField.includes('[')) {
      const match = ignoreField.match(/\[([\s\S]*?)\]/);
      if (match && match[1]) {
        ignore.push(
          ...match[1]
            .split(',')
            .map(p => p.trim().replace(/^['"]|['"]$/g, ''))
            .filter(p => p.length > 0)
        );
      }
    } else {
      ignore.push(ignoreField.trim());
    }
  }

  // Parse triggers
  const triggers: string[] = [];
  const triggerField = frontmatter['triggers'] || frontmatter['trigger'];
  if (triggerField) {
    if (triggerField.includes('[')) {
      const match = triggerField.match(/\[([\s\S]*?)\]/);
      if (match && match[1]) {
        triggers.push(
          ...match[1]
            .split(',')
            .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
            .filter(t => t.length > 0)
        );
      }
    } else {
      triggers.push(triggerField.trim());
    }
  }

  return {
    name,
    path,
    paths,
    ignore,
    description: frontmatter['description'],
    triggers,
    user_invocable: frontmatter['user-invocable'] === 'true',
    activated: true, // Default to activated
  };
}
