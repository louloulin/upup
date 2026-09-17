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

import { UpUpMcpServer } from './server';

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

  const server = new UpUpMcpServer();

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

Tools exposed under the \`upup_finance__\` namespace (read-only by design):
  upup_finance__get_stock_price         Real-time price snapshot (CN/HK/US)
  upup_finance__get_key_ratios          Key financial ratios (P/E, P/B, ROE)
  upup_finance__get_company_profile     Company name / exchange / sector
  upup_finance__get_filings             SEC / exchange filings list
  upup_finance__get_astock_news         A-share announcements + 7x24 headlines
  upup_finance__get_astock_financials   A-share financial snapshot
  upup_finance__list_investment_strategies  Built-in SOP / strategy catalog

Configuration: reads ~/.upup/settings.json for provider / model selection the
same way the rest of UpUp does. No additional flags.

See docs/upup-developer-guide.md §9.3 for cross-platform exposure details.
`);
}

await main();
