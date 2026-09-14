/**
 * Skills Module - Unified exports for Upup Skills System
 *
 * This is the main entry point for the skills system.
 * It re-exports all skills functionality from submodules.
 *
 * Key exports:
 * - initializeSkills(): Initialize and register all skills
 * - getSkillCommand(name): Get a skill command by name
 * - createSkillCommand(): Create SkillCommand from Skill
 * - getPromptForCommand(): Get prompt content for skill execution
 */

export type {
  SkillMetadata,
  Skill,
  SkillCommand,
  SkillSource,
  SkillModel,
  SkillContext,
  SkillExecutionResult,
  SkillExecutionOptions,
  BundledSkillDefinition,
  HooksSettings,
  EffortValue,
  ToolUseContext,
} from '@upup/skills';

export {
  discoverSkills,
  getSkill,
  clearSkillCache,
  buildSkillMetadataSection,
  getAllSkills,
  getBundledSkill,
  getAllBundledSkills,
  registerBundledSkill,
  // Event emitter
  onSkillEvent,
  offSkillEvent,
  getSkillEventEmitter,
} from './registry.js';

export {
  parseSkillFile,
  loadSkillFromPath,
  extractSkillMetadata,
  parseSkillFile as parseSkill,
  loadSkillFromPath as loadSkill,
  convertPluginSkill,
  convertPluginSkills,
  type PluginBundledSkill,
} from './loader.js';

export {
  executeSkill,
  executeSkillInline,
  executeSkillFork,
  buildSkillPrompt,
  buildSubagentConfig,
  getExecutionMode,
  shouldUseForkMode,
  isBundledSkill,
  bundledSkillToSkill,
  SkillTracker,
  defaultSkillTracker,
  createSkillCommand,
  getPromptForCommand,
  substituteArguments,
  parseArgumentNames,
  getSessionId,
  setSessionId,
} from './executor.js';

export {
  initializeSkills,
  getSkillCommand,
  getAllSkillCommands,
  getUniqueSkillCommands,
  getCommandsBySource,
  hasCommand,
  searchCommands,
  executeSkillCommand,
  getRegisteredCommandCount,
  isInitialized,
  resetInitialization,
} from './commands.js';

export {
  SkillCommandRegistry,
  getSkillCommandRegistry,
  resetSkillCommandRegistry,
  parseSlashCommand,
  isSlashCommand,
  getSkillName,
  routeSlashCommand,
  registerSkillsFromDirectory,
  discoverAndRegisterSkills,
} from '@upup/skills';

export { SkillScheduler, useSkillScheduler } from './scheduler.js';

export {
  resolveDependencies,
  getDependencyGraph,
  areDependenciesMet,
  type DependencyError,
  type ResolutionResult,
} from './dependency.js';

export {
  AutoSkillActivator,
  getAutoSkillActivator,
  resetAutoSkillActivator,
  parseConditionalSkill,
  type ConditionalSkill,
  type SkillActivationEvent,
  PatternMatcher,
} from './auto-activate.js';

export {
  SkillsMenu,
  getSkillsMenu,
  resetSkillsMenu,
  listSkills,
  showSkill,
  searchSkills,
  renderSkillsMenu,
  renderSkillDetail,
  suggestSkills,
  formatSkillSuggestions,
  shouldSuggestSkills,
  getCliSkillSuggestion,
  type SkillMenuItem,
  type SkillSource as MenuSkillSource,
} from './skills-menu.js';

export {
  executeShellCommandsInPrompt,
  containsShellCommands,
  extractShellCommands,
  isCommandAllowed,
} from './promptShellExecution.js';

export {
  recordUsage,
  getRecentScore,
  getAllRecentScores,
  calculateScore,
  getUsageStats,
  clearUsageData,
  type UsageRecord,
} from '@upup/skills';