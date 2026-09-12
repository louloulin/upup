/**
 * Skill Executor - Dual mode execution (inline/fork)
 *
 * Implements both execution modes:
 * - inline: Execute in current agent context
 * - fork: Execute in isolated subagent context
 *
 * This enables complex skills to run in a separate agent while
 * simple skills run in the current agent context.
 */

import type {
  Skill,
  SkillContext,
  SkillExecutionOptions,
  SkillExecutionResult,
  BundledSkillDefinition,
  SkillCommand,
  ToolUseContext,
  SkillSource,
  HooksSettings,
} from './types.js';
import type { PiSubagentConfig, SubagentResult, PiSubagentService } from '../runtime/pi/subagent.js';
import { executeShellCommandsInPrompt, containsShellCommands } from './promptShellExecution.js';
import { hasPermissionsToUseTool, createSkillPermissionContext } from './permissions.js';
import { processToolResultBlock } from './toolResultStorage.js';

// ============================================================================
// Hook System (P1)
// ============================================================================

/**
 * Hook event types
 */
export type HookEvent = 'pre-execute' | 'post-execute' | 'pre-tool' | 'post-tool';

/**
 * Hook context passed to hook handlers
 */
export interface HookContext {
  skillName: string;
  skillPath?: string;
  args?: string;
  commandName?: string;
}

/**
 * Hook result
 */
export interface HookResult {
  /** Whether the hook executed successfully */
  success: boolean;
  /** Output from the hook */
  output?: string;
  /** Error message if hook failed */
  error?: string;
  /** Whether to skip the main execution */
  skip?: boolean;
}

/**
 * Registered hook handlers
 */
const hookHandlers: Map<string, (context: HookContext) => Promise<HookResult | void>> = new Map();

/**
 * Register a hook handler
 * @param event - The event to listen for
 * @param handler - The handler function
 */
export function registerHook(event: HookEvent, handler: (context: HookContext) => Promise<HookResult | void>): void {
  hookHandlers.set(event, handler);
}

/**
 * Unregister a hook handler
 * @param event - The event to unregister
 */
export function unregisterHook(event: HookEvent): void {
  hookHandlers.delete(event);
}

/**
 * Execute a hook if registered
 * @param event - The hook event
 * @param context - Hook context
 * @returns Hook result or undefined if no hook registered
 */
export async function executeHook(
  event: HookEvent,
  context: HookContext
): Promise<HookResult | undefined> {
  const handler = hookHandlers.get(event);
  if (!handler) {
    return undefined;
  }

  try {
    const result = await handler(context);
    if (result) {
      return result;
    }
    return undefined;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute hooks defined in skill metadata
 * @param hooks - Hook settings from skill
 * @param context - Hook context
 */
export async function executeSkillHooks(
  hooks: HooksSettings | undefined,
  context: HookContext
): Promise<{ preResult?: HookResult; postResult?: HookResult }> {
  const results: { preResult?: HookResult; postResult?: HookResult } = {};

  // Execute pre-execute hooks
  if (hooks?.preTool?.some(h => h.enabled !== false)) {
    const preHook = await executeHook('pre-execute', context);
    if (preHook) {
      results.preResult = preHook;
      if (preHook.skip) {
        return results;
      }
    }
  }

  // Execute post-execute hooks
  if (hooks?.postTool?.some(h => h.enabled !== false)) {
    const postHook = await executeHook('post-execute', context);
    if (postHook) {
      results.postResult = postHook;
    }
  }

  return results;
}

/**
 * Check if hooks are enabled for a skill
 */
export function hasHooks(hooks: HooksSettings | undefined): boolean {
  return !!(hooks?.preTool?.some(h => h.enabled !== false) ||
           hooks?.postTool?.some(h => h.enabled !== false));
}

/**
 * Skill execution modes
 */
export type ExecutionMode = 'inline' | 'fork';

/**
 * Skill execution progress callback
 */
export type ProgressCallback = (message: string) => void;

/**
 * Default execution options
 */
const DEFAULT_EXECUTION_OPTIONS: Partial<SkillExecutionOptions> = {
  mode: 'inline',
  cwd: process.cwd(),
};

/**
 * Execute a skill in inline mode (current agent context)
 *
 * For inline execution, we prepare the skill prompt and return it
 * for the agent to execute directly. The actual execution happens
 * in the agent's main loop.
 */
export async function executeSkillInline(
  options: SkillExecutionOptions,
  progressCallback?: ProgressCallback
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const { skill, args, cwd } = options;

  try {
    // Emit progress message if defined
    if (skill.progressMessage && progressCallback) {
      progressCallback(skill.progressMessage);
    }

    // Build skill execution prompt
    const prompt = buildSkillPrompt(skill, args);

    // In inline mode, we just prepare the output
    // The actual execution happens in the agent's main loop
    // Here we return the prompt as output for the agent to consume

    return {
      success: true,
      output: prompt,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute a skill in fork mode (subagent context)
 *
 * Uses the PiSubagentService to spawn a child Pi session with the skill's
 * instructions and configuration.
 */
export async function executeSkillFork(
  options: SkillExecutionOptions,
  subagentRunner: PiSubagentService,
  progressCallback?: ProgressCallback
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const { skill, args, cwd, agentConfig, allowedTools } = options;

  try {
    // Emit progress message if defined
    if (skill.progressMessage && progressCallback) {
      progressCallback(skill.progressMessage);
    }

    // Build subagent config from skill metadata
    const subagentConfig = buildSubagentConfig(skill, {
      cwd,
      agentConfig,
      allowedTools,
    });

    // Build the skill execution prompt
    const prompt = buildSkillPrompt(skill, args);

    // Execute in subagent
    const result = await subagentRunner.run(subagentConfig, prompt, {
      sessionId: `skill-${skill.name}-${Date.now()}`,
      cwd: cwd || process.cwd(),
      tools: [], // Will be populated by the subagent runner
    });

    // Convert SubagentResult to SkillExecutionResult
    return convertResult(result, startTime);
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Execute a skill with automatic mode selection
 *
 * Determines execution mode based on:
 * 1. Skill's context setting (inline/fork/swarm)
 * 2. Options override
 * 3. Default behavior (inline)
 */
export async function executeSkill(
  options: SkillExecutionOptions,
  subagentRunner?: PiSubagentService,
  progressCallback?: ProgressCallback
): Promise<SkillExecutionResult> {
  // Determine execution mode
  const mode = options.mode || options.skill.context || 'inline';

  // Fork mode requires SubagentRunner
  if (mode === 'fork') {
    if (!subagentRunner) {
      return {
        success: false,
        output: '',
        error: 'Fork mode requires SubagentRunner (PiSubagentService)',
        duration: 0,
      };
    }
    return executeSkillFork(options, subagentRunner, progressCallback);
  }

  // Swarm mode - multi-agent execution
  if (mode === 'swarm') {
    return executeSkillSwarm(options, subagentRunner, progressCallback);
  }

  // Inline mode
  return executeSkillInline(options, progressCallback);
}

/**
 * Execute a skill in swarm mode (multi-agent coordination)
 *
 * Spawns a coordinator and multiple teammate agents to work in parallel
 * on different aspects of the task. Results are aggregated at the end.
 */
export async function executeSkillSwarm(
  options: SkillExecutionOptions,
  subagentRunner?: PiSubagentService,
  progressCallback?: ProgressCallback
): Promise<SkillExecutionResult> {
  const startTime = Date.now();
  const { skill, args, cwd, agentConfig, allowedTools, teammateCount, teamName, planRequired, taskStrategy } = options;

  try {
    // Emit progress message if defined
    if (skill.progressMessage && progressCallback) {
      progressCallback(skill.progressMessage);
    }

    // Get teammate count from skill or options
    const numTeammates = skill.teammates || teammateCount || 2;

    // Get spawn mode
    const spawnMode = skill.spawnMode || options.spawnMode || 'auto';

    // Get task strategy
    const strategy = skill.taskStrategy || taskStrategy || 'parallel';

    // Build skill execution prompt with swarm instructions
    const prompt = buildSkillPromptWithSwarmContext(skill, args, {
      teamName: teamName || skill.teamName || `skill-${skill.name}`,
      numTeammates,
      planRequired: planRequired || skill.planRequired || false,
      strategy,
    });

    // For now, use fork mode as a fallback since full swarm implementation
    // would require the complete swarm infrastructure (tmux coordination,
    // teammate spawning, permission bridging, etc.)
    if (subagentRunner) {
      const subagentConfig = buildSubagentConfig(skill, {
        cwd,
        agentConfig,
        allowedTools,
      });
      subagentConfig.name = `${skill.name}-swarm-leader`;
      subagentConfig.type = 'specialized';

      const result = await subagentRunner.run(subagentConfig, prompt, {
        sessionId: `swarm-${skill.name}-${Date.now()}`,
        cwd: cwd || process.cwd(),
        tools: [],
      });

      return {
        success: result.success,
        output: result.output || '',
        error: result.error,
        duration: result.duration || Date.now() - startTime,
        tokens: result.tokens,
        toolCalls: result.toolCalls,
      };
    }

    // Fallback to inline mode with swarm instructions in prompt
    return {
      success: true,
      output: prompt,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      output: '',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Build skill execution prompt with swarm context
 */
function buildSkillPromptWithSwarmContext(
  skill: Skill,
  args?: string,
  swarmConfig?: {
    teamName?: string;
    numTeammates?: number;
    planRequired?: boolean;
    strategy?: 'parallel' | 'sequential' | 'hierarchical';
  }
): string {
  const lines: string[] = [
    `# ${skill.name} (Swarm Mode)`,
    ``,
    skill.description,
    ``,
    `## Swarm Configuration`,
    `- Team Name: ${swarmConfig?.teamName || 'default-team'}`,
    `- Teammates: ${swarmConfig?.numTeammates || 2}`,
    `- Strategy: ${swarmConfig?.strategy || 'parallel'}`,
    `- Plan Required: ${swarmConfig?.planRequired ? 'Yes' : 'No'}`,
    ``,
    `## Instructions`,
    ``,
    skill.instructions || '',
  ];

  // Add task arguments
  if (args && args.trim()) {
    lines.push('', `## Task Arguments`, '', args.trim());
  }

  // Add swarm-specific guidelines
  lines.push('', `## Swarm Execution Guidelines`);
  lines.push(`You are the team coordinator. Coordinate ${swarmConfig?.numTeammates || 2} teammate agents:`);
  lines.push(`1. Break down the task into subtasks`);
  lines.push(`2. Distribute subtasks to teammates`);
  lines.push(`3. Aggregate results from teammates`);
  lines.push(`4. Present unified final output`);

  return lines.join('\n');
}

/**
 * Build skill execution prompt
 */
export function buildSkillPrompt(skill: Skill, args?: string): string {
  // Format the skill instructions with arguments
  let prompt = skill.instructions || '';

  // Append arguments if provided
  if (args && args.trim()) {
    prompt += `\n\n## 任务参数\n\n${args.trim()}`;
  }

  return prompt;
}

/**
 * Build subagent config from skill metadata
 */
export function buildSubagentConfig(
  skill: Skill,
  options: {
    cwd?: string;
    agentConfig?: Record<string, unknown>;
    allowedTools?: string[];
    maxTokens?: number;
  }
): PiSubagentConfig {
  // Determine agent type from skill metadata
  const agentType = skill.agent as PiSubagentConfig['type'] || 'general';

  // Build tools list
  const tools = skill.allowedTools || options.allowedTools || ['*'];

  // Build system prompt
  const systemPrompt = buildSkillSystemPrompt(skill);

  // Get maxTokens from options (override) or skill metadata (token budget control)
  // Options take precedence for explicit override
  const maxTokens = options.maxTokens ?? skill.maxTokens;

  return {
    type: agentType,
    name: skill.name,
    tools,
    maxTurns: 50,
    maxTokens,
    model: skill.model || 'inherit',
    systemPrompt,
    cwd: options.cwd || process.cwd(),
    ...options.agentConfig,
  } as PiSubagentConfig;
}

/**
 * Build system prompt for skill execution in subagent
 */
function buildSkillSystemPrompt(skill: Skill): string {
  const lines = [
    `# ${skill.name}`,
    ``,
    skill.description,
    ``,
    `## Instructions`,
    ``,
    skill.instructions || '',
  ];

  // Add usage hints if available
  if (skill.whenToUse) {
    lines.push('', `## When to Use`);
    lines.push(skill.whenToUse);
  }

  // Add aliases if available
  if (skill.aliases && skill.aliases.length > 0) {
    lines.push('', `## Aliases`);
    lines.push(skill.aliases.join(', '));
  }

  return lines.join('\n');
}

/**
 * Convert SubagentResult to SkillExecutionResult
 */
function convertResult(result: SubagentResult, startTime: number): SkillExecutionResult {
  return {
    success: result.success,
    output: result.output || '',
    error: result.error,
    duration: result.duration || Date.now() - startTime,
    tokens: result.tokens,
    toolCalls: result.toolCalls,
  };
}

/**
 * Get execution mode for a skill
 *
 * Returns the appropriate execution mode based on skill metadata
 * and global settings.
 */
export function getExecutionMode(skill: Skill): SkillContext {
  // Skill metadata takes precedence
  if (skill.context) {
    return skill.context;
  }

  // Default to inline
  return 'inline';
}

/**
 * Check if a skill should use fork mode
 *
 * Heuristics for automatic mode selection:
 * - Complex skills (long instructions) → fork
 * - Skills with allowedTools restrictions → fork
 * - Skills with Pi agent → fork
 * - Simple data query skills → inline
 */
export function shouldUseForkMode(skill: Skill): boolean {
  // Explicit context setting
  if (skill.context === 'fork') {
    return true;
  }
  if (skill.context === 'inline') {
    return false;
  }

  // Custom agent type
  if (skill.agent) {
    return true;
  }

  // Tool restrictions (implies need for isolation)
  if (skill.allowedTools && skill.allowedTools.length > 0 && skill.allowedTools.length < 20) {
    return true;
  }

  // Long instructions (> 2000 chars) may benefit from fork mode
  if (skill.instructions && skill.instructions.length > 2000) {
    return true;
  }

  // Default to inline
  return false;
}

/**
 * Built-in skill registry (like loucode's registerBundledSkill)
 */
const bundledSkills: Map<string, BundledSkillDefinition> = new Map();

/**
 * Register a bundled skill programmatically
 *
 * This enables plugins and internal code to register skills
 * without SKILL.md files on disk.
 */
export function registerBundledSkill(definition: BundledSkillDefinition): void {
  bundledSkills.set(definition.name, definition);
}

/**
 * Get a bundled skill by name
 */
export function getBundledSkill(name: string): BundledSkillDefinition | undefined {
  return bundledSkills.get(name);
}

/**
 * Get all bundled skills
 */
export function getAllBundledSkills(): BundledSkillDefinition[] {
  return Array.from(bundledSkills.values());
}

/**
 * Check if a skill is registered as bundled
 */
export function isBundledSkill(name: string): boolean {
  return bundledSkills.has(name);
}

/**
 * Bundled skill with optional getPromptForCommand method.
 */
interface BundledSkillWithOptionalPrompt extends BundledSkillDefinition {
  getPromptForCommand?: (
    args: string,
    context?: unknown,
  ) => Promise<Array<{ type: 'text'; text: string }>>;
}

/**
 * Convert BundledSkillDefinition to Skill
 *
 * For file-based skills, we keep the path.
 * For bundled skills, we use a virtual path.
 * Preserves the getPromptForCommand method for dynamic prompt generation.
 */
export function bundledSkillToSkill(bundled: BundledSkillWithOptionalPrompt): Skill {
  const skill: Skill = {
    ...bundled,
    path: bundled.skillRoot || `bundled:${bundled.name}`,
    source: 'builtin',
  };

  // Preserve the getPromptForCommand method for dynamic prompts
  if (typeof bundled.getPromptForCommand === 'function') {
    (skill as any).getPromptForCommand = bundled.getPromptForCommand;
  }

  return skill;
}

/**
 * Skill tracker for discovered skills
 *
 * Tracks which skills have been discovered during the session.
 * Similar to loucode's discoveredSkillNames Set.
 */
export class SkillTracker {
  private discoveredSkillNames = new Set<string>();
  private executedSkillNames = new Set<string>();

  /**
   * Record a discovered skill
   */
  recordDiscovered(skillName: string): void {
    this.discoveredSkillNames.add(skillName);
  }

  /**
   * Record an executed skill
   */
  recordExecuted(skillName: string): void {
    this.executedSkillNames.add(skillName);
  }

  /**
   * Get all discovered skills
   */
  getDiscovered(): Set<string> {
    return new Set(this.discoveredSkillNames);
  }

  /**
   * Get all executed skills
   */
  getExecuted(): Set<string> {
    return new Set(this.executedSkillNames);
  }

  /**
   * Check if a skill was discovered
   */
  wasDiscovered(skillName: string): boolean {
    return this.discoveredSkillNames.has(skillName);
  }

  /**
   * Check if a skill was executed
   */
  wasExecuted(skillName: string): boolean {
    return this.executedSkillNames.has(skillName);
  }

  /**
   * Clear all tracked skills
   */
  clear(): void {
    this.discoveredSkillNames.clear();
    this.executedSkillNames.clear();
  }

  /**
   * Clear only executed skills (keep discovered)
   */
  clearExecuted(): void {
    this.executedSkillNames.clear();
  }
}

// Default global tracker instance
export const defaultSkillTracker = new SkillTracker();

// ============================================================================
// Session ID for ${CLAUDE_SESSION_ID} replacement
// ============================================================================

let sessionId: string | null = null;

/**
 * Get or generate session ID for skill execution.
 * Used for ${CLAUDE_SESSION_ID} variable replacement.
 */
export function getSessionId(): string {
  if (!sessionId) {
    sessionId = `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return sessionId;
}

/**
 * Set session ID (useful for testing).
 */
export function setSessionId(id: string): void {
  sessionId = id;
}

// ============================================================================
// Argument Substitution
// ============================================================================

/**
 * Parse argument names from argument hint string.
 * Supports formats like: <stock>, <stock> <args>, <arg1> <arg2>
 */
export function parseArgumentNames(argumentHint?: string): string[] {
  if (!argumentHint) return [];

  const matches = argumentHint.matchAll(/<(\w+)>/g);
  return Array.from(matches).map(m => m[1]);
}

/**
 * Substitute arguments in skill content.
 * Replaces {{args}} and {{argument}} placeholders with actual arguments.
 */
export function substituteArguments(
  content: string,
  args: string,
  allowArbitraryArgs: boolean = true,
  argumentNames: string[] = []
): string {
  let result = content;

  // Replace {{args}} with the full args string
  result = result.replace(/\{\{args\}\}/g, args);

  // Replace {{argument}} with the full args string (alias)
  result = result.replace(/\{\{argument\}\}/g, args);

  // Replace named arguments {{name}} with args
  for (const name of argumentNames) {
    const pattern = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
    // For named args, use the full args as the value
    result = result.replace(pattern, args);
  }

  return result;
}

// ============================================================================
// Skill Command Creation (Core Factory Function)
// ============================================================================

/**
 * Create a SkillCommand from a Skill.
 *
 * This is the core factory function that mirrors Loucode's createSkillCommand().
 * It creates a command with the getPromptForCommand() method.
 *
 * If the skill has its own getPromptForCommand method (like bundled skills),
 * that method is used directly for dynamic prompt generation.
 *
 * @param skill - The skill to convert to a command
 * @param source - The source of the skill
 * @returns SkillCommand with getPromptForCommand method
 */
export function createSkillCommand(
  skill: Skill,
  source?: SkillSource
): SkillCommand {
  const skillRoot = skill.path.replace(/\/SKILL\.md$/, '');
  const argumentNames = parseArgumentNames(skill.argumentHint);

  // Check if skill has its own getPromptForCommand method (for bundled skills)
  const hasCustomPromptMethod = typeof (skill as any).getPromptForCommand === 'function';

  return {
    type: 'prompt',
    name: skill.name,
    description: skill.description,
    contentLength: skill.instructions?.length ?? 0,
    progressMessage: skill.progressMessage || 'running',
    userInvocable: skill.userInvocable,
    argumentHint: skill.argumentHint,
    argNames: argumentNames.length > 0 ? argumentNames : undefined,
    allowedTools: skill.allowedTools,
    model: skill.model,
    context: skill.context,
    agent: skill.agent,
    effort: skill.effort as any,
    paths: skill.paths,
    hooks: skill.hooks,
    skillRoot,
    whenToUse: skill.whenToUse,
    source: source || skill.source,
    isHidden: skill.userInvocable === false,

    async getPromptForCommand(
      args: string,
      context?: ToolUseContext
    ): Promise<Array<{ type: 'text'; text: string }>> {
      // Use bundled skill's custom prompt method if available
      if (hasCustomPromptMethod) {
        return (skill as any).getPromptForCommand(args, context);
      }

      // Step 1: Build base content with Base directory prefix
      let finalContent = skillRoot
        ? `Base directory for this skill: ${skillRoot}\n\n${skill.instructions}`
        : skill.instructions;

      // Step 2: Substitute arguments ({{args}}, {{argument}}, {{name}})
      finalContent = substituteArguments(finalContent, args, true, argumentNames);

      // Step 3: Replace ${CLAUDE_SKILL_DIR} variable
      // Normalize backslashes on Windows
      const normalizedSkillDir = process.platform === 'win32'
        ? skillRoot.replace(/\\/g, '/')
        : skillRoot;
      finalContent = finalContent.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedSkillDir);

      // Step 4: Replace ${CLAUDE_SESSION_ID} variable
      finalContent = finalContent.replace(
        /\$\{CLAUDE_SESSION_ID\}/g,
        getSessionId()
      );

      // Step 4.1: Replace ${cwd} variable (P1 - added)
      finalContent = finalContent.replace(
        /\$\{cwd\}/g,
        process.cwd()
      );

      // Step 5: Execute shell commands (!`command` and ```! ... ```)
      // Only execute if shell commands are present in the content
      if (containsShellCommands(finalContent)) {
        // Create permission context for this skill
        const permissionContext = context ? { ...context } : {};
        
        // Add toolPermissionContext if available
        if (!permissionContext.getAppState) {
          permissionContext.getAppState = () => ({
            toolPermissionContext: {
              alwaysAllowRules: {
                command: skill.allowedTools || [],
              },
            },
          });
        }
        
        finalContent = await executeShellCommandsInPrompt(
          finalContent,
          permissionContext,
          `/${skill.name}`,
          skill.shell,
          skill.allowedTools
        );
      }

      return [{ type: 'text', text: finalContent }];
    }
  };
}

// ============================================================================
// Get Prompt For Command (Standalone Function)
// ============================================================================

/**
 * Get the prompt content for a skill execution.
 *
 * This is the standalone version of getPromptForCommand() that can be
 * used without creating a full SkillCommand object.
 *
 * @param skill - The skill to execute
 * @param args - Arguments to pass
 * @param context - Optional tool use context
 * @returns Promise resolving to content blocks
 */
export async function getPromptForCommand(
  skill: Skill,
  args: string,
  context?: ToolUseContext
): Promise<Array<{ type: 'text'; text: string }>> {
  // P1: Execute pre-execute hooks
  if (hasHooks(skill.hooks)) {
    const hookContext: HookContext = {
      skillName: skill.name,
      skillPath: skill.path,
      args,
    };
    const { preResult } = await executeSkillHooks(skill.hooks, hookContext);

    // If hook says to skip, return hook output
    if (preResult?.skip && preResult.output) {
      return [{ type: 'text', text: preResult.output }];
    }
  }

  const command = createSkillCommand(skill);
  const result = await command.getPromptForCommand(args, context);

  // P1: Execute post-execute hooks
  if (hasHooks(skill.hooks)) {
    const hookContext: HookContext = {
      skillName: skill.name,
      skillPath: skill.path,
      args,
    };
    await executeSkillHooks(skill.hooks, hookContext);
  }

  return result;
}

// ============================================================================
// CLI Integration Functions
// ============================================================================

export interface SkillCommandResult {
  type: 'query' | 'output' | 'error';
  text?: string;
  message?: string;
}

export interface SkillCommandMatch {
  name: string;
  description: string;
}

/**
 * Execute a skill command from CLI.
 *
 * Uses SkillCommandRegistry as single source of truth:
 * 1. Get SkillCommand via getSkillCommand() (contains getPromptForCommand)
 * 2. Call getPromptForCommand directly for execution
 * 3. Auto-execute shell commands in skill content based on arguments
 *
 * @param commandName - The command name (without /)
 * @param args - Arguments to pass
 * @param context - Execution context
 * @returns SkillCommandResult or null if not a skill command
 */
export async function executeSkillCommand(
  commandName: string,
  args: string,
  context: {
    cwd: string;
    env: Record<string, string>;
    sessionId?: string;
    model?: string;
  }
): Promise<SkillCommandResult | null> {
  try {
    // Import and initialize skills
    const { initializeSkills } = await import('./commands.js');
    const { getSkillCommandRegistry } = await import('./slash-command.js');
    const { recordUsage } = await import('./recent-usage.js');
    await initializeSkills();

    // Get SkillCommand directly from registry (P0 fix: use getSkillCommand, not getCommand)
    const registry = getSkillCommandRegistry();

    const skillCmd = registry.getSkillCommand(commandName);

    if (!skillCmd) {
      return null; // Not a skill command
    }

    // P3: Record usage asynchronously (don't block execution)
    recordUsage(skillCmd.name).catch(() => {});

    // Execute via getPromptForCommand (P0 fix: use SkillCommand directly)
    const content = await skillCmd.getPromptForCommand(args, {
      cwd: context.cwd,
    });

    let prompt = content.map(c => c.text).join('\n\n');

    // Auto-execute shell commands if args are provided
    if (args && args.trim()) {
      const executedResults = await autoExecuteSkillCommands(prompt, args, skillCmd);
      if (executedResults.length > 0) {
        prompt = `${prompt}\n\n## 执行结果\n\n${executedResults.join('\n\n')}`;
      }
    }

    // Return as a query for the agent to execute
    return { type: 'query', text: prompt };

  } catch (error) {
    return null;
  }
}

/**
 * Auto-execute shell commands in skill content based on arguments.
 * Dynamically analyzes skill content and executes matching commands.
 * No hardcoded keywords - uses context-aware matching.
 */
async function autoExecuteSkillCommands(
  skillContent: string,
  args: string,
  skillCmd: any
): Promise<string[]> {
  const results: string[] = [];
  const argsLower = args.toLowerCase();

  // Extract all bash code blocks with their context (comments above)
  const codeBlocks = extractCodeBlocksWithContext(skillContent);

  for (const { command, context } of codeBlocks) {
    // Skip comments, empty commands, and template variables
    if (!command || command.trim().startsWith('#') || command.includes('{')) {
      continue;
    }

    // Check if this block's context matches the args
    if (contextMatchesArgs(context, argsLower)) {
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        const { stdout, stderr } = await execAsync(command, {
          timeout: 30000,
          maxBuffer: 1024 * 1024
        });

        if (stdout) {
          results.push(`### 执行结果 (匹配: ${extractMatchReason(context, argsLower)})\n\`\`\`\n${stdout}\n\`\`\``);
        }
        if (stderr && !isWarning(stderr)) {
          results.push(`### 错误\n\`\`\`\n${stderr}\n\`\`\``);
        }
      } catch (error: any) {
        results.push(`### 执行错误\n\`\`\`\n${error.message}\n\`\`\``);
      }
    }
  }

  return results;
}

/**
 * Extract code blocks with their preceding context (comments/titles).
 */
function extractCodeBlocksWithContext(skillContent: string): Array<{ command: string; context: string }> {
  const blocks: Array<{ command: string; context: string }> = [];

  // Split by bash code blocks
  const parts = skillContent.split(/(```bash\n[\s\S]*?```)/g);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.startsWith('```bash')) {
      // Extract command
      const commandMatch = part.match(/```bash\n([\s\S]*?)```/);
      if (commandMatch && commandMatch[1]) {
        const command = commandMatch[1].trim();
        // Extract preceding context (previous 200 chars of non-code content)
        const preceding = i > 0 ? parts.slice(Math.max(0, i - 10), i).join(' ').slice(-200) : '';
        blocks.push({ command, context: preceding + '\n' + part });
      }
    }
  }

  return blocks;
}

/**
 * Check if the code block's context matches the user's arguments.
 * Uses fuzzy matching without hardcoded keywords.
 */
function contextMatchesArgs(context: string, args: string): boolean {
  const contextLower = context.toLowerCase();

  // Tokenize args into words
  const argWords = args.split(/\s+/).filter(w => w.length > 1);

  // Check each arg word against context
  let matchCount = 0;
  for (const word of argWords) {
    // Check direct substring match
    if (contextLower.includes(word)) {
      matchCount++;
      continue;
    }
    // Check if word appears in function/api names
    // e.g., "gdp" matches "macro_china_gdp", "cn_gdp"
    const normalized = word.replace(/[_\-\s]/g, '');
    if (contextLower.replace(/[_\-\s]/g, '').includes(normalized)) {
      matchCount++;
      continue;
    }
    // Check partial match for Chinese terms
    if (word.length >= 2 && containsChinese(word)) {
      if (contextLower.includes(word)) {
        matchCount++;
      }
    }
  }

  // Require at least one significant match
  return matchCount > 0;
}

/**
 * Check if string contains Chinese characters.
 */
function containsChinese(str: string): boolean {
  return /[一-鿿]/.test(str);
}

/**
 * Extract the matching reason for display.
 */
function extractMatchReason(context: string, args: string): string {
  const argWords = args.split(/\s+/).filter(w => w.length > 1);
  for (const word of argWords) {
    if (context.toLowerCase().includes(word.toLowerCase())) {
      return word;
    }
  }
  return 'context';
}

/**
 * Check if stderr is just warnings (not errors).
 */
function isWarning(stderr: string): boolean {
  const warnings = [
    'RequestsDependencyWarning',
    'DeprecationWarning',
    'FutureWarning',
    'UserWarning'
  ];
  return warnings.some(w => stderr.includes(w));
}

/**
 * Get skill commands matching the input text.
 *
 * @param input - The input text (e.g., "/swarm" or "/swa")
 * @returns Array of matching skill commands
 */
export async function getMatchingSkillCommands(
  input: string
): Promise<SkillCommandMatch[]> {
  try {
    // Initialize skills if not already done
    const { initializeSkills } = await import('./commands.js');
    const { getSkillCommandRegistry } = await import('./slash-command.js');
    await initializeSkills();

    const registry = getSkillCommandRegistry();
    const query = input.startsWith('/') ? input.slice(1).toLowerCase() : input.toLowerCase();

    if (!query) {
      // Return all skill commands
      return registry.getUserInvocableSkills().map((s: { name?: string; description?: string }) => ({
        name: s.name || '',
        description: s.description || '',
      }));
    }

    // Find matching skill commands
    const matches: SkillCommandMatch[] = [];
    const allCommands = registry.getAllCommands();

    for (const cmd of allCommands) {
      const name = cmd.name.toLowerCase();
      const desc = (cmd.description || '').toLowerCase();

      // Match by name prefix or description substring
      if (name.startsWith(query) || desc.includes(query)) {
        matches.push({
          name: cmd.name,
          description: cmd.description,
        });
      }
    }

    return matches;
  } catch (error) {
    console.error('Error getting matching skill commands:', error);
    return [];
  }
}
