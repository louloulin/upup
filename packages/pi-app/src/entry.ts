#!/usr/bin/env bun
import { config } from 'dotenv';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { printUpupBrandLine, printUpupBanner } from './banner';
import { ensureUpupAgentDir } from './bootstrap-agent';

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

  // Point Pi at UpUp's canonical home (~/.upup/agent) and bootstrap it.
  // `ensureUpupAgentDir` resolves the dir, publishes it as
  // PI_CODING_AGENT_DIR (which Pi's config.ts#getAgentDir() reads at module
  // init), seeds a fresh home from a previous `~/.pi/agent` install and
  // installs the UpUp theme. It must run BEFORE any dynamic
  // import("@earendil-works/pi-*") so Pi sees the right agent dir.
  ensureUpupAgentDir();

  // Pi native stdio: --stdio / --acp delegate to Pi's `main()` with --mode rpc,
  // which routes stdin/stdout to Pi's runRpcMode (JSON-RPC envelope). The ACP
  // subset (session/new, session/load, session/prompt) maps onto the same
  // RpcCommand surface Pi uses for editor integrations.
  if (args.includes('--stdio') || args.includes('--acp')) {
    const { main } = await import('@earendil-works/pi-coding-agent');
    // `--stdio` / `--acp` are UpUp selectors, not Pi flags: strip them before
    // handing argv to Pi's parser, which rejects unknown options.
    const forwarded = args.filter((arg) => arg !== '--stdio' && arg !== '--acp');
    const rpcArgs = ['--mode', 'rpc', ...forwarded];
    await main(rpcArgs);
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

  // Handle session resume flags before command switch
  const resumeTarget = getFlag(['-r', '--resume']);
  const shouldContinue = hasFlag(['-c', '--continue']);
  const shouldFork = hasFlag(['--fork-session']);

  switch (command) {
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
      const plResult = await runPluginCommand({ command: plSub as 'install' | 'list' | 'uninstall' | 'update' | 'reload' | 'recommend' | 'enable' | 'disable' | 'help', args: plSubArgs });
      process.exit(plResult.exitCode);
      break;

    case 'invest':
      // Headless `/invest` runner — drives the same 5-phase workflow the
      // TUI exposes via the `/invest` slash command, but without needing
      // an interactive session. `upup invest 600519.SH [intent]` calls
      // `app.getInvestmentWorkflow().runInvest(...)` under the hood.
      const { runInvestCommand } = await import('@upup/pi-cli-bootstrap');
      const invResult = await runInvestCommand({ args: args.slice(1) });
      process.stdout.write(`${invResult.output}\n`);
      process.exit(invResult.exitCode);
      break;

    case 'sop':
      // Headless `/sop` — same catalog the TUI exposes (`/sop list|show|install|
      // uninstall|new`). Installs always land under `$UPUP_HOME/sops`
      // (default `~/.upup/sops`), never in a package directory.
      const { runSopCommandCli } = await import('@upup/pi-cli-bootstrap');
      const sopResult = await runSopCommandCli({ args: args.slice(1) });
      process.stdout.write(`${sopResult.output}\n`);
      process.exit(sopResult.exitCode);
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
      printHelpFor(args[1]);
      process.exit(0);
      break;

    case 'version':
    case '--version':
    case '-v':
      printUpupBrandLine();
      process.exit(0);
      break;

    default: {
      if (command && !command.startsWith('-')) {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      // Pi native: delegate to Pi's main() — InteractiveMode, autocomplete,
      // slash commands, keybindings, theme selector, and the extension-host
      // boundary all come from there. UpUp's own Pi packages are handed to Pi
      // as explicit `-e` extension paths by `runPiNativeCli`, because Pi's
      // package-manager only resolves npm:/git:/real local sources.
      const { runPiNativeCli } = await import('./pi-native-cli');
      // `runPiNativeCli` is the single owner of the UpUp brand banner;
      // printing again here would double-stamp the screen. The banner is
      // written to stderr before Pi's InteractiveMode takes over the TTY;
      // in piped runs the banner still surfaces in CI logs and `script(1)`
      // recordings.
      const widthRaw = getFlag(['--width', '-W']);
      const heightRaw = getFlag(['--height', '-H']);
      const terminalSize =
        widthRaw !== undefined || heightRaw !== undefined
          ? {
              ...(widthRaw !== undefined
                ? { columns: Math.max(20, Number.parseInt(widthRaw, 10) || 80) }
                : {}),
              ...(heightRaw !== undefined
                ? { rows: Math.max(10, Number.parseInt(heightRaw, 10) || 24) }
                : {}),
            }
          : undefined;
      await runPiNativeCli({
        resumeTarget: resumeTarget ?? undefined,
        continue: shouldContinue,
        fork: shouldFork,
        // `--no-extensions` / `-ne` disables Pi extension discovery. Used as
        // a recovery hatch when a user-installed npm extension in
        // `~/.upup/agent/npm/` fails to load (mismatched zod locales, etc.).
        // UpUp's own extensions arrive as explicit `-e` paths, which Pi's
        // resource loader keeps even with this flag, so the agent retains its
        // full finance tool surface.
        noExtensions: args.includes('--no-extensions') || args.includes('-ne'),
        ...(terminalSize && terminalSize.columns !== undefined && terminalSize.rows !== undefined ? { terminalSize: { columns: terminalSize.columns, rows: terminalSize.rows } } : {}),
      });
    }
  }
}

const PER_COMMAND_HELP: Readonly<Record<string, string>> = {
  login: `Login — interactive credential configuration inside the TUI.

Once the TUI is running (\`upup\` with no arguments):

  /login <provider>      Configure credentials for <provider>.
                         Examples: /login minimax, /login openai,
                                   /login github-copilot
  /logout <provider>     Remove credentials for <provider>.
  /login                 List providers with stored credentials.

Credentials are persisted to ~/.upup/agent/auth.json (mode 0600). Every
headless surface in UpUp (eval / print / cron / gateway / bridge) reads this
file via @upup/utils/env mergeAuthJsonIntoProcessEnv, so /login is the
canonical place to set up credentials — no separate upup setup step needed
unless you want to also pick a default provider + model.
`,
  sop: `upup sop — headless SOP (投资方法论) management.

  upup sop list                          List built-in + user SOPs
  upup sop show <id>                     Print one SOP's phase graph
  upup sop sources                       Show where each SOP was loaded from
  upup sop check                         Validate every SOP against the agent catalog
  upup sop agents                        List built-in + user-defined agents
  upup sop install <source> [--force]    Install a SOP
  upup sop uninstall <id>                Remove an installed SOP
  upup sop new <id>                      Scaffold a new methodology

Sources accepted by \`install\`:
  https://example.com/my-sop.yaml        remote YAML
  ./sops/local.yaml                      local file
  ./team-sops/                           local directory (batch)
  builtin:graham                         copy a built-in SOP so you can edit it
  graham                                 bare built-in id shorthand

Installs land under the UpUp home root — \`$UPUP_HOME/sops\` when UPUP_HOME is
set, otherwise \`~/.upup/sops\` — and project-scope installs (\`--project\`) land
in \`<cwd>/.upup/sops\`. Nothing is ever written into the package directory, so
the same commands work in CI and sandboxed installs. Existing files are kept
unless \`--force\` is passed. Run a SOP with \`upup invest --sop <id> <TICKER>\`.
`,
  doctor: `upup doctor — health check for UpUp + Pi runtime.

  upup doctor

Checks:
  • Config valid           ~/.upup/settings.json schema
  • Provider / Model       from .upup/settings.json
  • API keys               for every Pi catalog provider, reading from
                           ~/.upup/agent/auth.json (Pi /login store),
                           ~/.upup/.env, and cwd .env
  • Pi packages installed  @earendil-works/pi-agent-core, pi-ai,
                           pi-coding-agent, pi-tui
  • settings.json + auth.json + settings.d/ existence
  • Config source attribution (where every value came from)

Exit code is always 0; the report is read-only.
`,
};

function printHelpFor(subcommand?: string): void {
  if (subcommand && Object.prototype.hasOwnProperty.call(PER_COMMAND_HELP, subcommand)) {
    console.log(PER_COMMAND_HELP[subcommand]);
    return;
  }
  printHelp();
}

function printHelp() {
  console.log(`
UpUp - AI Agent for Deep Financial Research

Usage:
  upup                    Start interactive CLI (uses ~/.upup/agent/auth.json)
  upup doctor             Run health check
  upup invest <TICKER> [intent]
                         Headless /invest runner — drives the canonical 5-phase
                         workflow (detect → plan → execute → verify → report)
                         without needing an interactive TUI.
  upup sop <list|show|install|uninstall|new>
                         Headless SOP (投资方法论) management. Installs land in
                         $UPUP_HOME/sops (default ~/.upup/sops).
  upup config             Manage configuration (~/.upup/settings.json)
  upup openbuddy          Migrate Pi state into ~/.upup/agent
  upup plugin             Manage Pi packages (install/list/uninstall/update)
  upup help               Show this help message
  upup version            Show version

Authentication:
  Inside the TUI, run \`/login <provider>\` to configure credentials. This is the
  canonical flow (including OAuth for GitHub Copilot / OpenAI Codex / Kimi Coding
  / X.AI / etc) and writes to ~/.upup/agent/auth.json. Headless surfaces
  (eval / print / cron / gateway / bridge) automatically see the credentials
  via the auth.json merge performed in \`@upup/utils/env\`.

Diagnostics:
  upup --trace            Print per-turn context payload + Pi startup timings
                          (add UPUP_TRACE_TOOLS=1 for the active tool list)
  upup --width N [-W N]   Force a fixed TUI width  (default: auto-detect, env: COLUMNS)
  upup --height N [-H N]  Force a fixed TUI height (default: auto-detect, env: LINES)

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

Per-command help:
  upup help login        Show how to use \`/login\` inside the TUI
  upup help doctor       Show what \`upup doctor\` checks
`);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
