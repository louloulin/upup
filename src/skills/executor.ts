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
} from './types.js';
import type { SubagentConfig, SubagentResult, SubagentRunner } from '../agent/subagent.js';

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
 * Uses the SubagentRunner to spawn a child agent with the skill's
 * instructions and configuration.
 */
export async function executeSkillFork(
  options: SkillExecutionOptions,
  subagentRunner: SubagentRunner,
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
 * 1. Skill's context setting (inline/fork)
 * 2. Options override
 * 3. Default behavior (inline)
 */
export async function executeSkill(
  options: SkillExecutionOptions,
  subagentRunner?: SubagentRunner,
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
        error: 'Fork mode requires SubagentRunner',
        duration: 0,
      };
    }
    return executeSkillFork(options, subagentRunner, progressCallback);
  }

  // Inline mode
  return executeSkillInline(options, progressCallback);
}

/**
 * Build skill execution prompt
 */
export function buildSkillPrompt(skill: Skill, args?: string): string {
  // Format the skill instructions with arguments
  let prompt = skill.instructions;

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
  }
): SubagentConfig {
  // Determine agent type from skill metadata
  const agentType = skill.agent as SubagentConfig['type'] || 'general';

  // Build tools list
  const tools = skill.allowedTools || options.allowedTools || ['*'];

  // Build system prompt
  const systemPrompt = buildSkillSystemPrompt(skill);

  return {
    type: agentType,
    name: skill.name,
    tools,
    maxTurns: 50,
    model: skill.model || 'inherit',
    systemPrompt,
    cwd: options.cwd || process.cwd(),
    ...options.agentConfig,
  } as SubagentConfig;
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
    skill.instructions,
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
 * - Skills with custom agent → fork
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
  if (skill.instructions.length > 2000) {
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
 * Convert BundledSkillDefinition to Skill
 *
 * For file-based skills, we keep the path.
 * For bundled skills, we use a virtual path.
 */
export function bundledSkillToSkill(bundled: BundledSkillDefinition): Skill {
  return {
    ...bundled,
    path: bundled.skillRoot || `bundled:${bundled.name}`,
    source: 'builtin',
  };
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