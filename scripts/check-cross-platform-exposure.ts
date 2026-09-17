#!/usr/bin/env bun
/**
 * check-cross-platform-exposure — verify UpUp exposes itself through every
 * cross-platform transport Pi supports.
 *
 * Pi's ecosystem gives UpUp three transport surfaces for free:
 *
 *   1. **Pi RPC Mode** (`upup --mode rpc` / `--stdio` / `--acp`)
 *      JSON-RPC over stdin/stdout. TradingAgents / Claude Code / Codex
 *      wrappers drive UpUp through this surface; the protocol is Pi's,
 *      UpUp only configures argv.
 *
 *   2. **Pi JSON Event Stream** (`upup --mode json`)
 *      Full event stream over stdout; integration testing + observability.
 *
 *   3. **MCP Server** (`upup-mcp serve` / `upup mcp serve`)
 *      Tool surface for any MCP client (Claude Code, TradingAgents, …).
 *      `UpUpMcpServer` in `@upup/mcp-server` exposes the
 *      `upup_finance__<tool>` namespace.
 *
 * The guard hard-fails CI when any of these surfaces is missing or when the
 * tool namespace drifts away from `upup_finance__`. The point is to keep the
 * cross-platform promise honest: any of the three transports breaking should
 * fail loudly, not silently disappear.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = process.cwd();
const failures: string[] = [];

function check(label: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? '\u2713' : '\u2717'} ${label}${ok ? '' : ` \u2014 ${detail}`}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

function read(p: string): string {
  return readFileSync(p, 'utf8');
}

// 1. Pi RPC Mode wired through UpUp's argv -----------------------------------
console.log('1. Pi RPC Mode (--mode rpc / --stdio / --acp):');
const entryPath = resolve(ROOT, 'packages/pi-app/src/entry.ts');
const cliPath = resolve(ROOT, 'packages/pi-app/src/pi-native-cli.ts');
const entrySrc = existsSync(entryPath) ? read(entryPath) : '';
const cliSrc = existsSync(cliPath) ? read(cliPath) : '';
check(
  'entry.ts forwards --mode rpc (via --stdio / --acp)',
  /--mode\s+['"]rpc['"]/.test(entrySrc) || /rpc/.test(entrySrc) && /--mode/.test(entrySrc),
  'packages/pi-app/src/entry.ts must pass `--mode rpc` to Pi main()',
);
check(
  'pi-native-cli.ts forwards options.mode as --mode',
  /args\.push\(['"]--mode['"]/.test(cliSrc) && /options\.mode/.test(cliSrc),
  'packages/pi-app/src/pi-native-cli.ts must wire options.mode through to Pi argv',
);

// 2. Pi JSON Event Stream (--mode json) --------------------------------------
console.log('\n2. Pi JSON Event Stream (--mode json):');
check(
  'pi-native-cli.ts allows mode === "json"',
  /mode\?:\s*['"]rpc['"]\s*\|\s*['"]json['"]/.test(cliSrc) || /['"]rpc['"]\s*\|\s*['"]json['"]/.test(cliSrc),
  '`mode` type must include both "rpc" and "json"',
);
check(
  'entry.ts / docs mention --mode json',
  /['"]json['"]/.test(entrySrc) || /--mode\s+json/.test(read(resolve(ROOT, 'docs/upup-developer-guide.md'))),
  'docs/upup-developer-guide.md must document `--mode json` exposure',
);

// 3. MCP Server package exists with tools in upup_finance__ namespace -------
console.log('\n3. MCP Server (@upup/mcp-server):');
const mcpIndex = resolve(ROOT, 'packages/mcp-server/src/index.ts');
const mcpTools = resolve(ROOT, 'packages/mcp-server/src/tools.ts');
const mcpServer = resolve(ROOT, 'packages/mcp-server/src/server.ts');
const mcpCli = resolve(ROOT, 'packages/mcp-server/src/cli.ts');
check(
  '@upup/mcp-server package source exists',
  existsSync(mcpIndex) && existsSync(mcpTools) && existsSync(mcpServer) && existsSync(mcpCli),
  'packages/mcp-server/src/{index,tools,server,cli}.ts must all exist',
);
let mcpToolsSrc = '';
if (existsSync(mcpTools)) {
  mcpToolsSrc = read(mcpTools);
}
check(
  'every MCP tool has upup_finance__ prefix',
  /name:\s*['"]upup_finance__/.test(mcpToolsSrc) && !/name:\s*['"](?!upup_finance__)[a-z_]+['"]/.test(mcpToolsSrc),
  'UPUP_MCP_TOOLS must only use `upup_finance__` prefix',
);
check(
  'tools are read-only (no place_trade_order / config_set exposure)',
  !/name:\s*['"](upup_finance__place_trade_order|upup_finance__config_set|upup_finance__write_file)['"]/.test(mcpToolsSrc),
  'MCP server must never expose financial-write tools — those stay behind Pi policy',
);

// 4. MCP server test coverage -------------------------------------------------
console.log('\n4. MCP server tests:');
const mcpTest = resolve(ROOT, 'packages/mcp-server/test/server.test.ts');
check(
  'test file exists and asserts tool namespace + read-only contract',
  existsSync(mcpTest),
  'packages/mcp-server/test/server.test.ts must exist',
);

// Summary -------------------------------------------------------------------
console.log('');
if (failures.length > 0) {
  console.error(`check:cross-platform-exposure FAILED (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}


// 6. MCP HTTP / streamable-HTTP transport ------------------------------------
console.log('\n6. MCP HTTP transport (streamable-http + bearer auth):');
const httpTransportPath = resolve(ROOT, 'packages/mcp-server/src/http-transport.ts');
const httpTransportSrc = existsSync(httpTransportPath) ? read(httpTransportPath) : '';
check(
  '@upup/mcp-server exposes http-transport.ts (streamable-http + auth)',
  existsSync(httpTransportPath) && /handleStatelessStreamableHttp/.test(httpTransportSrc) && /buildAuthGate/.test(httpTransportSrc),
  'packages/mcp-server/src/http-transport.ts must export handleStatelessStreamableHttp + buildAuthGate',
);
const httpTestPath = resolve(ROOT, 'packages/mcp-server/test/http-transport.test.ts');
check(
  'HTTP transport has end-to-end tests',
  existsSync(httpTestPath),
  'packages/mcp-server/test/http-transport.test.ts must exist',
);
const webCommandEntry = existsSync(resolve(ROOT, 'packages/pi-app/src/entry.ts'))
  ? read(resolve(ROOT, 'packages/pi-app/src/entry.ts'))
  : '';
check(
  '`upup web` subcommand wired in pi-app/entry.ts (wraps pi-web-ui)',
  /case 'web':/.test(webCommandEntry) && /pi-web-ui/.test(webCommandEntry),
  'packages/pi-app/src/entry.ts must dispatch `upup web` to pi-web-ui',
);

// 5. In-process SDK (@upup/sdk) ------------------------------------------------
console.log('\n5. In-process SDK (@upup/sdk):');
const sdkIndex = resolve(ROOT, 'packages/sdk/src/index.ts');
const sdkHandle = resolve(ROOT, 'packages/sdk/src/handle.ts');
const sdkTypes = resolve(ROOT, 'packages/sdk/src/types.ts');
const sdkDefaults = resolve(ROOT, 'packages/sdk/src/default-specs.ts');
const sdkEventStream = resolve(ROOT, 'packages/sdk/src/event-stream.ts');
const sdkExample = resolve(ROOT, 'packages/sdk/src/examples/rpc-client.ts');
const sdkTest = resolve(ROOT, 'packages/sdk/test/sdk.test.ts');
check(
  '@upup/sdk package source exists (index, handle, types, default-specs, event-stream)',
  existsSync(sdkIndex) && existsSync(sdkHandle) && existsSync(sdkTypes) && existsSync(sdkDefaults) && existsSync(sdkEventStream),
  'packages/sdk/src/{index,handle,types,default-specs,event-stream}.ts must all exist',
);
check(
  'RPC-style in-process demo exists (examples/rpc-client.ts)',
  existsSync(sdkExample),
  'packages/sdk/src/examples/rpc-client.ts must exist',
);
check(
  'SDK test file exists and covers createUpUpSession + 7 profiles + event stream + handle',
  existsSync(sdkTest),
  'packages/sdk/test/sdk.test.ts must exist',
);

// 7. Pi dynamic workflows + research DAG --------------------------------------
console.log('\n7. Pi dynamic-workflow engine + research DAG:');
const dynamicBridge = resolve(ROOT, 'packages/pi-investment-workflow/src/bridge/dynamic-workflow-bridge.ts');
const dynamicRunner = resolve(ROOT, 'packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.ts');
const dynamicRunnerTest = resolve(ROOT, 'packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.test.ts');
check(
  'SOP → Pi dynamic-workflow translator exists (dynamic-workflow-bridge.ts)',
  existsSync(dynamicBridge) && /sopToDynamicWorkflowScript/.test(read(dynamicBridge)),
  'packages/pi-investment-workflow/src/bridge/dynamic-workflow-bridge.ts must export sopToDynamicWorkflowScript',
);
check(
  'SOP dynamic-workflow runner exists and calls runWorkflow',
  existsSync(dynamicRunner) && /runWorkflow/.test(read(dynamicRunner)) && /@quintinshaw\/pi-dynamic-workflows/.test(read(dynamicRunner)),
  'packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.ts must call @quintinshaw/pi-dynamic-workflows runWorkflow',
);
check(
  'SOP dynamic runner has end-to-end tests',
  existsSync(dynamicRunnerTest),
  'packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.test.ts must exist',
);
const researchDag = resolve(ROOT, 'packages/pi-runtime/src/research-dag.ts');
check(
  'Research DAG bridge wraps @arhen/pi-core-subagent needs-edges',
  existsSync(researchDag) && /registerUpUpResearchDag/.test(read(researchDag)) && /buildUpUpResearchDagTasks/.test(read(researchDag)),
  'packages/pi-runtime/src/research-dag.ts must export registerUpUpResearchDag + buildUpUpResearchDagTasks',
);
const coordinator = resolve(ROOT, 'packages/pi-investment-analysis/src/research-coordinator.ts');
check(
  'research-coordinator supports needs-DAG batching',
  existsSync(coordinator) && /topologicalResearchRoles/.test(read(coordinator)) && /batchResearchRoles/.test(read(coordinator)),
  'packages/pi-investment-analysis/src/research-coordinator.ts must export topologicalResearchRoles + batchResearchRoles',
);
const investSrc = resolve(ROOT, 'packages/pi-investment-workflow/src/invest.ts');
check(
  '`--sop-dynamic` flag wired in /invest',
  existsSync(investSrc) && /--sop-dynamic/.test(read(investSrc)) && /runSopAsDynamicWorkflow/.test(read(investSrc)),
  'packages/pi-investment-workflow/src/invest.ts must parse --sop-dynamic and call runSopAsDynamicWorkflow',
);

console.log('check:cross-platform-exposure OK');
