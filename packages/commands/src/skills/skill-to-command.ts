/**
 * Skills to Commands Converter
 *
 * Converts Skill objects from the skills system into Command objects
 * that can be executed by the unified command system.
 */

import type { Skill } from './types.js'
import type { PromptCommand, LocalCommand } from '../types/command-types.js'
import { generatePromptForSkill } from './parser.js'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

/**
 * Convert a Skill to a PromptCommand
 * Prompt commands return content that gets injected into the conversation
 */
export function skillToPromptCommand(skill: Skill): PromptCommand {
  return {
    type: 'prompt',
    name: skill.name.toLowerCase().replace(/\s+/g, '-'),
    description: skill.description,
    isHidden: skill.hidden,
    aliases: [],
    argumentHint: skill.argumentHint,
    whenToUse: skill.whenToUse,
    version: '1.0.0',
    source: skill.bundled ? 'bundled' : 'skills',
    availability: [],
    isEnabled: () => true,
    disableModelInvocation: false,
    userInvocable: true,
    loadedFrom: 'skills',
    effort: skill.effort as PromptCommand['effort'],
    progressMessage: `Running skill: ${skill.name}`,
    contentLength: skill.content.length,
    argNames: skill.argumentHint ? [skill.argumentHint] : [],
    allowedTools: skill.allowedTools as string[] | undefined,
    model: skill.model,
    context: skill.context as PromptCommand['context'],
    agent: skill.subagentType,
    getPromptForCommand: async (args: string) => {
      // Generate the prompt content from the skill
      const content = generatePromptForSkill(skill, args)

      // Return as a text block
      const block: ContentBlockParam = {
        type: 'text',
        text: content,
      }
      return [block]
    },
  }
}

/**
 * Convert multiple skills to commands
 */
export function skillsToCommands(skills: Skill[]): PromptCommand[] {
  return skills
    .filter(skill => !skill.hidden)
    .map(skill => skillToPromptCommand(skill))
}

/**
 * Get skill name as command name
 */
export function skillNameToCommandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Check if a string is a valid command name
 */
export function isValidCommandName(name: string): boolean {
  return /^[a-z][a-z0-9-]*$/.test(name)
}

/**
 * Filter skills by file path patterns
 */
export function filterSkillsByPath(skills: Skill[], filePath: string): Skill[] {
  return skills.filter(skill => {
    if (!skill.paths || skill.paths.length === 0) {
      return false
    }

    for (const pattern of skill.paths) {
      if (matchesGlob(filePath, pattern)) {
        return true
      }
    }
    return false
  })
}

/**
 * Simple glob matching for path patterns
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

/**
 * Get skill command descriptions
 */
export interface SkillCommandInfo {
  name: string
  description: string
  aliases: string[]
  whenToUse?: string
  effort?: string
}

export function getSkillCommandInfo(skill: Skill): SkillCommandInfo {
  const commandName = skillNameToCommandName(skill.name)

  return {
    name: commandName,
    description: skill.description,
    aliases: [],
    whenToUse: skill.whenToUse,
    effort: skill.effort,
  }
}

/**
 * Generate help text for a skill
 */
export function generateSkillHelp(skill: Skill): string {
  const lines: string[] = []

  lines.push(`## /${skillNameToCommandName(skill.name)}`)
  lines.push('')
  lines.push(skill.description)
  lines.push('')

  if (skill.whenToUse) {
    lines.push(`**When to use:** ${skill.whenToUse}`)
    lines.push('')
  }

  if (skill.argumentHint) {
    lines.push(`**Usage:** /${skillNameToCommandName(skill.name)} ${skill.argumentHint}`)
    lines.push('')
  }

  if (skill.effort) {
    lines.push(`**Effort:** ${skill.effort}`)
    lines.push('')
  }

  if (skill.allowedTools && skill.allowedTools.length > 0) {
    lines.push(`**Allowed tools:** ${skill.allowedTools.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}