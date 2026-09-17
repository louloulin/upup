#!/usr/bin/env bun
/**
 * UpUp MCP CLI — `upup-mcp` / `upup mcp serve`.
 *
 * Tiny entry point that constructs an `UpUpMcpServer` and runs it on stdio.
 * Stays in `src/cli.ts` so the package stays runnable from source via Bun
 * (`bun run @upup/mcp-server/cli`) and from the compiled binary via Node
 * (`node dist/cli.js`) — the `package.json` `bin` field wires both.
 *
 * The CLI is intentionally minimal: no flags, no auth handling, no
 * observability. MCP clients own the auth negotiation (the UpUp finance
 * tools read `~/.upup/settings.json` directly, the same way the rest of
 * UpUp does). For local development, run:
 *
 *     $ upup-mcp serve             # stdio (default)
 *     $ bun run packages/mcp-server/src/cli.ts serve
 *
 * TradingAgents / Claude Code register the server in their config like:
 *
 *     {
 *       "mcpServers": {
 *         "upup-finance": { "command": "upup-mcp", "args": ["serve"] }
 *       }
 *     }
 */

import { createPiNativeMcpServer } from './server';

async function main(): Promise<void> {
  const subcommand = process.argv[2] ?? 'serve';
  if (subcommand !== 'serve') {
    if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
      printHelp();
      process.exit(0);
    }
    process.stderr.write(`upup-mcp: unknown subcommand "${subcommand}"\n`);
    printHelp();
    process.exit(1);
  }

  // Build from UpUp's Pi packages: every finance tool a Pi session sees
  // becomes an MCP tool, with the mutating subset removed via each package's
  // `pi.sideEffects` declaration. Falls back to the hand-written catalog when
  // no Pi package mounts (see `createPiNativeMcpServer`).
  const server = await createPiNativeMcpServer();
  const catalog = server.piCatalogReport();
  if (catalog) {
    process.stderr.write(
      `upup-mcp: Pi catalog — ${catalog.packagesLoaded.length} package(s) mounted, `
      + `${catalog.toolsExposed}/${catalog.toolsDeclared} tools exposed, `
      + `${catalog.blockedBySideEffect.length} withheld by pi.sideEffects`
      + `${catalog.packagesFailed.length > 0 ? `, ${catalog.packagesFailed.length} failed` : ''}\n`,
    );
    for (const failure of catalog.packagesFailed) {
      process.stderr.write(`upup-mcp:   ! ${failure.name}: ${failure.error}\n`);
    }
  }

  // Graceful shutdown — MCP clients (Claude Code, TradingAgents) routinely
  // send SIGTERM on exit; tearing down the transport cleanly keeps their
  // session bookkeeping accurate.
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    process.stderr.write(`upup-mcp: received ${signal}, shutting down\n`);
    try {
      await server.close();
    } finally {
      process.exit(0);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  process.stderr.write(
    `upup-mcp: serving ${server.toolCount()} tools on stdio (namespace upup_finance__)\n`,
  );
  await server.runStdio();
}

function printHelp(): void {
  process.stdout.write(`upup-mcp — UpUp finance MCP server

Usage:
  upup-mcp serve [--transport stdio|http] [--port 8765] [--host 127.0.0.1] [--token <bearer>]
                        Start the MCP server (default stdio; TradingAgents / Claude Code entry point)
  upup-mcp help            Print this help

Environment:
  UPUP_MCP_TOKEN           Optional bearer token (HTTP transport only).

Tools are bridged from UpUp's Pi packages and namespaced
\`upup_finance__<pi_tool_name>\` — quotes, technicals, fundamentals, filings,
news, screening, valuation (DCF/DDM/target price), risk metrics, portfolio
attribution, factor research, backtests and corporate actions. The list is
whatever the mounted Pi packages register, so it tracks the Pi surface instead
of a hand-maintained subset. Run \`upup-mcp serve\` and read the stderr catalog
line for the exact count.

Mutating tools are withheld: every Pi package declares its write / network /
credential / financial-effect tools in \`pi.sideEffects\`, and the bridge drops
exactly those. Use the Pi RPC / SDK paths for orders, config and file writes so
the Pi policy layer can apply approval.

Configuration: reads ~/.upup/settings.json for provider / model selection the
same way the rest of UpUp does. No additional flags.

See docs/upup-developer-guide.md §9.3 for cross-platform exposure details.
`);
}

await main();
