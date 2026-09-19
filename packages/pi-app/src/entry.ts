#!/usr/bin/env bun
import { config } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { printUpupBrandLine, printUpupBanner } from './banner';
import { ensureUpupAgentDir } from './bootstrap-agent';
import { applyProperLockfileBunShim } from '@upup/pi-runtime/proper-lockfile-bun-shim';

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

function parseWebFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0 || index + 1 >= args.length) return undefined;
  const value = args[index + 1];
  return value && value.length > 0 ? value : undefined;
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

  // Bun runtime guard for proper-lockfile@4.1.2 + pi-llmgates-provider.
  // Pi's `DefaultResourceLoader.reload()` reads `<agentDir>/settings.json#packages`
  // and dynamically imports each entry (including `@llmgates_api/pi-llmgates-provider`)
  // BEFORE any `extensionFactories` callback runs. By the time the ecosystem
  // extension mounts, pi-llmgates-provider has already captured the original
  // `mtimePrecision.probe` reference at module top-level — so the shim must
  // land here, before the first dynamic `import('@earendil-works/pi-coding-agent')`.
  // Anchors `require.resolve('proper-lockfile')` at pi-llmgates-provider's
  // dist entry so we patch the same module instance it imports (the
  // user-managed copy under `~/.upup/agent/npm/node_modules/`, not Bun's
  // global install cache). See `proper-lockfile-bun-shim.ts` for diagnosis.
  await applyProperLockfileBunShim();

  // ACP (Agent Client Protocol) front-end: editor hosts speak JSON-RPC with
  // ACP method names (`session/new`, `session/prompt`, `session/cancel`) and
  // expect `session/update` notifications while a prompt streams. Pi's own RPC
  // mode uses a different command shape (`{ type: "..." }`), so `--acp` needs
  // the translation layer in `./acp` rather than a plain `--mode rpc` handoff.
  //
  // Must run before the `--stdio` branch below: both flags start a stdio
  // server, but only `--stdio` forwards to Pi's runRpcMode.
  if (args.includes('--acp')) {
    const [{ createAcpServer }, { createPiAcpSessionFactory }] = await Promise.all([
      import('./acp/server'),
      import('./acp/pi-session-port'),
    ]);
    const server = createAcpServer({ sessionFactory: createPiAcpSessionFactory() });
    const shutdown = (): void => { void server.stop().finally(() => process.exit(0)); };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    await server.done;
    process.exit(0);
  }

  // Pi native stdio: --stdio delegates to Pi's `main()` with --mode rpc, which
  // routes stdin/stdout to Pi's runRpcMode.
  if (args.includes('--stdio')) {
    const { main } = await import('@earendil-works/pi-coding-agent');
    // `--stdio` is an UpUp selector, not a Pi flag: strip it before handing
    // argv to Pi's parser, which rejects unknown options.
    const forwarded = args.filter((arg) => arg !== '--stdio');
    const rpcArgs = ['--mode', 'rpc', ...forwarded];
    // Pi's runRpcMode ingests stdin line-by-line, but on EOF it does not
    // always exit promptly — it can keep the loop alive waiting for the
    // next message (especially in fresh `UPUP_HOME` subprocess e2e tests
    // where the `bun install` / heartbeat / background services that
    // bootstrap-agent wires up hold the event loop open even after stdin
    // drains). Editor hosts (Zed, Neovim, custom IDE plugins) close
    // stdin when the LSP/ACP client disconnects, and they expect the
    // subprocess to exit cleanly. Register an explicit EOF handler that
    // exits 0 immediately on stdin EOF, plus a 3-second backup timer so
    // the test harness always observes a clean exit even if `main()` keeps
    // the loop alive for unrelated reasons. Neither path interferes with
    // normal RPC traffic: both fire only after stdin EOF.
    let exited = false;
    const onStdinEnd = (): void => {
      if (exited) return;
      exited = true;
      process.exit(0);
    };
    if (process.stdin.readableEnded) {
      onStdinEnd();
    } else {
      process.stdin.once('end', onStdinEnd);
      process.stdin.once('close', onStdinEnd);
    }
    const backupExit = setTimeout(() => process.exit(0), 3000);
    backupExit.unref();
    await main(rpcArgs);
    if (!exited) process.exit(0);
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

    case 'ecosystem':
      // Curated view over `UPUP_ECOSYSTEM_PACKAGES`. The `upup plugin` command
      // is the general-purpose installer; this one is the diagnostic + bulk
      // installer for the packages UpUp actively wraps. Resolutions go
      // through the dual-scope resolver, so `upup ecosystem list` shows the
      // user / bundled / missing split that decides which package the next
      // session will actually load.
      const { runEcosystemCommand } = await import('@upup/pi-cli-bootstrap');
      const ecoArgs = args.slice(1);
      const ecoSub = ecoArgs[0] || 'help';
      const ecoSubArgs = ecoArgs.slice(1);
      const ecoResult = await runEcosystemCommand({ command: ecoSub, args: ecoSubArgs });
      process.exit(ecoResult.exitCode);
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

    case 'skill':
      // Sprint F4: visualise UpUp-owned skills vs Pi's ambient ~/.agents/skills
      // library that AmbientSkillFilter blocks by default. Lets the user
      // audit which 175 ambient entries are dropped and persist the policy
      // choice in ~/.upup/settings.json so the next session honours it.
      const { runSkillCommand } = await import('@upup/pi-cli-bootstrap');
      const skArgs = args.slice(1);
      const skSub = skArgs[0] || 'help';
      const skSubArgs = skArgs.slice(1);
      const allowedSkillSubs = ['list', 'scope', 'set-policy', 'enable-all', 'disable-all', 'help'] as const;
      if (!(allowedSkillSubs as readonly string[]).includes(skSub)) {
        process.stderr.write(`upup skill: unknown subcommand: ${skSub}\n`);
        const helpResult = await runSkillCommand({ command: 'help', args: [] });
        process.stdout.write(`${helpResult.message}\n`);
        process.exit(1);
      }
      const skResult = await runSkillCommand({
        command: skSub as typeof allowedSkillSubs[number],
        args: skSubArgs,
      });
      process.exit(skResult.exitCode);
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

    case 'web':
      // Spawn the npm-installed @agegr/pi-web (Next.js UI for Pi) under
      // @upup/upup-web's HTTP proxy. The proxy owns /api/upup/* and
      // injects a single <script> tag so the sidecar runs inside the
      // upstream React tree. No source file in @agegr/pi-web is touched.
      {
        const args2 = args.slice(1);
        const publicPort = Number.parseInt(parseWebFlag(args2, '--port') ?? '9000', 10);
        const cwd = parseWebFlag(args2, '--cwd') ?? process.cwd();
        const noBrowser = args2.includes('--no-browser');
        const { startUpUpWeb } = await import('@upup/upup-web');
        try {
          const handle = await startUpUpWeb({
            publicPort: Number.isFinite(publicPort) ? publicPort : 9000,
            upstreamPort: 30141,
            cwd,
            noBrowser,
          });
          process.stderr.write(`upup web: serving on http://127.0.0.1:${handle.publicPort}/ (upstream 127.0.0.1:${handle.upstreamPort}, data ${handle.dataDir})\n`);
          const shutdown = (): void => { void handle.stop().finally(() => process.exit(0)); };
          process.once('SIGINT', shutdown);
          process.once('SIGTERM', shutdown);
          await new Promise<void>(() => {});
        } catch (err) {
          process.stderr.write(`upup web: failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exit(1);
        }
      }
      return;

    case 'mcp':
      // MCP server: `upup mcp serve` (default subcommand = serve).
      // TradingAgents / Claude Code / Codex register this in their
      // `mcpServers` config and consume UpUp's finance tools over stdio.
      // The `upup-mcp` binary is the direct equivalent (no extra flags).
      const mcpSubcommand = args[1] ?? 'serve';
      if (mcpSubcommand === 'serve') {
        const { createPiNativeMcpServer } = await import('@upup/mcp-server');
        const server = await createPiNativeMcpServer();
        const catalog = server.piCatalogReport();
        if (catalog) {
          process.stderr.write(
            `upup mcp: Pi catalog — ${catalog.packagesLoaded.length} package(s), `
            + `${catalog.toolsExposed}/${catalog.toolsDeclared} tools, `
            + `${catalog.blockedBySideEffect.length} withheld by pi.sideEffects\n`,
          );
        }
        const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
          process.stderr.write(`upup mcp: received ${signal}, shutting down\n`);
          try { await server.close(); } finally { process.exit(0); }
        };
        process.once('SIGINT', shutdown);
        process.once('SIGTERM', shutdown);
        process.stderr.write(`upup mcp: serving ${server.toolCount()} tools on stdio (namespace upup_finance__)\n`);
        await server.runStdio();
        return;
      }
      process.stderr.write(`upup mcp: unknown subcommand "${mcpSubcommand}" (try "serve")\n`);
      process.exit(1);
      break;


    case 'rpc':
    case 'json-stream': {
      // Cross-platform RPC server (v2 plan §1.4 + §4.1 + §4.2). Re-uses
      // Pi's `--mode rpc` (JSON-RPC envelope over stdin/stdout) and
      // `--mode json` (event stream) transports verbatim — TradingAgents
      // / Claude Code / Zed / Neovim speak the same protocols. UpUp's
      // finance extensions, /invest workflow, and 36-event adapter are
      // mounted by the same code path the TUI uses (see `runPiNativeCli`).
      const { runPiNativeCli } = await import('@upup/pi-app');
      await runPiNativeCli({
        mode: command === 'rpc' ? 'rpc' : 'json',
        piArgs: args.slice(1),
      });
      return;
    }
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
        // Every Pi-native flag reaches Pi verbatim. UpUp's own selectors
        // (`--stdio` / `--width` / …) are stripped inside
        // `filterForwardablePiArgs`, so `--print`, `--model`, `--provider`,
        // `--thinking`, `--tools`, `--theme`, `--offline` and the rest work
        // exactly as they do under `pi`.
        piArgs: args,
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
  rpc: `upup rpc — cross-platform RPC server (re-uses Pi's --mode rpc).

  upup rpc [--model <id>] [--provider <id>] [--cwd <path>] [--print "..."]

Exposes Pi's JSON-RPC envelope over stdin/stdout. Editor integrations
(Zed, Neovim, custom IDE plugins) and the TradingAgents session layer
speak the same \`RpcCommand\` protocol without any work on UpUp's side.

UpUp's finance tools, /invest workflow, and 36 Pi event adapter are
mounted by the same code path the TUI uses; the RPC host inherits
fail-closed policy defaults (config_set / write_file / mcp_auth_get /
notify / place_trade_order are deny-by-default).

Client side: import \`UpUpRpcClient\` from \`@upup/pi-cli-bootstrap\` (or
\`@upup/sdk\` for the in-process variant). Helpers \`runInvest({ ticker,
sop })\` and \`runSop({ sop, args })\` format the slash-command grammar
automatically; every Pi \`RpcClient\` method is reachable via
\`client.raw.*\`.

See docs/upup-developer-guide.md §9.4 for cross-platform integration
recipes.
`,
  'json-stream': `upup json-stream — cross-platform JSON event stream (re-uses Pi's --mode json).

  upup json-stream [--print "..."] [--model <id>] [--provider <id>]

Writes one JSON object per line to stdout for every Pi canonical event
(session / agent_start / turn_start / message_start / message_update /
message_end / tool_execution_start / tool_execution_end / turn_end /
agent_end / agent_settled / ...). Wire format is identical to TradingAgents
and Claude Code's integration tests; consumer code can grep + jq the output
without bespoke parsing.

Common uses:
  upup json-stream --print "PONG" | jq 'select(.type=="message_end")'
  upup json-stream --provider minimax-cn --model MiniMax-M3 --print "..."

See docs/upup-developer-guide.md §9.4.
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
  upup skill <list|scope|set-policy|enable-all|disable-all|help>
                         Audit AmbientSkillFilter: list UpUp-owned vs ~/.agents/skills
                         ambient skills; persist the userSkills policy (default: exclude).
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
  upup --stdio                 Pi RPC mode: JSONL commands (id + type fields) over stdio
  upup --acp                   Agent Client Protocol over stdio: JSON-RPC method names
                               (initialize, session/new, session/prompt, session/cancel)
                               plus ACP session/update notifications while a prompt streams.

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
