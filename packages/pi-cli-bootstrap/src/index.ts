/**
 * @upup/pi-cli-bootstrap — Pi-native CLI bootstrap commands for the UpUp investment assistant.
 *
 * Provides top-level CLI commands wired by `src/index.tsx`:
 * - `runConfigCommand`       — `/config` 列出、读、写配置
 * - `runDoctor`              — `/doctor` 系统健康检查
 * - `runOpenBuddyCommand`    — `upup openbuddy` Pi 状态迁移到 ~/.upup/agent
 * - `runPluginCommand`       — `upup plugin` Pi DefaultPackageManager 包装（install/list/uninstall/update）
 *
 * Authentication lives entirely inside the Pi TUI's `/login` slash command,
 * which writes to `~/.upup/agent/auth.json`. There is no UpUp-side
 * `upup setup` wizard — headless paths (eval / print / cron / gateway /
 * bridge) read that file via `@upup/utils/env.mergeAuthJsonIntoProcessEnv`.
 *
 * These are root-side bootstrap entrypoints (not skills/agents). They depend only on
 * `@upup/utils` + `Pi InteractiveMode` and do not touch root src/*.
 */

export { runConfigCommand } from './config';
export { runDoctor } from './doctor';
export { runOpenBuddyCommand, type OpenBuddyCommandOptions, type OpenBuddyRunResult } from './openbuddy';
export { runPluginCommand, type PluginCommandOptions, type PluginRunResult } from './plugin';
export { runInvestCommand, type InvestCommandOptions, type InvestCommandResult } from './invest';
export { runSopCommandCli, type SopCommandOptions, type SopCommandResult } from './sop';
export { runBridgeNotifyReloadCommand, type BridgeNotifyReloadOptions, type BridgeNotifyReloadResult } from './bridge';
export {
  UPUP_RECOMMENDED_PLUGINS,
  UPUP_KNOWN_PROBLEMATIC_PLUGINS,
  groupRecommendedByCategory,
  isProblematicPlugin,
  type RecommendedPlugin,
  type RecommendedPluginCategory,
} from './recommended-plugins';
