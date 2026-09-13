#!/usr/bin/env bun
import { config } from 'dotenv';
import { runCli } from './cli.js';
import { runOnboarding } from './commands/onboarding.js';
import { runDoctor } from './commands/doctor.js';
import { runConfigCommand } from './commands/config.js';
import { createStdioServer } from './stdio/server.js';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

config({ quiet: true });

// Parse CLI subcommands
const args = process.argv.slice(2);
const command = args[0]?.toLowerCase();

// Parse global flags
function getFlag(flags: string[]): string | undefined {
  for (const flag of flags) {
    const inline = args.find((arg) => arg.startsWith(`${flag}=`));
    if (inline) return inline.slice(flag.length + 1);
    const idx = args.indexOf(flag);
    if (idx >= 0) {
      // Return next arg if it doesn't look like a flag
      const next = args[idx + 1];
      if (next && !next.startsWith('-')) return next;
      return ''; // flag without value
    }
  }
  return undefined;
}

function hasFlag(flags: string[]): boolean {
  return flags.some(f => args.includes(f));
}

async function main() {
  // Check for --stdio mode (for external tool integration)
  // In stdio mode, we run a pure JSON-RPC server without any CLI UI
  if (args.includes('--stdio')) {
    const server = createStdioServer();
    server.start();
    // Keep process alive - server handles its own lifecycle
    // Use a promise that never resolves to keep the process running
    await new Promise(() => {});
    return;
  }

  if (command === 'management' || hasFlag(['--management'])) {
    const portRaw = getFlag(['--management-port']) ?? '18081';
    const port = Number.parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port < 0 || port > 65535) {
      console.error(`Invalid --management-port: ${portRaw}`);
      process.exit(1);
    }
    const bind = getFlag(['--management-bind']) ?? '127.0.0.1';
    const explicitToken = getFlag(['--management-token']);
    const token = explicitToken && explicitToken.length >= 8 ? explicitToken : crypto.randomUUID().replace(/-/g, '').slice(0, 32);
    const { createManagementSnapshotProvider } = await import('./management/snapshot-provider.js');
    const { startManagementServer } = await import('./management/server.js');
    const provider = await createManagementSnapshotProvider();
    const server = await startManagementServer({ port, bind, token, snapshotProvider: provider });
    console.log(`[management] 管理页面: http://${bind}:${server.port}/?token=${token}\n[management] API: http://${bind}:${server.port}/api/management/snapshot?token=${token}`);
    if (hasFlag(['--management-once'])) {
      await server.stop();
      return;
    }
    await new Promise<void>((resolve) => {
      const shutdown = () => { void server.stop().finally(resolve); };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    });
    return;
  }

  // Bridge-mode flag (Sprint 1.3). When present, start the local WebSocket
  // bridge server alongside (or in place of) the regular CLI. The token is
  // auto-generated from crypto.randomUUID if --bridge-token is omitted.
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
    const { startBridgeServer } = await import('./bridge/server.js');
    const srv = await startBridgeServer({ port, bind, token, auditPath });
    console.log(
      `[bridge] listening on ws://${bind}:${srv.port}/bridge?token=${token}\n` +
        `[bridge] audit: ${auditPath}\n` +
        `[bridge] stop with: kill -TERM ${process.pid}`,
    );
    if (hasFlag(['--bridge-only'])) {
      // Bridge-only mode: keep the process alive without launching the CLI.
      await new Promise(() => {});
      return;
    }
  }

  // Handle session resume flags before command switch
  const resumeTarget = getFlag(['-r', '--resume']);
  const shouldContinue = hasFlag(['-c', '--continue']);
  const shouldFork = hasFlag(['--fork-session']);

  switch (command) {
    case 'setup':
      // Interactive setup wizard
      await runOnboarding();
      process.exit(0);
      break;

    case 'doctor':
      // Health check
      await runDoctor();
      process.exit(0);
      break;

    case 'config':
      // Configuration management
      const configArgs = args.slice(1);
      const configSubCommand = configArgs[0] || 'help';
      const configSubArgs = configArgs.slice(1);
      runConfigCommand({ command: configSubCommand, args: configSubArgs });
      process.exit(0);
      break;

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
      // Start interactive CLI with resume context
      await runCli({
        resumeTarget: resumeTarget ?? undefined,
        continue: shouldContinue,
        fork: shouldFork,
      });
    }
  }
}

function printHelp() {
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

Bridge Mode (Sprint 1.3):
  upup --bridge [--bridge-port=7333] [--bridge-token=<secret>] [--bridge-bind=127.0.0.1] [--bridge-only]
         Start CLI with local WebSocket bridge enabled. Token auto-generated if omitted.

Examples:
  upup --bridge                                  # default port 7333, auto token
  upup --bridge --bridge-port 0                  # OS-assigned free port
  upup --bridge-only                             # bridge without CLI TUI

Management Mode:
  upup management [--management-port=18081] [--management-token=<secret>] [--management-bind=127.0.0.1]
         Start the read-only Pi management page and JSON API. The default page is http://127.0.0.1:18081/.

Examples:
  upup management --management-token=change-me    # page + authenticated management API
`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
