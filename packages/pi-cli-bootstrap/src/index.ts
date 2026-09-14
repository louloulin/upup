/**
 * @upup/pi-cli-bootstrap — Pi-native CLI bootstrap commands for the UpUp investment assistant.
 *
 * Provides three top-level CLI commands wired by `src/index.tsx`:
 * - `runConfigCommand` — `/config` 列出、读、写配置
 * - `runDoctor` — `/doctor` 系统健康检查
 * - `runOnboarding` — `/setup` 首次使用向导
 *
 * These are root-side bootstrap entrypoints (not skills/agents). They depend only on
 * `@upup/utils` + `@upup/pi-tui-app` and do not touch root src/*.
 */

export { runConfigCommand } from './config.js';
export { runDoctor } from './doctor.js';
export { runOnboarding } from './onboarding.js';
