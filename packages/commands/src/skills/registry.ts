// @ts-nocheck
/**
 * Skills Registry
 *
 * Central registry for managing skills.
 */

import type { Skill, SkillMatch, ISkillRegistry } from './types.js'
import { loadAllSkills } from './loader.js'
import { generatePromptForSkill } from './parser.js'

/**
 * In-memory skills registry
 */
export class SkillsRegistry implements ISkillRegistry {
  private skills: Map<string, Skill> = new Map()
  private loaded: boolean = false
  private cwd: string = ''

  /**
   * Load all skills from configured directories
   */
  async loadAll(cwd?: string): Promise<void> {
    if (cwd) this.cwd = cwd

    const result = await loadAllSkills(this.cwd)

    this.skills.clear()
    for (const skill of result.skills) {
      this.skills.set(skill.name, skill)
    }

    this.loaded = true
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name) ?? this.skills.get(name.toLowerCase())
  }

  /**
   * List all skills
   */
  list(): Skill[] {
    return Array.from(this.skills.values())
  }

  /**
   * List visible skills (not hidden)
   */
  listVisible(): Skill[] {
    return this.list().filter(s => !s.hidden)
  }

  /**
   * Match skills by query
   */
  match(query: string): SkillMatch[] {
    const q = query.toLowerCase()
    const results: SkillMatch[] = []

    for (const skill of this.skills.values()) {
      let score = 0
      const reasons: string[] = []

      // Exact name match
      if (skill.name.toLowerCase() === q) {
        score += 100
        reasons.push('exact name match')
      }

      // Prefix match
      if (skill.name.toLowerCase().startsWith(q)) {
        score += 50
        reasons.push('name prefix')
      }

      // Substring match
      if (skill.name.toLowerCase().includes(q)) {
        score += 30
        reasons.push('name contains')
      }

      // Description match
      if (skill.description.toLowerCase().includes(q)) {
        score += 10
        reasons.push('description contains')
      }

      if (score > 0) {
        results.push({
          skill,
          score,
          reason: reasons.join(', '),
        })
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * Match skills by file path
   */
  matchByPath(filePath: string): SkillMatch[] {
    const results: SkillMatch[] = []

    for (const skill of this.skills.values()) {
      if (!skill.paths || skill.paths.length === 0) continue

      for (const pattern of skill.paths) {
        if (matchesGlob(filePath, pattern)) {
          results.push({
            skill,
            score: 50,
            reason: `path matches ${pattern}`,
          })
          break
        }
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * Reload skills from disk
   */
  async reload(): Promise<void> {
    await this.loadAll()
  }

  /**
   * Check if loaded
   */
  isLoaded(): boolean {
    return this.loaded
  }
}

// Simple glob matching
function matchesGlob(path: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(path)
}

// Global registry instance
let globalRegistry: SkillsRegistry | null = null

export function getGlobalSkillsRegistry(): SkillsRegistry {
  if (!globalRegistry) {
    globalRegistry = new SkillsRegistry()
  }
  return globalRegistry
}

export function resetGlobalSkillsRegistry(): void {
  globalRegistry = null
}
