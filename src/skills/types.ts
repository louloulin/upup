/**
 * Source of a skill definition.
 * - builtin: Shipped with UpUp (src/skills/builtin/)
 * - project: Project-level skills (.upup/skills/)
 * - user: User-level skills (.claude/skills/)
 */
export type SkillSource = 'builtin' | 'user' | 'project' | 'plugin';

/**
 * Hook settings for skill execution.
 * Allows pre/post tool hooks and other lifecycle events.
 */
export interface HooksSettings {
  /** Hooks to run before tool execution */
  preTool?: Array<{
    name: string;
    enabled?: boolean;
  }>;
  /** Hooks to run after tool execution */
  postTool?: Array<{
    name: string;
    enabled?: boolean;
  }>;
}

/**
 * Effort value for skill workload estimation.
 * Can be a predefined level or a numeric value.
 */
export type EffortValue = 'minimal' | 'short' | 'medium' | 'long' | 'extended' | number;

/**
 * Model selection for skill execution.
 * - sonnet: Default model for complex analysis
 * - haiku: Lightweight model for simple data queries
 * - opus: Heavy model for deep analysis (not implemented)
 */
export type SkillModel = 'sonnet' | 'haiku' | 'opus' | 'default';

/**
 * Skill execution mode.
 * - inline: Execute in current agent context (default)
 * - fork: Execute in isolated subagent context
 */
export type SkillContext = 'inline' | 'fork';

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
  /** Skill execution mode: inline (default) or fork (subagent) */
  context?: SkillContext;
  /** Agent type to use for fork mode (e.g., 'general', 'specialized') */
  agent?: string;
  /** Tools allowed when executing this skill */
  allowedTools?: string[];
  /** Progress message shown during execution */
  progressMessage?: string;
  /** When to use this skill (usage hints) */
  whenToUse?: string;
  /** Aliases for skill invocation */
  aliases?: string[];
}

/**
 * Full skill definition with instructions loaded on-demand.
 * Extends metadata with the full SKILL.md body content.
 */
export interface Skill extends SkillMetadata {
  /** Full instructions from SKILL.md body (loaded when skill is invoked) */
  instructions: string;
  /** Conditional skill paths (activates when matching files are present) */
  paths?: string[];
  /** Hooks settings for pre/post tool execution */
  hooks?: HooksSettings;
  /** Workload estimation */
  effort?: EffortValue;
  /** Version of the skill */
  version?: string;
  /** Shell configuration for command execution */
  shell?: {
    /** Allowed commands */
    commands?: string[];
    /** Working directory */
    cwd?: string;
  };
}

/**
 * Result of skill execution.
 */
export interface SkillExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  /** Output from skill execution */
  output: string;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Tokens consumed */
  tokens?: number;
  /** Tool calls made during execution */
  toolCalls?: number;
}

/**
 * Options for skill execution.
 */
export interface SkillExecutionOptions {
  /** Skill to execute */
  skill: Skill;
  /** Arguments to pass to the skill */
  args?: string;
  /** Execution mode: inline or fork */
  mode?: SkillContext;
  /** Custom agent config for fork mode */
  agentConfig?: Record<string, unknown>;
  /** Allowed tools for this execution */
  allowedTools?: string[];
  /** Model to use (overrides skill default) */
  model?: SkillModel;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Working directory */
  cwd?: string;
}

/**
 * Bundled skill definition with additional properties.
 * Used for programmatic skill registration (like loucode's registerBundledSkill).
 */
export interface BundledSkillDefinition extends SkillMetadata {
  /** Full instructions */
  instructions: string;
  /** Execution mode */
  context?: SkillContext;
  /** Agent type for fork mode */
  agent?: string;
  /** Allowed tools */
  allowedTools?: string[];
  /** Progress message */
  progressMessage?: string;
  /** When to use this skill */
  whenToUse?: string;
  /** Files to extract to disk for this skill */
  files?: Record<string, string>;
  /** Skill root directory */
  skillRoot?: string;
}

/**
 * Bundled skill with prompt function.
 * Extends BundledSkillDefinition with the getPromptForCommand method.
 * This matches loucode's PromptCommand interface.
 */
export interface BundledSkillWithPrompt extends BundledSkillDefinition {
  /** Core execution method - generates the prompt content for this skill */
  getPromptForCommand(
    args: string,
    context?: unknown,
  ): Promise<Array<{ type: 'text'; text: string }>>;
}

/**
 * Skill Command - Unified command interface for skill execution.
 *
 * This is the core interface that aligns Upup with Loucode's Command system.
 * It provides the getPromptForCommand() method for skill execution.
 */
export interface SkillCommand {
  /** Command type - always 'prompt' for skills */
  type: 'prompt';
  /** Unique command name (e.g., "dcf") */
  name: string;
  /** Description of the command */
  description: string;
  /** Length of the skill content (for token estimation) */
  contentLength: number;
  /** Progress message shown during execution */
  progressMessage?: string;
  /** Whether this command can be invoked by user */
  userInvocable?: boolean;
  /** Argument hint for user input */
  argumentHint?: string;
  /** Named arguments for this command */
  argNames?: string[];
  /** Tools allowed when executing this skill */
  allowedTools?: string[];
  /** Preferred model for this skill */
  model?: SkillModel;
  /** Execution mode: inline or fork */
  context?: SkillContext;
  /** Agent type for fork mode */
  agent?: string;
  /** Workload estimation */
  effort?: EffortValue;
  /** Conditional skill paths */
  paths?: string[];
  /** Hooks settings */
  hooks?: HooksSettings;
  /** Skill root directory */
  skillRoot?: string;
  /** When to use this skill */
  whenToUse?: string;
  /** Version of the skill */
  version?: string;
  /** Whether this command is hidden from help */
  isHidden?: boolean;
  /** Source of the command */
  source?: SkillSource;
  /**
   * Core execution method - generates the prompt content for this skill.
   *
   * This is the key method that transforms a skill into an executable command.
   * It handles:
   * - Loading the full skill content
   * - Substituting arguments ({{args}}, {{argument}})
   * - Replacing ${CLAUDE_SKILL_DIR} variable
   * - Replacing ${CLAUDE_SESSION_ID} variable
   * - Executing shell commands (!`command`)
   *
   * @param args - Arguments passed to the skill
   * @param context - Tool use context for shell execution
   * @returns Promise resolving to content blocks for system prompt injection
   */
  getPromptForCommand(
    args: string,
    context?: unknown,
  ): Promise<Array<{ type: 'text'; text: string }>>;
}

/**
 * Tool use context for skill execution.
 * Used by getPromptForCommand() for shell command execution.
 */
export interface ToolUseContext {
  /** Get application state */
  getAppState?: () => {
    toolPermissionContext?: {
      alwaysAllowRules?: {
        command?: string[];
      };
    };
  };
  /** Working directory */
  cwd?: string;
}
