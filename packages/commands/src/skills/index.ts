/**
 * Skills System
 *
 * User-defined skills/commands system.
 * Based on Claude Code's skill format.
 */

// Types
export type {
  Skill,
  SkillFrontmatter,
  SkillContext,
  SkillMatch,
  ISkillRegistry,
  LoadSkillResult,
} from './types.js'

export {
  DEFAULT_SKILLS_DIRS,
  SKILL_EXTENSIONS,
  SKILL_FILENAMES,
} from './types.js'

// Parser
export { parseFrontmatter, parseSkill, parseSkillFile, generatePromptForSkill } from './parser.js'

// Loader
export { loadSkillsFromDir, loadAllSkills, watchSkillsDir } from './loader.js'

// Registry
export { SkillsRegistry, getGlobalSkillsRegistry, resetGlobalSkillsRegistry } from './registry.js'

// Converter
export {
  skillToPromptCommand,
  skillsToCommands,
  skillNameToCommandName,
  filterSkillsByPath,
  generateSkillHelp,
  type SkillCommandInfo,
} from './skill-to-command.js'
