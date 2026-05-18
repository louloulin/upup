/**
 * Skills System Types
 *
 * Defines types for the skills/commands system.
 * Based on Claude Code's skill format.
 */

import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

/**
 * Skill frontmatter definition
 */
export interface SkillFrontmatter {
  /** Skill name (slug) */
  name: string
  /** Short description */
  description: string
  /** Longer explanation of when to use */
  whenToUse?: string
  /** Tools the skill is allowed to use */
  allowedTools?: string[]
  /** Hint for arguments */
  argumentHint?: string
  /** Model to use for this skill */
  model?: 'opus' | 'sonnet' | 'haiku' | string
  /** Execution context: inline or fork */
  context?: 'inline' | 'fork'
  /** Effort level */
  effort?: 'minimal' | 'short' | 'medium' | 'long' | 'extended'
  /** Path patterns that trigger this skill */
  paths?: string[]
  /** Whether this is a bundled skill */
  bundled?: boolean
  /** Whether this skill is hidden from list */
  hidden?: boolean
  /** Subagent type for fork context */
  subagentType?: string
  /** Permission level required */
  permission?: 'admin' | 'user' | 'readonly'
}

/**
 * Full skill definition including content
 */
export interface Skill {
  /** Unique skill identifier */
  id: string
  /** Skill name from frontmatter */
  name: string
  /** Description from frontmatter */
  description: string
  /** When to use from frontmatter */
  whenToUse?: string
  /** Allowed tools from frontmatter */
  allowedTools?: string[]
  /** Argument hint from frontmatter */
  argumentHint?: string
  /** Model from frontmatter */
  model?: string
  /** Context from frontmatter */
  context?: 'inline' | 'fork'
  /** Effort from frontmatter */
  effort?: string
  /** Path patterns from frontmatter */
  paths?: string[]
  /** Whether bundled */
  bundled: boolean
  /** Whether hidden */
  hidden: boolean
  /** Subagent type */
  subagentType?: string
  /** Permission level */
  permission?: string
  /** Raw content (markdown) */
  content: string
  /** File path (for user skills) */
  filePath?: string
  /** Last modified timestamp */
  lastModified?: number
}

/**
 * Skill execution context
 */
export interface SkillContext {
  /** Current working directory */
  cwd: string
  /** Environment variables */
  env: Record<string, string>
  /** Session ID */
  sessionId?: string
  /** Model to use */
  model?: string
  /** Arguments passed to the skill */
  args?: string
}

/**
 * Skill loading result
 */
export interface LoadSkillResult {
  /** Whether loading succeeded */
  success: boolean
  /** Loaded skills */
  skills: Skill[]
  /** Error message if failed */
  error?: string
}

/**
 * Skill match result
 */
export interface SkillMatch {
  /** The matched skill */
  skill: Skill
  /** Match score (higher is better) */
  score: number
  /** Match reason */
  reason: string
}

/**
 * Skill registry interface
 */
export interface ISkillRegistry {
  /** Load all skills from configured directories */
  loadAll(): Promise<void>
  /** Get a skill by name */
  get(name: string): Skill | undefined
  /** List all available skills */
  list(): Skill[]
  /** List visible skills (not hidden) */
  listVisible(): Skill[]
  /** Match skills by query */
  match(query: string): SkillMatch[]
  /** Match skills by file path */
  matchByPath(filePath: string): SkillMatch[]
  /** Reload skills from disk */
  reload(): Promise<void>
}

/**
 * Skills loader configuration
 */
export interface SkillsLoaderConfig {
  /** User-level skills directory */
  userSkillsDir?: string
  /** Project-level skills directory */
  projectSkillsDir?: string
  /** Bundled skills */
  bundledSkills?: Skill[]
  /** Include hidden skills */
  includeHidden?: boolean
  /** Path patterns to include */
  includePatterns?: string[]
  /** Path patterns to exclude */
  excludePatterns?: string[]
}

/**
 * Default skills directories
 */
export const DEFAULT_SKILLS_DIRS = {
  user: '.claude/skills',
  project: '.claude/skills',
  global: '~/.claude/skills',
}

/**
 * Default file extensions for skills
 */
export const SKILL_EXTENSIONS = ['.md', '.txt']

/**
 * Default file names for skills
 */
export const SKILL_FILENAMES = ['SKILL.md', 'skill.md', 'index.md']