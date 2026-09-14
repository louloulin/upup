// Skill types
export type {
  Skill,
  SkillSource,
  SkillMetadata,
  SkillModel,
  SkillContext,
  SkillCommand,
  SkillExecutionOptions,
  SkillExecutionResult,
  BundledSkillDefinition,
  BundledSkillWithPrompt,
  ToolUseContext,
  HooksSettings,
  EffortValue,
} from './types.js';

// Skill registry functions
export {
  discoverSkills,
  getSkill,
  buildSkillMetadataSection,
  clearSkillCache,
} from './registry.js';

// Skill loader functions
export {
  parseSkillFile,
  loadSkillFromPath,
  extractSkillMetadata,
} from './loader.js';

// Skill scheduler functions
export { SkillScheduler } from './scheduler.js';

// Skill dependency functions
export {
  resolveDependencies,
  getDependencyGraph,
  areDependenciesMet,
} from './dependency.js';

// ============================================================================
// Slash command parser (Round 5 migration)
// ============================================================================
export {
  parseSlashCommand,
  isSlashCommand,
  getSkillName,
  routeSlashCommand,
  getSkillCommandRegistry,
  resetSkillCommandRegistry,
  SkillCommandRegistry,
  registerSkillsFromDirectory,
  discoverAndRegisterSkills,
} from './slash-command.js';
export type { ParsedSkillCommand, SkillCommandRegistration } from './slash-command.js';

// ============================================================================
// Skill usage tracking (Round 5 migration)
// ============================================================================
export {
  calculateScore,
  getRecentScore,
  recordUsage,
  getAllRecentScores,
  getAllRecentCounts,
  clearUsageData,
  getUsageStats,
} from './recent-usage.js';
export type { UsageRecord } from './recent-usage.js';
