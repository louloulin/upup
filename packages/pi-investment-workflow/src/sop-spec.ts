/**
 * UpUp SOP (Standard Operating Procedure) — investor-customizable methodology.
 *
 * A SopSpec composes one or more UpUp agent profiles (built-in or user-defined)
 * into a deterministic phase sequence. SOPs are loaded from
 * `<cwd>/.upup/sops/*.yaml` and `~/.upup/sops/*.yaml`. Each SOP may declare
 * parallel groups (multi-agent debate) that the executor runs through the Pi
 * subagent dependency-graph scheduler rather than re-implementing concurrency.
 *
 * Conceptually aligns with the `rolebox` ecosystem (per-role prompts/models/
 * skills/permissions); we extend rolebox with phase + parallel-group semantics
 * so a user can write "Graham 价值投资法" or "Momentum 趋势法" as one YAML.
 */
import type {
  UpUpAgentSpec,
  UpUpOutputContract,
  UpUpDataPolicy,
  UpUpPermissionProfile,
} from '@upup/pi-runtime';

export interface SopPhase {
  readonly id: string;
  readonly agent: string;
  readonly intent: string;
  readonly outputContract?: UpUpOutputContract;
  readonly requires?: readonly string[];
  readonly timeoutMs?: number;
  readonly dataPolicy?: UpUpDataPolicy;
  readonly tools?: readonly string[] | '*';
  readonly permissions?: UpUpPermissionProfile;
}

export interface SopParallelGroup {
  readonly id: string;
  readonly agents: readonly string[];
  readonly synthesizer: string;
  readonly reduce: 'majority' | 'weighted' | 'llm-arbiter';
  readonly weights?: Readonly<Record<string, number>>;
}

export interface SopApproval {
  readonly beforePhases?: readonly string[];
  readonly tools?: readonly string[];
}

export interface SopSpec {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly phases: readonly SopPhase[];
  readonly parallelGroups?: readonly SopParallelGroup[];
  readonly approval?: SopApproval;
  readonly tags?: readonly string[];
  readonly market?: 'cn' | 'hk' | 'us' | 'any';
}

export interface SopValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class SopValidationError extends Error {
  readonly issues: readonly SopValidationIssue[];
  constructor(issues: readonly SopValidationIssue[]) {
    super(`SOP validation failed:\n${issues.map((i) => `  - ${i.path}: ${i.message}`).join('\n')}`);
    this.name = 'SopValidationError';
    this.issues = issues;
  }
}

const ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^\d+\.\d+\.\d+$/;
const REDUCE = new Set(['majority', 'weighted', 'llm-arbiter'] as const);

export function validateSopSpec(spec: SopSpec, knownAgents: ReadonlySet<string>): void {
  const issues: SopValidationIssue[] = [];
  if (!ID_RE.test(spec.id)) issues.push({ path: 'id', message: `Invalid id: ${spec.id}` });
  if (!VERSION_RE.test(spec.version)) issues.push({ path: 'version', message: `Invalid version: ${spec.version}` });
  if (!spec.name.trim() || !spec.description.trim()) issues.push({ path: 'name/description', message: 'name and description are required' });
  if (!spec.phases.length) issues.push({ path: 'phases', message: 'SOP must declare at least one phase' });

  const phaseIds = new Set<string>();
  for (const [i, p] of spec.phases.entries()) {
    if (!ID_RE.test(p.id)) issues.push({ path: `phases[${i}].id`, message: `Invalid phase id: ${p.id}` });
    if (phaseIds.has(p.id)) issues.push({ path: `phases[${i}].id`, message: `Duplicate phase id: ${p.id}` });
    phaseIds.add(p.id);
    if (!knownAgents.has(p.agent)) issues.push({ path: `phases[${i}].agent`, message: `Unknown agent: ${p.agent}` });
    if (!p.intent.trim()) issues.push({ path: `phases[${i}].intent`, message: 'intent is required' });
    for (const [j, dep] of (p.requires ?? []).entries()) {
      if (!phaseIds.has(dep) && !spec.phases.slice(0, i).some((q) => q.id === dep)) {
        const inGroup = (spec.parallelGroups ?? []).some((g) => g.agents.includes(dep) || g.synthesizer === dep);
        if (!inGroup) issues.push({ path: `phases[${i}].requires[${j}]`, message: `Unknown / out-of-order dep: ${dep}` });
      }
    }
  }

  for (const [i, g] of (spec.parallelGroups ?? []).entries()) {
    if (!ID_RE.test(g.id)) issues.push({ path: `parallelGroups[${i}].id`, message: `Invalid group id: ${g.id}` });
    if (!g.agents.length) issues.push({ path: `parallelGroups[${i}].agents`, message: 'parallel group requires at least one agent' });
    for (const a of g.agents) {
      if (!knownAgents.has(a)) issues.push({ path: `parallelGroups[${i}].agents`, message: `Unknown agent: ${a}` });
    }
    if (!knownAgents.has(g.synthesizer)) issues.push({ path: `parallelGroups[${i}].synthesizer`, message: `Unknown synthesizer: ${g.synthesizer}` });
    if (!REDUCE.has(g.reduce)) issues.push({ path: `parallelGroups[${i}].reduce`, message: `Invalid reduce mode: ${g.reduce}` });
    if (g.reduce === 'weighted' && (!g.weights || Object.keys(g.weights).length === 0)) {
      issues.push({ path: `parallelGroups[${i}].weights`, message: 'weights required when reduce=weighted' });
    }
  }

  const adj = new Map<string, string[]>();
  for (const p of spec.phases) adj.set(p.id, [...(p.requires ?? [])]);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const id of adj.keys()) color.set(id, WHITE);
  const dfs = (node: string): boolean => {
    if (color.get(node) === GRAY) return true;
    if (color.get(node) === BLACK) return false;
    color.set(node, GRAY);
    for (const dep of adj.get(node) ?? []) if (dfs(dep)) return true;
    color.set(node, BLACK);
    return false;
  };
  for (const id of adj.keys()) {
    if (dfs(id)) {
      issues.push({ path: 'phases', message: `Cycle detected involving ${id}` });
      break;
    }
  }

  if (issues.length) throw new SopValidationError(issues);
}

export function validateAgentCatalogForSop(agents: readonly UpUpAgentSpec[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const a of agents) ids.add(a.id);
  return ids;
}
