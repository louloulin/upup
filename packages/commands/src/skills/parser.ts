/**
 * Skills Parser
 *
 * Parses skill files (SKILL.md format) and extracts frontmatter.
 * Based on Claude Code's skill format.
 */

import type { Skill, SkillFrontmatter } from './types.js'
import { SKILL_FILENAMES } from './types.js'

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter | null; body: string } {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    return { frontmatter: null, body: content }
  }

  const [, frontmatterStr, body] = match

  // Parse YAML-like frontmatter
  const frontmatter: Record<string, unknown> = {}
  const lines = frontmatterStr.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    // Parse array values
    if (value.startsWith('[') && value.endsWith(']')) {
      const arrayContent = value.slice(1, -1)
      frontmatter[key] = arrayContent
        .split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, ''))
        .filter(Boolean)
    } else {
      // Parse boolean
      if (value === 'true') {
        frontmatter[key] = true
      } else if (value === 'false') {
        frontmatter[key] = false
      } else {
        // Parse string
        frontmatter[key] = value.replace(/^["']|["']$/g, '')
      }
    }
  }

  return {
    frontmatter: frontmatter as unknown as SkillFrontmatter,
    body: body.trim(),
  }
}

/**
 * Validate required frontmatter fields
 */
function validateFrontmatter(frontmatter: SkillFrontmatter | null): frontmatter is SkillFrontmatter {
  if (!frontmatter) return false
  if (!frontmatter.name) return false
  if (!frontmatter.description) return false
  return true
}

/**
 * Parse a skill file from content
 */
export function parseSkill(
  content: string,
  filePath: string,
  options?: { isBundled?: boolean },
): Skill | null {
  const { frontmatter, body } = parseFrontmatter(content)

  if (!validateFrontmatter(frontmatter)) {
    return null
  }

  // Generate ID from name
  const id = frontmatter.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return {
    id,
    name: frontmatter.name,
    description: frontmatter.description,
    whenToUse: frontmatter.whenToUse,
    allowedTools: frontmatter.allowedTools,
    argumentHint: frontmatter.argumentHint,
    model: frontmatter.model,
    context: frontmatter.context,
    effort: frontmatter.effort,
    paths: frontmatter.paths,
    bundled: options?.isBundled ?? false,
    hidden: frontmatter.hidden ?? false,
    subagentType: frontmatter.subagentType,
    permission: frontmatter.permission,
    content: body,
    filePath,
    lastModified: Date.now(),
  }
}

/**
 * Parse skill from file
 */
export async function parseSkillFile(
  filePath: string,
  options?: { isBundled?: boolean },
): Promise<Skill | null> {
  try {
    const { readFileSync, statSync } = await import('fs')

    const content = readFileSync(filePath, 'utf-8')
    const stat = statSync(filePath)

    const skill = parseSkill(content, filePath, options)
    if (skill) {
      skill.lastModified = stat.mtimeMs
    }

    return skill
  } catch {
    return null
  }
}

/**
 * Check if a filename is a skill file
 */
export function isSkillFile(filename: string): boolean {
  return SKILL_FILENAMES.includes(filename)
}

/**
 * Get skill name from file path
 */
export function getSkillNameFromPath(filePath: string): string {
  // Get directory name as skill name
  const parts = filePath.split('/')
  const dirName = parts[parts.length - 2] ?? parts[parts.length - 1]
  return dirName
}

/**
 * Extract skill commands from content
 * Returns array of command definitions from the skill content
 */
export interface SkillCommand {
  name: string
  description: string
  aliases?: string[]
  argumentHint?: string
}

/**
 * Parse commands from skill content
 * Looks for command definitions in format:
 * ## command/name
 * Description of command
 */
export function parseCommandsFromContent(content: string): SkillCommand[] {
  const commands: SkillCommand[] = []
  const commandRegex = /^##\s+([a-z0-9-]+(?:\/[a-z0-9-]+)*)\s*\n([^\n#]*)/gm

  let match
  while ((match = commandRegex.exec(content)) !== null) {
    const [, name, description] = match
    commands.push({
      name: name.replace(/\//g, '-'),
      description: description.trim(),
    })
  }

  return commands
}

/**
 * Generate prompt content for a skill
 */
export function generatePromptForSkill(skill: Skill, args?: string): string {
  let prompt = skill.content

  if (args) {
    // Replace {args} placeholder in content
    prompt = prompt.replace(/\{args\}/g, args)
  }

  return prompt
}