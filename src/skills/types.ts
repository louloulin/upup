/**
 * Source of a skill definition.
 * - builtin: Shipped with Dexter (src/skills/builtin/)
 * - project: Project-level skills (.dexter/skills/)
 * - user: User-level skills (.claude/skills/)
 */
export type SkillSource = 'builtin' | 'user' | 'project';

/**
 * Model selection for skill execution.
 * - sonnet: Default model for complex analysis
 * - haiku: Lightweight model for simple data queries
 * - opus: Heavy model for deep analysis (not implemented)
 */
export type SkillModel = 'sonnet' | 'haiku' | 'opus' | 'default';

/**
 * Skill metadata - lightweight info loaded at startup for system prompt injection.
 * Only contains the name and description from YAML frontmatter.
 */
export interface SkillMetadata {
  /** Unique skill name (e.g., "dcf") */
  name: string;
  /** Description of when to use this skill */
  description: string;
  /** Absolute path to the SKILL.md file */
  path: string;
  /** Where this skill was discovered from */
  source: SkillSource;
  /** Preferred model for this skill (optional) */
  model?: SkillModel;
  /** Whether this skill can be invoked by user via /command */
  userInvocable?: boolean;
  /** Hint for argument format */
  argumentHint?: string;
  /** Skill dependencies — must be executed before this skill */
  dependsOn?: string[];
}

/**
 * Full skill definition with instructions loaded on-demand.
 * Extends metadata with the full SKILL.md body content.
 */
export interface Skill extends SkillMetadata {
  /** Full instructions from SKILL.md body (loaded when skill is invoked) */
  instructions: string;
}
