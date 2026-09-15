// @ts-nocheck
/**
 * Risk dashboard (active plan + risk prefs + watchlist concentration) Command Implementation
 *
 * Drives the Pi-native investment workflow through
 * `@upup/pi-investment-workflow`. This is the real, non-stub surface
 * that replaces the previous "sendUserMessage prompt-nudge" handler.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types'

const commandName = 'risk-dashboard'

export const call = async (
  args: string,
  _context: ToolUseContext,
): Promise<LocalCommandResult> => {
  let runner: ((...a: any[]) => Promise<string | null>) | undefined
  try {
    const mod = await import('@upup/pi-investment-workflow')
    runner = mod.runInvestmentCommand as typeof runner
  } catch (error) {
    return {
      type: 'text',
      value: [
        '',
        '═══════════════════════════════════════',
        `  /${commandName}`,
        '═══════════════════════════════════════',
        '',
        '  ⚠ investment workflow capability unavailable',
        `  ${error instanceof Error ? error.message : String(error)}`,
        '',
        '  Run `upup doctor` to verify Pi package manifest.',
      ].join('\n'),
    }
  }

  const trimmed = (args ?? '').trim()
  if (!trimmed) {
    return {
      type: 'text',
      value: [
        '',
        '═══════════════════════════════════════',
        `  /${commandName} — Risk dashboard (active plan + risk prefs + watchlist concentration)`,
        '═══════════════════════════════════════',
        '  Usage:',
        '    /risk-dashboard                  (no args required)',
        '',
        '  Workflow: detect -> plan -> execute -> verify -> report',
        '  Fail-closed by default; evidence persisted under .upup/plans/',
      ].join('\n'),
    }
  }

  if (!runner) {
    return {
      type: 'text',
      value: [
        '',
        `  ⚠ ${commandName} runner not available`,
        '  Verify @upup/pi-investment-workflow is installed and built.',
      ].join('\n'),
    }
  }

  try {
    const text = await runner(commandName, trimmed)
    if (text === null || text === undefined) {
      return {
        type: 'text',
        value: [
          '',
          `  Unknown investment command: ${commandName}`,
          '  Try /help for the full command list.',
        ].join('\n'),
      }
    }
    return { type: 'text', value: text }
  } catch (error) {
    return {
      type: 'text',
      value: [
        '',
        '═══════════════════════════════════════',
        `  /${commandName} — failed`,
        '═══════════════════════════════════════',
        '',
        `  ${error instanceof Error ? error.message : String(error)}`,
        '',
        '  The workflow is fail-closed. Verify:',
        '    • Argument format is correct',
        '    • Investment workflow capability is registered',
        '    • Pi package trust policy allows execution',
      ].join('\n'),
    }
  }
}

export const module: LocalCommandModule = { call }
