/**
 * @upup/pi-cli-bootstrap — Pi-native CLI bootstrap commands for the UpUp investment assistant.
 *
 * Provides top-level CLI commands wired by `src/index.tsx`:
 * - `runConfigCommand`       — `/config` 列出、读、写配置
 * - `runDoctor`              — `/doctor` 系统健康检查
 * - `runOnboarding`          — `/setup` 首次使用向导
 * - `runOpenBuddyCommand`    — `upup openbuddy` Pi 状态迁移到 ~/.upup/agent
 * - `runPluginCommand`       — `upup plugin` Pi DefaultPackageManager 包装（install/list/uninstall/update）
 *
 * These are root-side bootstrap entrypoints (not skills/agents). They depend only on
 * `@upup/utils` + `Pi InteractiveMode` and do not touch root src/*.
 */

export { runConfigCommand } from './config';
export { runDoctor } from './doctor';
export { runOnboarding } from './onboarding';
export { runOpenBuddyCommand, type OpenBuddyCommandOptions, type OpenBuddyRunResult } from './openbuddy';
export { runPluginCommand, type PluginCommandOptions, type PluginRunResult } from './plugin';
export { runBridgeNotifyReloadCommand, type BridgeNotifyReloadOptions, type BridgeNotifyReloadResult } from './bridge';
export {
  UPUP_RECOMMENDED_PLUGINS,
  UPUP_KNOWN_PROBLEMATIC_PLUGINS,
  groupRecommendedByCategory,
  isProblematicPlugin,
  type RecommendedPlugin,
  type RecommendedPluginCategory,
} from './recommended-plugins';
