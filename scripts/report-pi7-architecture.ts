import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PI_CAPABILITY_CATALOG, validatePiCapabilityCatalog, UPUP_ECOSYSTEM_PACKAGES } from '@upup/pi-runtime';
import { listPiSkillCommands } from '@upup/pi-resource-composition';
import { findSideEffectCoverageGaps, REQUIRED_SIDE_EFFECTS, readWorkspaceManifests } from './check-pi-side-effects.ts';

const root = process.cwd();
const srcRoot = resolve(root, 'src');
const packagesRoot = resolve(root, 'packages');

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : /\.(ts|tsx|mts|cts)$/.test(entry.name) ? [path] : [];
  });
}

function production(files: readonly string[]): string[] {
  return files.filter((file) => !/\.(test|spec)\.(ts|tsx)$/.test(file));
}

function lineCount(file: string): number {
  return readFileSync(file, 'utf8').split('\n').length;
}

const srcFiles = walk(srcRoot);
const srcProduction = production(srcFiles);
const packageDirectories = readdirSync(packagesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
const packages = packageDirectories.map((entry) => {
  const directory = join(packagesRoot, entry.name);
  const manifestPath = join(directory, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown> : {};
  const pi = manifest.pi && typeof manifest.pi === 'object' ? manifest.pi as Record<string, unknown> : undefined;
  const resources = pi
    ? Object.fromEntries(['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals'].map((key) => [key, Array.isArray(pi[key]) ? (pi[key] as unknown[]).length : 0]))
    : {};
  const resourceCount = Object.values(resources).reduce((total, count) => total + count, 0);
  const toolNames = pi && Array.isArray(pi.tools) ? pi.tools : [];
  const sideEffects = pi && Array.isArray(pi.sideEffects) ? pi.sideEffects : [];
  return {
    name: typeof manifest.name === 'string' ? manifest.name : `@upup/${entry.name}`,
    version: typeof manifest.version === 'string' ? manifest.version : undefined,
    workspace: entry.name,
    // A `pi` block alone is a declaration, not an implementation: peripheral
    // packages declare one with zero resources and zero tools. Only packages
    // that actually ship a Pi resource, tool or side-effect declaration are
    // counted as Pi-native.
    piManifestDeclared: pi !== undefined,
    piNative: pi !== undefined && (resourceCount > 0 || toolNames.length > 0 || sideEffects.length > 0),
    resources,
    hostCapabilities: pi && Array.isArray(pi.hostCapabilities) ? pi.hostCapabilities : [],
    tools: pi && Array.isArray(pi.tools) ? pi.tools : [],
    nativeTools: pi && Array.isArray(pi.nativeTools) ? pi.nativeTools : [],
    capabilities: pi && Array.isArray(pi.capabilities) ? pi.capabilities : [],
  };
});
const sideEffectCoverageGaps = findSideEffectCoverageGaps(readWorkspaceManifests(root));
validatePiCapabilityCatalog(PI_CAPABILITY_CATALOG);
const declaredCapabilities = packages.flatMap((pkg) => (pkg.capabilities as readonly { name?: unknown }[]).map((capability) => ({ packageName: pkg.name, capability: capability.name })));
const catalogCapabilityNames = new Set(PI_CAPABILITY_CATALOG.map((capability) => capability.name));

const productionWorkspaceFiles = [...srcProduction, ...production(walk(packagesRoot))];
const legacyEventConsumers = srcProduction.filter((file) => /legacy-events/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const globalRegistryConsumers = productionWorkspaceFiles.filter((file) => /__upup(PiHosts|AgentPorts)/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const agentSessionFactories = productionWorkspaceFiles.filter((file) => /createAgentSession\(/.test(readFileSync(file, 'utf8'))).map((file) => relative(root, file));
const rootDomains = readdirSync(srcRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => {
  const files = walk(join(srcRoot, entry.name));
  const productionFiles = production(files);
  return { directory: `src/${entry.name}`, productionFiles: productionFiles.length, testFiles: files.length - productionFiles.length, productionLines: productionFiles.reduce((total, file) => total + lineCount(file), 0) };
});

/**
 * Skill reachability: Pi loads skills from Pi package manifests, from the
 * `agent-skills` convention (`<project>/.agents/skills`, `~/.agents/skills`) and
 * from explicit additional paths. Reporting the split keeps the documented
 * numbers honest — `.claude/skills` is not a Pi source.
 */
async function readSkillReachability(): Promise<Record<string, unknown>> {
  try {
    const commands = await listPiSkillCommands(root);
    const repoPrefix = `${root}/`;
    let repoSkills = 0;
    let externalSkills = 0;
    for (const command of commands) {
      const path = (command as { filePath?: string }).filePath;
      if (typeof path !== 'string') continue;
      if (path.startsWith(repoPrefix)) repoSkills += 1;
      else externalSkills += 1;
    }
    return { total: commands.length, repoSkills, externalSkills };
  } catch (error) {
    return { unavailable: error instanceof Error ? error.message : 'unknown error' };
  }
}



async function readMcpServerStatus(): Promise<Record<string, unknown>> {
  const mcpServerIndex = resolve(root, 'packages/mcp-server/src/index.ts');
  const mcpServerTools = resolve(root, 'packages/mcp-server/src/tools.ts');
  if (!existsSync(mcpServerIndex) || !existsSync(mcpServerTools)) {
    return { contract: 'upup.pi.mcp-server.v1', available: false, reason: 'packages/mcp-server not installed' };
  }
  try {
    const importer = new Function('s', 'return import(s)') as (s: string) => Promise<{ UPUP_MCP_TOOLS: readonly { name: string; description: string }[] }>;
    const mod = await importer(resolve(root, 'packages/mcp-server/src/index.ts'));
    const tools = mod.UPUP_MCP_TOOLS ?? [];
    const names = tools.map((t) => t.name);
    return {
      contract: 'upup.pi.mcp-server.v1',
      available: true,
      toolCount: tools.length,
      toolNames: names,
      readOnly: !names.some((n) => /place_trade_order|config_set|write_file/.test(n)),
      namespace: 'upup_finance__',
      coveragePercent: Math.round((names.length / 7) * 10000) / 100,
      notes: 'Tools are intentionally read-only; financial-write operations stay behind Pi policy.',
    };
  } catch (error) {
    return { contract: 'upup.pi.mcp-server.v1', available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}


async function readFinanceSubagentStatus(): Promise<Record<string, unknown>> {
  try {
    const importer = new Function('s', 'return import(s)') as (s: string) => Promise<{
      UPUP_FINANCE_SUBAGENT_DEFAULTS: readonly { name: string; description: string }[];
    }>;
    const mod = await importer(resolve(root, 'packages/pi-runtime/src/finance-subagents.ts'));
    const defaults = mod.UPUP_FINANCE_SUBAGENT_DEFAULTS ?? [];
    return {
      contract: 'upup.pi.finance-subagents.v1',
      registered: defaults.length,
      agents: defaults.map((a) => ({ name: a.name, description: a.description.slice(0, 80) })),
      integration: 'pi-subagents registerAgent()',
      notes: 'bull/bear/synthesizer/risk default set; SOPs can override via .upup/sops/*.yaml',
    };
  } catch (error) {
    return { contract: 'upup.pi.finance-subagents.v1', unavailable: error instanceof Error ? error.message : 'unknown' };
  }
}

async function readEcosystemStatus(): Promise<Record<string, unknown>> {
  const nodeModules = join(root, 'node_modules');
  const entries = await Promise.all(UPUP_ECOSYSTEM_PACKAGES.map(async (spec) => {
    const manifestPath = join(nodeModules, spec.name, 'package.json');
    let installedVersion: string | null = null;
    let installs = false;
    let mounts = false;
    let mountError: string | null = null;
    if (existsSync(manifestPath)) {
      try {
        const json = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: string };
        installedVersion = typeof json.version === 'string' ? json.version : null;
        installs = true;
      } catch {
        installs = false;
      }
    }
    if (installs && installedVersion === spec.version) {
      try {
        const importer = new Function('s', 'return import(s)') as (s: string) => Promise<{ default?: unknown }>;
        const mod = await importer(spec.importPath);
        if (typeof mod.default === 'function') {
          const sink: Record<string, unknown> = {};
          const stub: any = new Proxy(sink, {
            get: (_, prop) => {
              if (prop === 'events') return { on: () => undefined };
              if (prop === 'getFlag') return () => undefined;
              if (prop === 'getSessionName') return () => undefined;
              if (prop === 'getActiveTools') return () => [];
              if (prop === 'getAllTools') return () => [];
              if (prop === 'getCommands') return () => [];
              if (prop === 'getThinkingLevel') return () => 'medium' as const;
              if (prop === 'setModel') return async () => true;
              if (prop === 'exec') return async () => '';
              return () => undefined;
            },
          });
          (mod.default as (pi: unknown) => void)(stub);
          mounts = true;
        } else {
          mountError = `default export is ${typeof mod.default}`;
        }
      } catch (error) {
        mountError = error instanceof Error ? error.message.split('\n')[0] : String(error);
      }
    }
    return {
      name: spec.name,
      version: spec.version,
      installedVersion,
      versionMatches: installedVersion === spec.version,
      mounts,
      mountError,
      category: spec.category,
      supersedes: spec.supersedes ?? [],
    };
  }));
  const verified = entries.filter((e) => e.versionMatches && e.mounts).length;
  return {
    contract: 'upup.pi.ecosystem.v1',
    registryCount: UPUP_ECOSYSTEM_PACKAGES.length,
    verifiedCount: verified,
    coveragePercent: Math.round((verified / UPUP_ECOSYSTEM_PACKAGES.length) * 10000) / 100,
    packages: entries,
  };
}

const structuralCompletion = [
  legacyEventConsumers.length === 0,
  globalRegistryConsumers.length === 0,
  agentSessionFactories.length === 1,
  packages.every((pkg) => !pkg.name.startsWith('@upup/pi-') || pkg.piNative),
  srcProduction.filter((file) => /src\/runtime\/pi/.test(file)).length <= 12,
];
const progressPercent = Math.round((structuralCompletion.filter(Boolean).length / structuralCompletion.length) * 10000) / 100;


async function readInProcessSdkStatus(): Promise<Record<string, unknown>> {
  const sdkIndex = resolve(root, 'packages/sdk/src/index.ts');
  const sdkHandle = resolve(root, 'packages/sdk/src/handle.ts');
  const sdkTypes = resolve(root, 'packages/sdk/src/types.ts');
  const sdkExample = resolve(root, 'packages/sdk/src/examples/rpc-client.ts');
  const sdkTest = resolve(root, 'packages/sdk/test/sdk.test.ts');
  const present = existsSync(sdkIndex) && existsSync(sdkHandle) && existsSync(sdkTypes) && existsSync(sdkExample) && existsSync(sdkTest);
  if (!present) return { contract: 'upup.pi.sdk.v1', available: false, reason: 'packages/sdk not installed' };
  // Read the 7 profile ids from default-specs.ts as a smoke check.
  try {
    const source = readFileSync(resolve(root, 'packages/sdk/src/default-specs.ts'), 'utf8');
    const profileBlock = source.match(/UPUP_SDK_PROFILES[^{]*=\s*{([\s\S]*?)}\s*;/);
    const profiles = profileBlock
      ? [...profileBlock[1].matchAll(/^ {2}(?:'([a-z\-]+)'|([a-z\-]+)):\s*\{/gm)].flatMap((m) => [m[1] ?? m[2]].filter(Boolean))
      : [];
    return {
      contract: 'upup.pi.sdk.v1',
      available: true,
      profiles,
      profileCount: profiles.length,
      rpcDemo: 'packages/sdk/src/examples/rpc-client.ts',
      notes: 'Black-box SDK over PiAgentSessionFactory; TradingAgents / Codex / Claude Code can drive UpUp in-process.',
    };
  } catch (error) {
    return { contract: 'upup.pi.sdk.v1', available: false, reason: error instanceof Error ? error.message : String(error) };
  }
}


async function readTuiWidgetsStatus(): Promise<Record<string, unknown>> {
  const widgetsPath = resolve(root, 'packages/pi-runtime/src/extensions/tui-widgets.ts');
  if (!existsSync(widgetsPath)) {
    return { contract: 'upup.pi.tui-widgets.v1', available: false, reason: 'tui-widgets.ts missing' };
  }
  const source = readFileSync(widgetsPath, 'utf8');
  const hasWatchlist = /class WatchlistWidget/.test(source);
  const hasFooter = /class PlanFooter/.test(source);
  const hasSetWidget = /setWidget\(/.test(source);
  const hasSetFooter = /setFooter\(/.test(source);
  return {
    contract: 'upup.pi.tui-widgets.v1',
    available: hasWatchlist && hasFooter,
    watchlistWidget: hasWatchlist,
    planFooter: hasFooter,
    setWidgetUsed: hasSetWidget,
    setFooterUsed: hasSetFooter,
    pattern: 'Pi TUI Pattern 5 (Above/Below Editor) + Pattern 6 (Custom Footer)',
    notes: 'Mounted automatically by @upup/pi-runtime ecosystem-extension so every session (TUI/RPC/stdio) gets the UpUp widgets.',
  };
}


async function readSopWorkflowBridgeStatus(): Promise<Record<string, unknown>> {
  const bridgePath = resolve(root, 'packages/pi-investment-workflow/src/bridge/sop-workflow-bridge.ts');
  if (!existsSync(bridgePath)) {
    return { contract: 'upup.pi.sop-workflow-bridge.v1', available: false, reason: 'sop-workflow-bridge.ts missing' };
  }
  const source = readFileSync(bridgePath, 'utf8');
  return {
    contract: 'upup.pi.sop-workflow-bridge.v1',
    available: /registerWorkflowResource/.test(source) && /buildUpUpSopScript/.test(source),
    api: 'pi-subagents registerWorkflowResource',
    resourceNaming: 'upup-sop__<sopId>',
    versionHashing: 'FNV-style hash of sop.version -> positive safe integer',
    hostCommand: 'upup-sop',
    notes: 'Each UpUp SOP becomes a Pi workflow resource; TradingAgents / Codex can call workflow.run("upup-sop__graham", {ticker}).',
  };
}



async function readWebUiStatus(): Promise<Record<string, unknown>> {
  const piWebUiPkg = (() => {
    try {
      const fs = require('node:fs') as typeof import('node:fs');
      const path = require('node:path') as typeof import('node:path');
      const lockPath = resolve(root, 'bun.lock');
      if (!fs.existsSync(lockPath)) return null;
      const text = fs.readFileSync(lockPath, 'utf8');
      // bun.lock uses `"pi-web-ui": ["pi-web-ui@0.88.0", ...]` format.
      const match = text.match(/"pi-web-ui":\s*\["pi-web-ui@([0-9.]+)"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  })();
  return {
    contract: 'upup.pi.web-ui.v1',
    available: piWebUiPkg !== null,
    piWebUiVersion: piWebUiPkg,
    entryPoint: 'upup web',
    notes: '`upup web` subcommand spawns pi-web-ui (Pi official web UI) with UpUp-tuned cwd + port + data-dir.',
  };
}


async function readMcpHttpTransportStatus(): Promise<Record<string, unknown>> {
  const transportPath = resolve(root, 'packages/mcp-server/src/http-transport.ts');
  if (!existsSync(transportPath)) {
    return { contract: 'upup.pi.mcp-http-transport.v1', available: false };
  }
  const source = readFileSync(transportPath, 'utf8');
  return {
    contract: 'upup.pi.mcp-http-transport.v1',
    available: /handleStatelessStreamableHttp/.test(source) && /buildAuthGate/.test(source),
    mode: 'stateless (each request = fresh transport + server)',
    auth: 'Bearer token (UPUP_MCP_TOKEN env or --token flag)',
    transport: 'StreamableHTTPServerTransport',
    cli: 'upup-mcp serve --transport http [--port 8765] [--token <bearer>]',
    notes: 'Remote TradingAgents / Codex hosts can hit UpUp over plain HTTP without a stdio channel.',
  };
}


console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  baseline: {
    workspacePackages: packages.length,
    piManifestDeclaredPackages: packages.filter((pkg) => pkg.piManifestDeclared).length,
    piNativePackages: packages.filter((pkg) => pkg.piNative).length,
    rootSourceFiles: srcFiles.length,
    rootProductionFiles: srcProduction.length,
    rootProductionLines: srcProduction.reduce((total, file) => total + lineCount(file), 0),
  },
  packages,
  rootDomains,
  migrationDebt: { legacyEventConsumers, globalRegistryConsumers, agentSessionFactories },
  sideEffects: {
    requiredDeclarations: REQUIRED_SIDE_EFFECTS.length,
    coveragePercent: sideEffectCoverageGaps.length === 0 ? 100 : Math.round(((REQUIRED_SIDE_EFFECTS.length - sideEffectCoverageGaps.length) / REQUIRED_SIDE_EFFECTS.length) * 10000) / 100,
    gaps: sideEffectCoverageGaps,
  },
  capabilityCatalog: {
    contract: 'upup.pi.capabilities.v1',
    descriptors: PI_CAPABILITY_CATALOG,
    declared: declaredCapabilities,
    undeclared: declaredCapabilities.filter(({ capability }) => typeof capability !== 'string' || !catalogCapabilityNames.has(capability)),
  },
  progress: {
    structuralPercent: progressPercent,
    calculatedFrom: ['legacyEventConsumers', 'globalRegistryConsumers', 'agentSessionFactories', 'piManifestCoverage', 'rootRuntimeCompositionFiles'],
    note: 'This is a structural migration indicator, not product completion; provider and full invest-loop evidence remain separate.',
  },
  skills: await readSkillReachability(),
  ecosystem: await readEcosystemStatus(),
  financeSubagents: await readFinanceSubagentStatus(),
  mcpServer: await readMcpServerStatus(),
  sdk: await readInProcessSdkStatus(),
  tuiWidgets: await readTuiWidgetsStatus(),
  sopWorkflowBridge: await readSopWorkflowBridgeStatus(),
  mcpHttpTransport: await readMcpHttpTransportStatus(),
  webUi: await readWebUiStatus(),
  rootAllowlist: ['src/index.tsx', 'src/bootstrap/**'],
}, null, 2));
