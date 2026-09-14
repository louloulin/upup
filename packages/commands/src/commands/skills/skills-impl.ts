// @ts-nocheck
/**
 * Skills Command Implementation
 *
 * Lists available user skills and bundled skills.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { listPiSkillCommands } from '@upup/pi-resource-composition'

export interface SkillsContext extends ToolUseContext {
  cwd: string
}

export const call = async (
  _args: string,
  context: SkillsContext,
): Promise<LocalCommandResult> => {
  const skills = await listPiSkillCommands(context.cwd)

  const lines: string[] = []

  lines.push('')
  lines.push('═══════════════════════════════════════')
  lines.push('  Skills')
  lines.push('═══════════════════════════════════════')
  lines.push('')

  if (skills.length === 0) {
    lines.push('  No skills found.')
    lines.push('')
    lines.push('  Create skills in:')
    lines.push('    ~/.claude/skills/        (user-level)')
    lines.push('    .claude/skills/          (project-level)')
    lines.push('')
    lines.push('  See /help skills for more info.')
  } else {
    lines.push(`  ${skills.length} skill(s) available`)
    lines.push('')
    lines.push('  ─── Pi Skills ───')
    for (const skill of skills) {
      lines.push(`    /${skill.name.padEnd(16)} ${skill.description}`)
    }
    lines.push('')

    lines.push('  Use /help <skill-name> for details.')
  }

  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Tip: Skills are markdown files in SKILL.md format')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }
