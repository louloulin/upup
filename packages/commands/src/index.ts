/**
 * @upup/commands - Slash command framework
 *
 * Unified exports from all-commands.ts (merged from executor.ts, slash-commands.ts)
 *
 * Features (aligned with loucode):
 * - Unified COMMAND_ALIASES
 * - Memoized command loading
 * - Alias support: getAliasesForCommand, resolveAlias, isAlias
 * - Fuzzy matching: fuzzyMatchCommands, matchCommands
 * - Usage tracking: recordCommandUsage, getCommandUsage
 * - Availability checks: meetsAvailabilityRequirement
 * - Remote/Bridge safe commands
 */

// Command system core
export {
  ALL_COMMANDS,
  builtInCommandNames,
  SLASH_COMMANDS,
  COMMAND_ALIASES,
  ALIAS_TO_COMMAND,
  inferCategory,
  findCommand,
  executeCommand,
  getAvailableCommands,
  filterCommandsForRemoteMode,
  filterCommandsForBridgeMode,
  filterCommandsForNonInteractive,
  // Alias helpers
  getAliasesForCommand,
  resolveAlias,
  isAlias,
  getAllSlashCommands,
  getAllSlashCommandsWithAliases,
  type SlashCommandWithAlias,
  // Command matching
  matchCommands,
  fuzzyMatchCommands,
  type CommandCategory,
  type SlashCommand,
  type Command,
  // Dynamic command registration
  registerDynamicCommand,
  unregisterDynamicCommand,
  getDynamicCommands,
  clearDynamicCommands,
} from './all-commands.js'

// Command types
export {
  type PromptCommand,
  type LocalCommand,
  type LocalJSXCommand,
  type LocalCommandModule,
  type LocalCommandResult,
  type LocalJSXCommandModule,
  type LocalJSXCommandContext,
  type LocalJSXCommandOnDone,
  type CommandBase,
  type CommandAvailability,
  type ToolUseContext,
  type CommandSource,
  type FeatureGate,
  getCommandName,
  isCommandEnabled,
  meetsAvailabilityRequirement,
  isRemoteSafeCommand,
  isBridgeSafeCommand,
} from './types/command-types.js'

// Usage tracking
export {
  recordCommandUsage,
  getCommandUsage,
  getUsageStats,
  getTopCommands,
  getCommandRank,
  isFrequentlyUsed,
  resetUsageStats,
} from './command-usage.js'

// Theme
export {
  theme,
  editorTheme,
  selectListTheme,
} from './theme.js'

// Argument parsing
export {
  parseArgs,
  splitCommand,
  hasFlag,
  getOption,
  getPositional,
  getAllPositionals,
  parseKeyValues,
  formatArgs,
  type ParsedArgs,
} from './args.js'

// Timeout utilities
export {
  TimeoutError,
  executeWithTimeout,
  executeWithTimeoutOrThrow,
  withTimeout,
  delay,
  raceWithTimeout,
  executeAllWithTimeout,
  COMMAND_TIMEOUTS,
  getCommandTimeout,
  type TimeoutResult,
} from './timeout.js'

// Command metrics
export {
  recordCommandMetric,
  getCommandMetric,
  getAllMetrics,
  getMetricsSummary,
  resetMetrics,
  exportMetrics,
  importMetrics,
  type CommandMetric,
  type MetricsSummary,
} from './command-metrics.js'

// Command registry (legacy support)
export {
  getGlobalRegistry,
  registerBuiltinCommands,
  resetGlobalRegistry,
  parseMacroFile,
  expandMacro,
  loadUserCommands,
  loadMacros,
  type CommandRegistry,
  type CommandContext,
  type CommandResult,
} from './commands.js'

