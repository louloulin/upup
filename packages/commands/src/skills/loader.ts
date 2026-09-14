// @ts-nocheck
/**
 * Skills Loader
 *
 * Loads skills from filesystem directories.
 */

import type { Skill, LoadSkillResult } from './types.js'
import { parseSkillFile, isSkillFile, getSkillNameFromPath } from './parser.js'
import { DEFAULT_SKILLS_DIRS } from './types.js'
import { expandHome } from '../utils/path.js'

/**
 * Load skills from a directory
 */
export async function loadSkillsFromDir(dirPath: string): Promise<Skill[]> {
  const skills: Skill[] = []

  try {
    const { readdirSync, statSync, existsSync } = await import('fs')
    const { join } = await import('path')

    const expandedPath = expandHome(dirPath)
    if (!existsSync(expandedPath)) {
      return skills
    }

    const entries = readdirSync(expandedPath, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const skillPath = join(expandedPath, entry.name)

      // Look for SKILL.md or similar in the directory
      const files = readdirSync(skillPath)
      const skillFile = files.find(f => isSkillFile(f))

      if (skillFile) {
        const filePath = join(skillPath, skillFile)
        const skill = await parseSkillFile(filePath)
        if (skill) {
          skills.push(skill)
        }
      }
    }
  } catch {
    // Ignore errors loading from this directory
  }

  return skills
}

/**
 * Load all skills from configured directories
 */
export async function loadAllSkills(
  cwd: string,
  config?: {
    userDir?: string
    projectDir?: string
    bundled?: Skill[]
  },
): Promise<LoadSkillResult> {
  const skills: Skill[] = []
  const errors: string[] = []

  // Load bundled skills first
  if (config?.bundled) {
    skills.push(...config.bundled)
  }

  // Load user-level skills
  const userDir = config?.userDir ?? DEFAULT_SKILLS_DIRS.user
  try {
    const userSkills = await loadSkillsFromDir(expandHome(userDir))
    skills.push(...userSkills)
  } catch (e) {
    errors.push(`Failed to load user skills: ${e}`)
  }

  // Load project-level skills
  const projectDir = config?.projectDir ?? DEFAULT_SKILLS_DIRS.project
  try {
    const projectSkills = await loadSkillsFromDir(join(cwd, projectDir))
    skills.push(...projectSkills)
  } catch (e) {
    errors.push(`Failed to load project skills: ${e}`)
  }

  return {
    success: errors.length === 0,
    skills,
    error: errors.join('\n'),
  }
}

/**
 * Watch a skills directory for changes
 */
export function watchSkillsDir(
  dirPath: string,
  onChange: (skill: Skill) => void,
): () => void {
  const { watch } = require('fs')
  const expandedPath = expandHome(dirPath)

  const watcher = watch(expandedPath, { recursive: true }, async (eventType: string, filename: string) => {
    if (!filename || !isSkillFile(filename)) return

    const skillPath = filename.split('/').slice(0, -1).join('/')
    const skill = await loadSkillsFromDir(skillPath)
    if (skill.length > 0) {
      onChange(skill[0])
    }
  })

  return () => watcher.close()
}
