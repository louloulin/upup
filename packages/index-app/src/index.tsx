#!/usr/bin/env bun
/**
 * @upup/index-app - L7 Application Shell
 *
 * Thin entry point that orchestrates the full UpUp CLI:
 *  - subcommands (setup, doctor, config, help, version)
 *  - --stdio mode (external tool integration via JSON-RPC)
 *  - --bridge mode (WebSocket bridge for mobile/external clients)
 *  - interactive CLI (delegates to @upup/cli)
 *  - session cleanup hooks (SIGINT/SIGTERM/SIGHUP)
 *
 * Exports a `run()` function so the module can be imported without
 * immediately executing side effects. The top-level `src/index.tsx`
 * is the only thing that calls `run()` at startup.
 */
import { config } from 'dotenv';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

import { runCli } from '@upup/cli';
import { runOnboarding } from '@upup/cli/commands/onboarding';
import { runDoctor } from '@upup/cli/commands/doctor';
import { runConfigCommand } from '@upup/cli/commands/config';
import { startBridgeServer } from '@upup/bridge-system/server';
import {
  cleanupSessionTeams,
} from '@upup/coordinator-system/multi-agent/session-cleanup';
import { getTeamManager } from '@upup/coordinator-system/multi-agent/team-manager';

import { createStdioServer } from './stdio/server.js';

let cleanupHooksRegistered = false;

function registerCleanupHooks(): void {
  if (cleanupHooksRegistered) return;
  cleanupHooksRegistered = true;
  const cleanup = async () => {
    try {
      await cleanupSessionTeams((name) => getTeamManager().deleteTeam(name));
    } catch {
      // best-effort cleanup
    }
  };
  process.on('SIGINT', async () => {
    console.log('\n[cleanup] tearing down session teams...');
    await cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', async () => {
    await cleanup();
    process.exit(0);
  });
  process.on('SIGHUP', async () => {
    await cleanup();
    process.exit(0);
  });
}

function getFlag(flags: string[]): string | undefined {
  for (const flag of flags) {
    const idx = args.indexOf(flag);
    if (idx >= 0) {
      const next = args[idx + 1];
      if (next && !next.startsWith('-')) return next;
      return '';
    }
  }
  return undefined;
}

function hasFlag(flags: string[]): boolean {
  return flags.some((f) => args.includes(f));
}

let args: string[] = [];

async function main(): Promise<void> {
  // --stdio: pure JSON-RPC server for external tool integration
  if (args.includes('--stdio')) {
    const server = createStdioServer();
    server.start();
    await new Promise(() => {});
    return;
  }

  // --bridge: WebSocket bridge alongside the CLI
  if (hasFlag(['--bridge'])) {
    const portRaw = getFlag(['--bridge-port']) ?? '7333';
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
      console.error(`Invalid --bridge-port: ${portRaw}`);
      process.exit(1);
    }
    const bind = getFlag(['--bridge-bind']) ?? '127.0.0.1';
    const explicitToken = getFlag(['--bridge-token']);
    const token =
      explicitToken && explicitToken.length >= 8
        ? explicitToken
        : crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const auditPath = join(homedir(), '.upup', 'bridge-audit.log');
    mkdirSync(dirname(auditPath), { recursive: true });
    const srv = await startBridgeServer({ port, bind, token, auditPath });
    console.log(
      `[bridge] listening on ws://${bind}:${srv.port}/bridge?token=${token}\n` +
        `[bridge] audit: ${auditPath}\n` +
        `[bridge] stop with: kill -TERM ${process.pid}`,
    );
    if (hasFlag(['--bridge-only'])) {
      await new Promise(() => {});
      return;
    }
  }

  const command = args[0]?.toLowerCase();
  const resumeTarget = getFlag(['-r', '--resume']);
  const shouldContinue = hasFlag(['-c', '--continue']);
  const shouldFork = hasFlag(['--fork-session']);

  switch (command) {
    case 'setup':
      await runOnboarding();
      process.exit(0);
      break;

    case 'doctor':
      await runDoctor();
      process.exit(0);
      break;

    case 'config': {
      const configArgs = args.slice(1);
      const configSubCommand = configArgs[0] || 'help';
      const configSubArgs = configArgs.slice(1);
      runConfigCommand({ command: configSubCommand, args: configSubArgs });
      process.exit(0);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;

    case 'version':
    case '--version':
    case '-v':
      console.log('UpUp v2026.05.30');
      process.exit(0);
      break;

    default: {
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      await runCli({
        resumeTarget: resumeTarget ?? undefined,
        continue: shouldContinue,
        fork: shouldFork,
      });
    }
  }
}

function printHelp(): void {
  console.log(`
UpUp - AI Agent for Deep Financial Research

Usage:
  upup              Start interactive CLI
  upup setup        Run interactive setup wizard
  upup doctor       Run health check
  upup config       Manage configuration
  upup help         Show this help message
  upup version      Show version

Config Commands:
  upup config get <key>      Get a config value
  upup config set <key> <value>  Set a config value
  upup config list           List all config values
  upup config status         Show validation status
  upup config sources        Show config sources
  upup config export         Export config to file
  upup config import <file>  Import config from file
  upup config backup         Backup current config

Session Commands:
  upup -r [id]     Resume a previous session
  upup -c          Continue the most recent session
  upup --resume [id]  Resume session by ID or search term
  upup --continue   Continue most recent session
  upup --fork-session  Fork instead of resuming in place

Examples:
  upup              Start the agent
  upup setup        Configure API keys and settings
  upup doctor       Check system health
  upup config list  List all configuration
  upup -r           Show session picker to resume
  upup -r abc123    Resume session matching "abc123"
  upup -c           Continue the most recent session

Bridge Mode:
  upup --bridge [--bridge-port=7333] [--bridge-token=<secret>] [--bridge-bind=127.0.0.1] [--bridge-only]
         Start CLI with local WebSocket bridge enabled. Token auto-generated if omitted.
`);
}

export function run(argv: string[] = process.argv.slice(2)): Promise<void> {
  config({ quiet: true });
  args = argv;
  registerCleanupHooks();
  return main().catch((e) => {
    console.error('Error:', e?.message ?? e);
    process.exit(1);
  });
}
