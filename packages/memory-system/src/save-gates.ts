/**
 * Memory Save Gates - Claude Code-style memory save control
 *
 * Features:
 * - Explicit save gates (when to prompt for save)
 * - Save exclusions (what NOT to save)
 * - Memory modes (disabled/assistant-daily-log/team/auto)
 * - Save condition evaluation
 *
 * Reference: Loucode's memdir.ts and memoryTypes.ts
 */

import { info, warn } from '@upup/utils/logging';

// ============================================================================
// Constants
// ============================================================================

/**
 * Loucode's MEMORY.md limits
 */
export const MAX_ENTRYPOINT_LINES = 200;
export const MAX_ENTRYPOINT_BYTES = 25_000;

/**
 * Save trigger types
 */
export type SaveTrigger = 'explicit' | 'turn_end' | 'session_end' | 'milestone' | 'auto';

/**
 * Save condition types
 */
export type SaveConditionType = 'user_feedback' | 'correction' | 'success' | 'pattern' | 'observation';

/**
 * Memory modes (from Loucode)
 */
export type MemoryMode = 'disabled' | 'assistant-daily-log' | 'team' | 'auto';

/**
 * Save condition for triggering memory save
 */
export interface SaveCondition {
  type: SaveConditionType;
  /** Regex pattern for text matching */
  pattern?: RegExp;
  /** Minimum confidence score */
  minConfidence?: number;
}

/**
 * Save gate configuration
 */
export interface SaveGateConfig {
  /** When to trigger save */
  trigger: SaveTrigger;
  /** Minimum observations before save */
  minObservations?: number;
  /** Conditions that trigger save */
  conditions?: SaveCondition[];
  /** Memory mode */
  mode: MemoryMode;
  /** Enable explicit save prompts */
  explicitPrompts: boolean;
}

// ============================================================================
// Save Exclusions (from Loucode memoryTypes.ts)
// ============================================================================

/**
 * Things that should NOT be saved as memories
 * These exclusions apply even when user asks to save
 */
export const SAVE_EXCLUSIONS = [
  // Code patterns, conventions, architecture
  'convention',
  'pattern',
  'coding style',
  'format',
  'indentation',

  // Git history
  'git history',
  'git log',
  'git blame',

  // Debugging solutions (fix is in code)
  'debug',
  'fix',
  'workaround',

  // CLAUDE.md content
  'already in CLAUDE.md',
  'in the instructions',

  // Ephemeral task details
  'temporary',
  'ephemeral',
  'once',
] as const;

/**
 * Patterns that indicate things to NOT save
 */
export const EXCLUSION_PATTERNS: RegExp[] = [
  // Code block patterns
  /```[\s\S]*?```/,
  // File paths that indicate code
  /\/\*[\s\S]*?\*\//,
  // Function definitions
  /^(export\s+)?(function|const|let|var|class|interface|type)\s+\w+/m,
  // Import statements
  /^import\s+.*from\s+['"`]/m,
  // Git commands and output
  /^git\s+(log|blame|diff|status)/m,
];

/**
 * Check if content should be excluded from saving
 */
export function shouldExclude(content: string): { exclude: boolean; reason?: string } {
  const lowerContent = content.toLowerCase();

  // Check exclusion keywords
  for (const exclusion of SAVE_EXCLUSIONS) {
    if (lowerContent.includes(exclusion.toLowerCase())) {
      return { exclude: true, reason: `Contains excluded keyword: ${exclusion}` };
    }
  }

  // Check patterns
  for (const pattern of EXCLUSION_PATTERNS) {
    if (pattern.test(content)) {
      return { exclude: true, reason: 'Matches exclusion pattern' };
    }
  }

  // Check for excessive code content
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount > 3) {
    return { exclude: true, reason: 'Contains excessive code blocks' };
  }

  return { exclude: false };
}

// ============================================================================
// Save Gate Evaluation
// ============================================================================

/**
 * Observation from tool execution
 */
export interface ToolObservation {
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
}

/**
 * Evaluate if conditions match observations
 */
export function evaluateConditions(
  conditions: SaveCondition[],
  observations: ToolObservation[]
): SaveCondition[] {
  const matching: SaveCondition[] = [];

  for (const condition of conditions) {
    switch (condition.type) {
      case 'user_feedback':
        // Check if any observation indicates user feedback
        if (observations.some(o => o.toolName === 'human' && o.result.includes('feedback'))) {
          matching.push(condition);
        }
        break;

      case 'correction':
        // Check for correction patterns
        if (observations.some(o =>
          o.result.includes('correction') ||
          o.result.includes('wrong') ||
          o.result.includes('incorrect')
        )) {
          matching.push(condition);
        }
        break;

      case 'success':
        // Check for successful completion
        if (observations.every(o => o.success)) {
          matching.push(condition);
        }
        break;

      case 'pattern':
        // Check custom pattern
        if (condition.pattern) {
          const allContent = observations.map(o => o.result).join(' ');
          if (condition.pattern.test(allContent)) {
            matching.push(condition);
          }
        }
        break;

      case 'observation':
        // Always match (for testing)
        matching.push(condition);
        break;
    }
  }

  return matching;
}

/**
 * Default save gate configuration
 */
export const DEFAULT_SAVE_GATE_CONFIG: SaveGateConfig = {
  trigger: 'auto',
  minObservations: 5,
  conditions: [
    { type: 'user_feedback' },
    { type: 'correction' },
    { type: 'success' },
  ],
  mode: 'auto',
  explicitPrompts: true,
};

/**
 * Check if save gate should trigger
 *
 * Returns:
 * - 'prompt': Show explicit save prompt to user
 * - 'auto_save': Automatically save (low risk)
 * - 'skip': Don't save
 */
export function checkSaveGate(
  observations: ToolObservation[],
  config: SaveGateConfig = DEFAULT_SAVE_GATE_CONFIG
): 'prompt' | 'auto_save' | 'skip' {
  // Check mode
  if (config.mode === 'disabled') {
    return 'skip';
  }

  // Check minimum observations
  if (config.minObservations && observations.length < config.minObservations) {
    return 'skip';
  }

  // Evaluate conditions
  const matchingConditions = evaluateConditions(config.conditions || [], observations);

  if (matchingConditions.length === 0) {
    return 'skip';
  }

  // Check if explicit prompt is needed
  const needsExplicit = matchingConditions.some(c =>
    c.type === 'user_feedback' || c.type === 'correction'
  );

  if (needsExplicit && config.explicitPrompts) {
    info('memory', 'Save gate: triggering explicit prompt');
    return 'prompt';
  }

  // Auto-save for low-risk conditions
  info('memory', 'Save gate: auto-saving');
  return 'auto_save';
}

// ============================================================================
// MEMORY.md Management (from Loucode)
// ============================================================================

/**
 * Check if MEMORY.md exceeds line limit
 */
export function checkMemoryIndexSize(
  lineCount: number,
  byteCount: number
): { exceeds: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (lineCount > MAX_ENTRYPOINT_LINES) {
    warnings.push(
      `MEMORY.md exceeds ${MAX_ENTRYPOINT_LINES} lines (current: ${lineCount})`
    );
  }

  if (byteCount > MAX_ENTRYPOINT_BYTES) {
    warnings.push(
      `MEMORY.md exceeds ${MAX_ENTRYPOINT_BYTES} bytes (current: ${byteCount})`
    );
  }

  return {
    exceeds: warnings.length > 0,
    warnings,
  };
}

/**
 * Truncate MEMORY.md if it exceeds limits
 */
export function truncateMemoryIndex(
  content: string,
  maxLines = MAX_ENTRYPOINT_LINES,
  maxBytes = MAX_ENTRYPOINT_BYTES
): string {
  const lines = content.split('\n');

  // Truncate by lines
  if (lines.length > maxLines) {
    warn('memory', `MEMORY.md truncated to ${maxLines} lines`);
    return lines.slice(0, maxLines).join('\n') + '\n[Truncated - too many entries]';
  }

  // Truncate by bytes
  if (content.length > maxBytes) {
    warn('memory', `MEMORY.md truncated to ${maxBytes} bytes`);
    return content.slice(0, maxBytes) + '\n[Truncated - too large]';
  }

  return content;
}

// ============================================================================
// Explicit Save Prompt
// ============================================================================

/**
 * Generate save prompt for user
 */
export function buildSavePrompt(
  observations: ToolObservation[],
  suggestedMemories: string[]
): string {
  const recentObservations = observations.slice(-10);
  const observationSummary = recentObservations
    .map(o => `- ${o.toolName}: ${o.result.slice(0, 100)}...`)
    .join('\n');

  return `Based on recent work, I found some things worth remembering:

## Recent Activity
${observationSummary}

## Suggested Memories
${suggestedMemories.map(m => `- ${m}`).join('\n')}

Would you like me to save any of these as memories?

Options:
1. Save all suggested memories
2. Save specific memories (list which ones)
3. Skip saving
`;
}

// ============================================================================
// Module exports
// ============================================================================

export const memorySaveGates = {
  checkSaveGate,
  evaluateConditions,
  shouldExclude,
  checkMemoryIndexSize,
  truncateMemoryIndex,
  buildSavePrompt,
  SAVE_EXCLUSIONS,
  MAX_ENTRYPOINT_LINES,
  MAX_ENTRYPOINT_BYTES,
};
