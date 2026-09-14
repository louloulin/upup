// @ts-nocheck
/**
 * Skills Command Implementation
 *
 * Lists available user skills and bundled skills.
 */

import type { LocalCommandModule, LocalCommandResult, ToolUseContext } from '../../types/command-types.js'
import { getGlobalSkillsRegistry } from '../../skills/registry.js'
import { generateSkillHelp, skillNameToCommandName } from '../../skills/skill-to-command.js'

export interface SkillsContext extends ToolUseContext {
  cwd: string
}

export const call = async (
  _args: string,
  context: SkillsContext,
): Promise<LocalCommandResult> => {
  const registry = getGlobalSkillsRegistry()

  // Load skills if not already loaded
  if (!registry.isLoaded()) {
    await registry.loadAll(context.cwd)
  }

  const skills = registry.list()
  const visibleSkills = registry.listVisible()

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
    lines.push(`  ${visibleSkills.length} skill(s) available`)
    lines.push('')

    // Group skills by source
    const bundled = skills.filter(s => s.bundled)
    const user = skills.filter(s => !s.bundled)

    if (bundled.length > 0) {
      lines.push('  ─── Bundled Skills ───')
      for (const skill of bundled) {
        const cmdName = skillNameToCommandName(skill.name)
        lines.push(`    /${cmdName.padEnd(16)} ${skill.description}`)
      }
      lines.push('')
    }

    if (user.length > 0) {
      lines.push('  ─── User Skills ───')
      for (const skill of user) {
        const cmdName = skillNameToCommandName(skill.name)
        lines.push(`    /${cmdName.padEnd(16)} ${skill.description}`)
      }
      lines.push('')
    }

    lines.push('  Use /help <skill-name> for details.')
  }

  lines.push('')
  lines.push('───────────────────────────────────────')
  lines.push('  Tip: Skills are markdown files in SKILL.md format')

  return { type: 'text', value: lines.join('\n') }
}

export const module: LocalCommandModule = { call }