/**
 * UpUp builtin Pi package pluggable toggles.
 */

export const UPUP_BUILTIN_PLUGIN_DIRECTORIES = [
  'pi-finance-sdk', 'pi-market-data', 'pi-investment-analysis',
  'pi-risk', 'pi-portfolio', 'pi-backtest', 'pi-platform',
  'pi-research', 'pi-browser', 'pi-config', 'pi-cache',
  'pi-notify', 'pi-investment-workflow', 'pi-management',
  'pi-technical', 'pi-corporate-actions', 'pi-quant',
  'pi-event-adapter', 'pi-observability',
] as const;

export type UpUpBuiltinPluginDirectory =
  (typeof UPUP_BUILTIN_PLUGIN_DIRECTORIES)[number];

export interface UpUpPluginSettings {
  readonly disabled?: readonly string[];
  readonly enabled?: readonly string[];
}

const BUILTIN_PREFIX = 'builtin:';
const UPUP_PREFIX = '@upup/';

export function normalizePluginKey(value: string): string {
  let v = value.trim();
  if (v.toLowerCase().startsWith(BUILTIN_PREFIX)) v = v.slice(BUILTIN_PREFIX.length);
  if (v.toLowerCase().startsWith(UPUP_PREFIX)) return v.toLowerCase();
  return (UPUP_PREFIX + v).toLowerCase();
}

export interface BuiltinCandidate {
  readonly directory: string;
  readonly name: string;
  readonly version: string;
  readonly path: string;
}

function candidateKey(candidate: BuiltinCandidate): string {
  if (candidate.name.toLowerCase() === (UPUP_PREFIX + candidate.directory).toLowerCase()) {
    return candidate.name.toLowerCase();
  }
  return (UPUP_PREFIX + candidate.directory).toLowerCase();
}

export function filterBuiltinCandidatesByToggles(
  candidates: readonly BuiltinCandidate[],
  settings: UpUpPluginSettings,
): readonly BuiltinCandidate[] {
  const disabled = new Set((settings.disabled ?? []).map(normalizePluginKey));
  const enabledRaw = (settings.enabled ?? []).map(normalizePluginKey);
  const enabled = enabledRaw.length > 0 ? new Set(enabledRaw) : null;
  return candidates.filter((candidate) => {
    const key = candidateKey(candidate);
    if (disabled.has(key)) return false;
    if (enabled && !enabled.has(key)) return false;
    return true;
  });
}

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { resolveAgentDir } from './agent-dir';

export function readUpUpPluginSettings(cwd = process.cwd()): UpUpPluginSettings {
  const { agentDir } = resolveAgentDir(cwd);
  const settingsPath = join(agentDir, 'settings.json');
  if (!existsSync(settingsPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as { upupPlugins?: unknown };
    const node = raw.upupPlugins;
    if (!node || typeof node !== 'object' || Array.isArray(node)) return {};
    const out: { disabled?: readonly string[]; enabled?: readonly string[] } = {};
    const disabledNode = (node as Record<string, unknown>).disabled;
    if (Array.isArray(disabledNode)) {
      const values = disabledNode.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
      if (values.length > 0) out.disabled = values;
    }
    const enabledNode = (node as Record<string, unknown>).enabled;
    if (Array.isArray(enabledNode)) {
      const values = enabledNode.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
      if (values.length > 0) out.enabled = values;
    }
    return out;
  } catch {
    return {};
  }
}
