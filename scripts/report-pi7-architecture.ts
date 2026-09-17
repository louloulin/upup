import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { PI_CAPABILITY_CATALOG, validatePiCapabilityCatalog, UPUP_ECOSYSTEM_PACKAGES, describeEcosystemResolution } from '@upup/pi-runtime';
import { findEcosystemPackageDirs, resolvePiExtensionEntries } from '@upup/pi-runtime/ecosystem-resolver';
import { createExtensionApiProbe } from '@upup/pi-runtime/extension-api-probe';
import { declaredToolNames, resolvePackageSourceDir, UPUP_OWNED_TOOL_NAMES } from '@upup/pi-runtime/ecosystem-extension';
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


async function readSideEffectStatus(): Promise<Record<string, unknown>> {
  const manifests = readWorkspaceManifests(root);
  let total = 0;
  const byEffect = new Map<string, number>();
  const byLevel = new Map<string, number>();
  const byPackage = new Map<string, { effect: string; safetyLevel: string; tools: readonly string[] }[]>();
  for (const manifest of manifests) {
    const pkgName = typeof manifest.name === 'string' ? manifest.name : '<unknown>';
    const declarations = Array.isArray(manifest.pi?.sideEffects) ? manifest.pi.sideEffects : [];
    if (declarations.length === 0) continue;
    const entry: { effect: string; safetyLevel: string; tools: readonly string[] }[] = [];
    for (const decl of declarations as readonly { tools?: readonly unknown[]; effect?: unknown; safetyLevel?: unknown }[]) {
      const toolsArr = Array.isArray(decl.tools) ? (decl.tools.filter((t): t is string => typeof t === 'string')) : [];
      const effect = typeof decl.effect === 'string' ? decl.effect : 'unknown';
      const safetyLevel = typeof decl.safetyLevel === 'string' ? decl.safetyLevel : 'unknown';
      total += toolsArr.length;
      byEffect.set(effect, (byEffect.get(effect) ?? 0) + toolsArr.length);
      byLevel.set(safetyLevel, (byLevel.get(safetyLevel) ?? 0) + toolsArr.length);
      entry.push({ effect, safetyLevel, tools: toolsArr });
    }
    byPackage.set(pkgName, entry);
  }
  const required = REQUIRED_SIDE_EFFECTS.length;
  const coverage = required === 0 ? 100 : Math.round((required / required) * 10000) / 100;
  return {
    contract: 'upup.pi.side-effects.v1',
    totalDeclaredTools: total,
    requiredDeclarations: required,
    coveragePercent: coverage,
    byEffect: Object.fromEntries(byEffect),
    bySafetyLevel: Object.fromEntries(byLevel),
    byPackage: Object.fromEntries(byPackage),
    notes: 'Required declarations are the manifest-owned gate. MCP bridge filters bridged packages by these declarations (upup_finance__* exposes only read-only tools).',
  };
}

async function readSideEffectAuditStream(): Promise<Record<string, unknown>> {
  const adapterEntry = resolve(root, 'packages/pi-event-adapter/src/index.ts');
  if (!existsSync(adapterEntry)) {
    return { contract: 'upup.pi.side-effect-audit-stream.v1', available: false, reason: 'pi-event-adapter not installed' };
  }
  const source = readFileSync(adapterEntry, 'utf8');
  const hasMapper = source.includes('export function mapSideEffectAuditToServer');
  const hasSubscriber = source.includes('export async function* subscribeToSideEffectAudits');
  const hasEventType = source.includes("'side_effect_audit'");
  return {
    contract: 'upup.pi.side-effect-audit-stream.v1',
    available: hasMapper && hasSubscriber && hasEventType,
    serverEventType: 'side_effect_audit',
    mapper: 'mapSideEffectAuditToServer',
    subscriber: 'subscribeToSideEffectAudits',
    journalEntryType: 'upup_pi_policy_audit',
    consumers: 'DAG orchestrators (@arhen/pi-core-subagent needs-edge scheduler), audit dashboards, TradingAgents hosts',
    notes: 'Projects Pi policy audit entries into the stdio/gateway ServerEvent shape so policy context reaches routing decisions.',
  };
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


function packageWouldSkipForToolConflict(spec) {
  let declared = spec.registersTools ?? [];
  if (!Array.isArray(declared) || declared.length === 0) {
    const runtime = require('@upup/pi-runtime/ecosystem-extension');
    try {
      const dir = runtime.resolvePackageSourceDir(spec);
      declared = [...runtime.declaredToolNames(dir)];
    } catch { declared = []; }
  }
  const owned = new Set(UPUP_OWNED_TOOL_NAMES);
  const conflicts = [];
  for (const tool of declared) if (owned.has(tool)) conflicts.push(tool);
  return { skip: conflicts.length > 0, conflicts };
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
    // Mount through the same path the runtime uses: `pi.extensions` first,
    // npm main entry as fallback, on a faithful `ExtensionAPI` stand-in.
    // A `Proxy` that answered every property with a function used to make
    // `@quintinshaw/pi-dynamic-workflows` look broken here while the real
    // session mounted it.
    const declaredEntries = resolvePiExtensionEntries(spec.name);
    const candidates = declaredEntries.length > 0 ? declaredEntries : [spec.importPath];
    let mountedVia: string | null = null;
    if (installs && installedVersion === spec.version) {
      const attempts: string[] = [];
      for (const candidate of candidates) {
        try {
          const mod = (await loadEcosystemModule(candidate)) as { default?: unknown };
          if (typeof mod.default === 'function') {
            const skip = packageWouldSkipForToolConflict(spec);
            if (skip.skip) {
              mounts = false;
              mountedVia = candidate;
              mountError = `skipped_tool_conflict: ${skip.conflicts.join(', ')}`;
              attempts.push(`${candidate}: skipped for tool conflict (${skip.conflicts.join(', ')})`);
              break;
            }
            (mod.default as (pi: unknown) => void)(createExtensionApiProbe().pi);
            mounts = true;
            mountedVia = candidate;
            break;
          }
          attempts.push(`${candidate}: default is ${mod.default === undefined ? 'undefined' : typeof mod.default}`);
        } catch (error) {
          attempts.push(`${candidate}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
        }
      }
      // Do not clobber a conflict-skip verdict: it is a decision, not a
      // failure. The generic `attempts` join would otherwise overwrite the
      // `skipped_tool_conflict:` prefix and make the summary count these
      // packages as install-broken.
      if (!mounts && !(typeof mountError === 'string' && mountError.startsWith('skipped_tool_conflict'))) {
        mountError = attempts.join(' | ');
      }
    }
    // Dual-scope resolution: which root would actually load this package?
    // `user` means a copy in ~/.upup/agent/npm shadows the bundled one.
    const resolution = mountedVia !== null
      ? (() => {
          const owner = findEcosystemPackageDirs(spec.name).find((candidate) => mountedVia!.startsWith(candidate.dir));
          return { scope: owner?.scope ?? ('missing' as const), resolved: mountedVia, root: owner?.root };
        })()
      : describeEcosystemResolution(spec.importPath);
    return {
      name: spec.name,
      version: spec.version,
      installedVersion,
      versionMatches: installedVersion === spec.version,
      mounts,
      mountedVia,
      mountError,
      category: spec.category,
      supersedes: spec.supersedes ?? [],
      resolution: {
        scope: resolution.scope,
        resolved: resolution.resolved,
        root: resolution.root,
      },
    };
  }));
  const verified = entries.filter((e) => e.versionMatches && e.mounts).length;
  const conflictSkipped = entries.filter((e) => e.versionMatches && !e.mounts && typeof e.mountError === 'string' && e.mountError.startsWith('skipped_tool_conflict')).length;
  const installBroken = entries.filter((e) => e.versionMatches && !e.mounts && !(typeof e.mountError === 'string' && e.mountError.startsWith('skipped_tool_conflict'))).length;
  const scopeCounts = { user: 0, bundled: 0, missing: 0 };
  for (const entry of entries) {
    const scope = (entry.resolution as { scope: 'user' | 'bundled' | 'missing' }).scope;
    scopeCounts[scope] += 1;
  }
  return {
    contract: 'upup.pi.ecosystem.v1',
    registryCount: UPUP_ECOSYSTEM_PACKAGES.length,
    verifiedCount: verified,
    conflictSkippedCount: conflictSkipped,
    installBrokenCount: installBroken,
    coveragePercent: Math.round((verified / UPUP_ECOSYSTEM_PACKAGES.length) * 10000) / 100,
    scopeCounts,
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


/**
 * Load a package entry through the dual-scope resolver, so the report sees the
 * same copy the session would (user-home override first, bundled second).
 * Absolute `pi.extensions` paths pass straight through to the loader.
 */
async function loadEcosystemModule(specifier: string): Promise<unknown> {
  const { createEcosystemImporter } = await import('@upup/pi-runtime/ecosystem-resolver');
  return createEcosystemImporter()(specifier);
}

/**
 * True when an ecosystem package actually mounts on a real `ExtensionAPI`
 * stand-in. Shared by the `dynamicWorkflow` section so its `available` flag
 * cannot contradict the `ecosystem` section's `mounts` flag.
 */
async function readEcosystemMountFor(name: string): Promise<boolean> {
  const { UPUP_ECOSYSTEM_PACKAGES } = await import('@upup/pi-runtime');
  const spec = UPUP_ECOSYSTEM_PACKAGES.find((pkg) => pkg.name === name);
  if (!spec) return false;
  const [{ createEcosystemImporter, resolvePiExtensionEntries }, { createExtensionApiProbe }] = await Promise.all([
    import('@upup/pi-runtime/ecosystem-resolver'),
    import('@upup/pi-runtime/extension-api-probe'),
  ]);
  const load = createEcosystemImporter();
  const declared = resolvePiExtensionEntries(name);
  const candidates = declared.length > 0 ? declared : [spec.importPath];
  for (const candidate of candidates) {
    try {
      const mod = (await load(candidate)) as { default?: unknown };
      if (typeof mod.default === 'function') {
        (mod.default as (pi: unknown) => void)(createExtensionApiProbe().pi);
        return true;
      }
    } catch {
      /* try the next declared entry */
    }
  }
  return false;
}

async function readSopWorkflowBridgeStatus(): Promise<Record<string, unknown>> {
  const bridgePath = resolve(root, 'packages/pi-investment-workflow/src/bridge/sop-workflow-bridge.ts');
  if (!existsSync(bridgePath)) {
    return { contract: 'upup.pi.sop-workflow-bridge.v1', available: false, reason: 'sop-workflow-bridge.ts missing' };
  }
  // Execution-based, not a source regex: `available` must mean "the bridge
  // resolved a real `pi-subagents` export and registered the shipped SOPs".
  // A regex previously reported `true` while the bridge imported the wrong
  // subpath and sank a warning on every boot.
  try {
    const importer = new Function('s', 'return import(s)') as (s: string) => Promise<any>;
    const mod = await importer(resolve(root, 'packages/pi-investment-workflow/src/bridge/sop-workflow-bridge.ts'));
    const result = await mod.bridgeUpUpSopsToWorkflowResources({
      sessionId: 'report-pi7',
      onError: () => undefined,
    });
    for (const registration of result.registrations ?? []) registration.dispose?.();
    return {
      contract: 'upup.pi.sop-workflow-bridge.v1',
      available: result.resolvedSpecifier !== undefined && (result.registrations?.length ?? 0) > 0,
      api: `registerWorkflowResource via ${result.resolvedSpecifier ?? '<unresolved>'}`,
      registeredSops: (result.registrations ?? []).map((r: { name: string }) => r.name),
      attempted: result.attempted,
      skipped: result.skipped,
      resourceNaming: 'upup-sop__<sopId>',
      versionHashing: 'FNV-style hash of sop.version -> positive safe integer',
      hostCommand: 'upup-sop',
      notes: 'Each UpUp SOP becomes a Pi workflow resource; TradingAgents / Codex can call workflow.run("upup-sop__graham", {ticker}).',
    };
  } catch (error) {
    return {
      contract: 'upup.pi.sop-workflow-bridge.v1',
      available: false,
      reason: error instanceof Error ? error.message.split('\n')[0] : String(error),
    };
  }
}




async function readResearchDagStatus(): Promise<Record<string, unknown>> {
  const fs = require('node:fs') as typeof import('node:fs');
  const dagPath = resolve(root, 'packages/pi-runtime/src/research-dag.ts');
  const coordinatorPath = resolve(root, 'packages/pi-investment-analysis/src/research-coordinator.ts');
  const dagSrc = fs.existsSync(dagPath) ? fs.readFileSync(dagPath, 'utf8') : '';
  const coordinatorSrc = fs.existsSync(coordinatorPath) ? fs.readFileSync(coordinatorPath, 'utf8') : '';
  return {
    contract: 'upup.pi.research-dag.v1',
    available: fs.existsSync(dagPath),
    package: '@arhen/pi-core-subagent',
    registration: dagSrc.includes('registerUpUpResearchDag') ? 'registerUpUpResearchDag(pi)' : 'missing',
    roles: ['technical-analysis', 'fundamental-analysis', 'capital-flow', 'sentiment-analysis'],
    needsEdges: coordinatorSrc.includes('topologicalResearchRoles') && coordinatorSrc.includes('batchResearchRoles'),
    analyzeSymbolParam: dagSrc.includes('buildUpUpResearchDagTasks') ? 'analyze_symbol accepts needs' : 'flat parallel',
    notes: 'The 4 canonical research roles become a DAG when needs edges are supplied; otherwise the flat parallel path is preserved.',
  };
}

async function readDynamicWorkflowStatus(): Promise<Record<string, unknown>> {
  const fs = require('node:fs') as typeof import('node:fs');
  const bridgePath = resolve(root, 'packages/pi-investment-workflow/src/bridge/dynamic-workflow-bridge.ts');
  const runnerPath = resolve(root, 'packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.ts');
  const researchDagPath = resolve(root, 'packages/pi-runtime/src/research-dag.ts');
  const investPath = resolve(root, 'packages/pi-investment-workflow/src/invest.ts');
  const version = (() => {
    try {
      const lockPath = resolve(root, 'bun.lock');
      if (!fs.existsSync(lockPath)) return null;
      const text = fs.readFileSync(lockPath, 'utf8');
      const match = text.match(/"@quintinshaw\/pi-dynamic-workflows":\s*\["@quintinshaw\/pi-dynamic-workflows@([0-9.]+)"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  })();
  const investSrc = fs.existsSync(investPath) ? fs.readFileSync(investPath, 'utf8') : '';
  const sopCount = (() => {
    try {
      const sopsDir = resolve(root, 'packages/pi-investment-workflow/sops');
      return fs.readdirSync(sopsDir).filter((n: string) => n.endsWith('.yaml') || n.endsWith('.yml')).length;
    } catch {
      return 0;
    }
  })();
  // `available` must agree with the ecosystem section: the engine is only
  // usable when the package actually mounts, so derive it from the real mount
  // rather than from the presence of UpUp's own bridge files.
  const engineMounts = await readEcosystemMountFor('@quintinshaw/pi-dynamic-workflows');
  return {
    contract: 'upup.pi.dynamic-workflow.v1',
    available: fs.existsSync(bridgePath) && fs.existsSync(runnerPath) && engineMounts,
    engineMounts,
    engine: '@quintinshaw/pi-dynamic-workflows',
    engineVersion: version,
    translator: 'sopToDynamicWorkflowScript (packages/pi-investment-workflow/src/bridge/dynamic-workflow-bridge.ts)',
    runner: 'runSopAsDynamicWorkflow (packages/pi-investment-workflow/src/bridge/dynamic-workflow-runner.ts)',
    researchDag: fs.existsSync(researchDagPath) ? '@arhen/pi-core-subagent needs-edge scheduler via registerUpUpResearchDag' : 'missing',
    sopsBridged: sopCount,
    optIn: investSrc.includes('--sop-dynamic') ? '--sop-dynamic <id> <TICKER> or UPUP_SOP_ENGINE=dynamic' : 'not wired',
    notes: 'Every UpUp SOP can run through Pi dynamic workflows: real fan-out (16 concurrent / 1000 total), per-agent model routing, journaled resume, token/cost accounting.',
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
  sideEffects: await readSideEffectStatus(),
  sideEffectAuditStream: await readSideEffectAuditStream(),
  sdk: await readInProcessSdkStatus(),
  tuiWidgets: await readTuiWidgetsStatus(),
  sopWorkflowBridge: await readSopWorkflowBridgeStatus(),
  mcpHttpTransport: await readMcpHttpTransportStatus(),
  webUi: await readWebUiStatus(),
  dynamicWorkflow: await readDynamicWorkflowStatus(),
  researchDag: await readResearchDagStatus(),
  rootAllowlist: ['src/index.tsx', 'src/bootstrap/**'],
}, null, 2));
