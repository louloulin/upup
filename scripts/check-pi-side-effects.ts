import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type SideEffectKind = 'filesystem-write' | 'external-network' | 'credential-access' | 'financial-write';
export type SafetyLevel = 'safe' | 'warning' | 'dangerous' | 'critical';
export interface SideEffectDeclaration { tools: readonly string[]; effect: SideEffectKind; safetyLevel: SafetyLevel }
export interface PackageManifest { name?: string; pi?: { tools?: unknown; sideEffects?: unknown } }
export interface SideEffectRequirement { packageName: string; tool: string; effect: SideEffectKind; safetyLevel: SafetyLevel }

const requirement = (packageName: string, tools: readonly string[], effect: SideEffectKind, safetyLevel: SafetyLevel): readonly SideEffectRequirement[] => tools.map((tool) => ({ packageName, tool, effect, safetyLevel }));

export const REQUIRED_SIDE_EFFECTS: readonly SideEffectRequirement[] = [
  ...requirement('@upup/pi-config', ['config_set'], 'filesystem-write', 'dangerous'),
  ...requirement('@upup/pi-finance-sdk', ['place_trade_order', 'cancel_trade_order'], 'financial-write', 'critical'),
  ...requirement('@upup/pi-finance-sdk', ['strategy_run_paper'], 'financial-write', 'dangerous'),
  ...requirement('@upup/pi-notify', ['notify', 'subscribe_pr', 'unsubscribe_pr'], 'external-network', 'warning'),
  ...requirement('@upup/pi-platform', [
    'platformBash', 'write_file', 'edit_file', 'export_data', 'export_watchlist', 'memory_update', 'notebook_create', 'notebook_edit_cell',
    'notebook_insert_cell', 'notebook_delete_cell', 'heartbeat', 'cron',
  ], 'filesystem-write', 'warning'),
  ...requirement('@upup/pi-platform', ['send_user_file', 'create_worktree'], 'filesystem-write', 'dangerous'),
  ...requirement('@upup/pi-platform', ['remove_worktree'], 'filesystem-write', 'critical'),
  ...requirement('@upup/pi-platform', ['mcp_auth_get'], 'credential-access', 'dangerous'),
  ...requirement('@upup/pi-platform', ['mcp_auth_set', 'mcp_auth_clear'], 'credential-access', 'critical'),
  ...requirement('@upup/pi-platform', ['list_mcp_resources', 'read_mcp_resource'], 'external-network', 'dangerous'),
];

function parseDeclarations(manifest: PackageManifest): readonly SideEffectDeclaration[] {
  if (!Array.isArray(manifest.pi?.sideEffects)) return [];
  return manifest.pi.sideEffects.filter((value): value is SideEffectDeclaration => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Record<string, unknown>;
    return Array.isArray(candidate.tools) && typeof candidate.effect === 'string' && typeof candidate.safetyLevel === 'string';
  });
}

export function findSideEffectCoverageGaps(manifests: readonly PackageManifest[]): string[] {
  const byName = new Map(manifests.filter((manifest): manifest is PackageManifest & { name: string } => typeof manifest.name === 'string').map((manifest) => [manifest.name, manifest]));
  const gaps: string[] = [];
  for (const expected of REQUIRED_SIDE_EFFECTS) {
    const manifest = byName.get(expected.packageName);
    if (!manifest) { gaps.push(`${expected.packageName}: missing package manifest`); continue; }
    const tools = Array.isArray(manifest.pi?.tools) ? manifest.pi.tools.filter((tool): tool is string => typeof tool === 'string') : [];
    if (!tools.includes(expected.tool)) { gaps.push(`${expected.packageName}: required side-effect tool is absent from pi.tools: ${expected.tool}`); continue; }
    const declarations = parseDeclarations(manifest);
    const declaration = declarations.find((candidate) => candidate.tools.includes(expected.tool));
    if (!declaration) { gaps.push(`${expected.packageName}: missing sideEffects declaration for ${expected.tool}`); continue; }
    if (declaration.effect !== expected.effect || declaration.safetyLevel !== expected.safetyLevel) {
      gaps.push(`${expected.packageName}: ${expected.tool} declares ${declaration.effect}/${declaration.safetyLevel}, expected ${expected.effect}/${expected.safetyLevel}`);
    }
  }
  return gaps;
}

export function readWorkspaceManifests(root = process.cwd()): PackageManifest[] {
  const packagesRoot = join(root, 'packages');
  if (!existsSync(packagesRoot)) return [];
  return requirePackageDirectories(packagesRoot).map((packagePath) => JSON.parse(readFileSync(join(packagePath, 'package.json'), 'utf8')) as PackageManifest);
}

function requirePackageDirectories(packagesRoot: string): string[] {
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry: { isDirectory: () => boolean }) => entry.isDirectory())
    .map((entry: { name: string }) => join(packagesRoot, entry.name))
    .filter((packagePath: string) => existsSync(join(packagePath, 'package.json')));
}

if (import.meta.main) {
  const gaps = findSideEffectCoverageGaps(readWorkspaceManifests());
  if (gaps.length > 0) {
    console.error(gaps.map((gap) => `FAIL: ${gap}`).join('\n'));
    process.exit(1);
  }
  console.log(`Pi side-effect coverage checks passed: ${REQUIRED_SIDE_EFFECTS.length} required tool declarations are manifest-owned.`);
}
