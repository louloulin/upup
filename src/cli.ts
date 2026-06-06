/**
 * src/cli.ts - Application entry shell for the CLI renderer.
 *
 * This file is intentionally minimal. All business logic lives in
 * workspace packages under packages/. See `@upup/cli` for the full
 * CLI implementation (interactive TUI, command routing, etc.).
 */
export { runCli, type RunCliOptions } from '@upup/cli';
