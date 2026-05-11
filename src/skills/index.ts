/**
 * @deprecated Use @upup/skills instead
 * Re-exports from @upup/skills for backward compatibility
 */

// Skill types
export type { SkillMetadata, Skill, SkillSource } from '@upup/skills';

// Skill registry functions
export {
  discoverSkills,
  getSkill,
  buildSkillMetadataSection,
  clearSkillCache,
} from '@upup/skills';

// Skill loader functions
export {
  parseSkillFile,
  loadSkillFromPath,
  extractSkillMetadata,
} from '@upup/skills';
