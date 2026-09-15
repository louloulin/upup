// @ts-nocheck
/**
 * Model Command Implementation
 * 
 * Shows current model information.
 * 
 * Note: Model switching requires UI interaction, so this just displays current model.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

export interface ModelContext extends ToolUseContext {
  provider?: string
  modelId?: string
}

export const call = async (
  _args: string,
  context: ModelContext,
): Promise<LocalCommandResult> => {
  const lines = [
    '',
    '═══════════════════════════════════════',
    '  Model Settings',
    '═══════════════════════════════════════',
    '',
    `Current: ${context.model ?? 'default'}`,
    context.provider ? `Provider: ${context.provider}` : null,
    context.modelId ? `Model ID: ${context.modelId}` : null,
    '',
    '───────────────────────────────────────',
    '  Available Models',
    '───────────────────────────────────────',
    '  claude-sonnet-4-20250514  (default)',
    '  claude-3-5-sonnet-20241022',
    '  claude-3-opus-20240229',
    '  gpt-4o',
    '  gemini-2.0-flash',
    '',
    '───────────────────────────────────────',
    '  Usage',
    '───────────────────────────────────────',
    '  Use /model to open model selector UI',
    '  Or specify: /model claude-sonnet-4-20250514',
    '',
  ].filter((line): line is string => line !== null)

  return { type: 'text', value: lines.join('\n') }
}