#!/usr/bin/env bun
import { config } from 'dotenv';
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

function parseIntFlag(flags: readonly string[], name: string): number | undefined {
  const raw = getFlag([name]);
  if (raw === undefined) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function main() {
  // `--trace` turns on both tracers before any heavy module is imported:
  // `UPUP_TRACE_TURN` (per-turn context payload + turn timeline) and Pi's own
  // `PI_TIMING` (startup timings, extension load). Must run before the dynamic
  // imports below, because Pi reads `PI_TIMING` at module init.
  if (args.includes('--trace')) {
    process.env.UPUP_TRACE_TURN = '1';
    process.env.PI_TIMING = '1';
  }

  // Check for --stdio mode (for external tool integration)
  // In stdio mode, we run a pure JSON-RPC server without any CLI UI.
  // Pass --acp to advertise Agent Client Protocol capabilities and accept
  // editor-native method names (session/new, session/load, session/prompt).
  if (args.includes('--stdio') || args.includes('--acp')) {
    const { createStdioServer } = await import('@upup/pi-stdio');
    const { getPiStdioRuntime } = await import('@upup/pi-app/stdio');
    const server = createStdioServer(getPiStdioRuntime(), { acp: args.includes('--acp') });
    server.start();
    await server.waitForStop();
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
    const { createManagementSnapshotProvider, startManagementServer } = await import('@upup/pi-management');
    const { getPiNativeApp } = await import('@upup/pi-app/default');
    const provider = await createManagementSnapshotProvider({ sessionFactory: getPiNativeApp().getSessionFactory() });
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
    // Honour `$UPUP_HOME` (same shape as @upup/pi-platform / @upup/pi-market-data).
    const auditPath = join(process.env.UPUP_HOME?.trim() || join(process.env.HOME || homedir(), '.upup'), 'bridge-audit.log');
    mkdirSync(dirname(auditPath), { recursive: true });
    const { startBridgeServer } = await import('@upup/pi-bridge');
    const { getPiNativeApp } = await import('@upup/pi-app/default');
    const app = getPiNativeApp();
    const srv = await startBridgeServer({ port, bind, token, auditPath, runtime: app.getGatewayRuntime() });
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
      const { runOnboarding } = await import('@upup/pi-cli-bootstrap');
      await runOnboarding();
      process.exit(0);
      break;

    case 'doctor':
      // Health check
      const { runDoctor } = await import('@upup/pi-cli-bootstrap');
      await runDoctor();
      process.exit(0);
      break;

    case 'config':
      // Configuration management
      const { runConfigCommand } = await import('@upup/pi-cli-bootstrap');
      const configArgs = args.slice(1);
      const configSubCommand = configArgs[0] || 'help';
      const configSubArgs = configArgs.slice(1);
      runConfigCommand({ command: configSubCommand, args: configSubArgs });
      process.exit(0);
      break;

    case 'openbuddy':
      // Migrate Pi agent state (settings.json, themes, packages) into ~/.upup/agent.
      const { runOpenBuddyCommand } = await import('@upup/pi-cli-bootstrap');
      const obArgs = args.slice(1);
      const obSub = obArgs[0] || 'help';
      const obSubArgs = obArgs.slice(1);
      const obResult = runOpenBuddyCommand({ command: obSub as 'status' | 'migrate' | 'verify' | 'help', args: obSubArgs });
      process.exit(obResult.exitCode);
      break;

    case 'plugin':
      // Wrap Pi DefaultPackageManager so users can install/list/uninstall Pi packages via UpUp.
      const { runPluginCommand } = await import('@upup/pi-cli-bootstrap');
      const plArgs = args.slice(1);
      const plSub = plArgs[0] || 'help';
      const plSubArgs = plArgs.slice(1);
      const plResult = await runPluginCommand({ command: plSub as 'install' | 'list' | 'uninstall' | 'update' | 'reload' | 'help', args: plSubArgs });
      process.exit(plResult.exitCode);
      break;

    case 'bridge':
      // Phase 0.1c: forward a reload signal to a running bridge server (the
      // long-running TUI/CLI/SDK session picks it up via the onReloadRequest
      // hook). Lets a second `upup plugin install` reach a live session.
      const { runBridgeNotifyReloadCommand } = await import('@upup/pi-cli-bootstrap');
      const brArgs = args.slice(1);
      const brPort = parseIntFlag(brArgs, '--port') ?? undefined;
      const brToken = getFlag(['--token']);
      const brTriggered = getFlag(['--triggered-by']);
      const brResult = await runBridgeNotifyReloadCommand({
        ...(brPort !== undefined ? { port: brPort } : {}),
        ...(brToken !== undefined ? { token: brToken } : {}),
        ...(brTriggered !== undefined ? { triggeredBy: brTriggered } : {}),
      });
      process.stdout.write(`${brResult.message}\n`);
      process.exit(brResult.exitCode);
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
      console.log('UpUp v2026.6.12');
      process.exit(0);
      break;

    default: {
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      // Start interactive CLI with resume context
      const { getPiNativeApp } = await import('@upup/pi-app/default');
      const { runCli } = await import('@upup/pi-tui-app');
      const app = getPiNativeApp();
      app.getInvestmentWorkflow();
      await runCli({
        resumeTarget: resumeTarget ?? undefined,
        continue: shouldContinue,
        fork: shouldFork,
        stream: app.getTuiEventStream().stream,
        runtime: app.getTuiRuntime(),
        capabilities: app.getCommandCapabilities(),
      });
    }
  }
}

function printHelp() {
  console.log(`
UpUp - AI Agent for Deep Financial Research

Usage:
  upup                    Start interactive CLI
  upup setup              Run interactive setup wizard
  upup doctor             Run health check
  upup config             Manage configuration
  upup openbuddy          Migrate Pi state into ~/.upup/agent
  upup plugin             Manage Pi packages (install/list/uninstall/update)
  upup help               Show this help message
  upup version            Show version

Diagnostics:
  upup --trace            Print per-turn context payload + Pi startup timings
                          (add UPUP_TRACE_TOOLS=1 for the active tool list)

Config Commands:
  upup config get <key>      Get a config value
  upup config set <key> <value>  Set a config value
  upup config list           List all config values
  upup config status         Show validation status
  upup config sources        Show config sources
  upup config export         Export config to file
  upup config import <file>  Import config from file
  upup config backup         Backup current config
  upup openbuddy             Migrate Pi agent state into ~/.upup/agent
  upup openbuddy status      Preview migration
  upup openbuddy migrate     Copy settings.json + themes from Pi to ~/.upup/agent
  upup openbuddy verify      Verify migrated ~/.upup/agent
  upup plugin                Manage Pi packages (install/list/uninstall/update)

Session Commands:
  upup openbuddy migrate           Migrate from ~/.pi/agent (or $UPUP_MIGRATE_FROM)
  upup plugin install npm:@x/y    Install a Pi package (npm/git/local path)
  upup plugin list                 List configured Pi packages
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

Protocol Modes:
  upup --stdio                 JSON-RPC 2.0 over stdio (UpUp-native method names)
  upup --acp                   Same transport, ACP method names (session/new, session/load, session/prompt)
                               and ACP session/update notifications. Auto-detected: any ACP method name
                               switches the session into ACP mode even without the flag.

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
