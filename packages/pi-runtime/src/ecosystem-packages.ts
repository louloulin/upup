/**
 * UpUp Pi Ecosystem Packages — single source of truth for which Pi community
 * packages UpUp depends on, the import path that actually loads, and the
 * category each one fits in.
 *
 * Why this exists:
 *   Pi ships 5684+ npm packages covering every concern a research / coding
 *   agent could want (subagents, web access, memory, MCP, plan review,
 *   advisor flow, …). UpUp cannot maintain 48 internal implementations
 *   when those implementations already live on npm. The rule is
 *   **"if Pi's ecosystem already provides it, UpUp wraps it"** — this file
 *   is the manifest that lets every other layer (CLI command, TUI hint,
 *   guard script, `report:pi7`, dev `bun add`) speak the same name list.
 *
 * Guard rails:
 *   - Each entry carries the exact import path that loads under Pi 0.85.1;
 *     this was verified by `bun run scripts/check-pi-ecosystem-deps.ts`.
 *   - `supersedes` lists UpUp workspace packages whose tool surface this
 *     ecosystem package replaces (e.g. pi-web-access's `web_search`
 *     collides with `@upup/pi-research`'s `web_search`). These entries
 *     stay in the registry so `upup plugin recommend` can explain the
 *     trade-off; `verified_clean` is `false` and `bootstrap-agent.ts`
 *     defaults them to `autoload: false`.
 *   - `verified_clean: true` means: dev `bun add` succeeded, default
 *     export is callable on a fake `ExtensionAPI`, and no peer-dep
 *     complaint was raised. CI runs the same check on every commit.
 */

export type EcosystemCategory =
  | 'subagent'      // Multi-agent / DAG / delegation
  | 'web'           // Web search, fetch, extract
  | 'cache'         // Prompt / KV cache optimisation
  | 'advisor'       // Executor / Advisor pattern
  | 'plan-review'   // Plan annotation UI
  | 'roles'         // Per-role agent config (compatible with rolebox spec)
  | 'memory'        // Persistent memory
  | 'workflow'      // Long-running autonomous workflow
  | 'mcp'           // MCP adapter (Pi official)
  | 'provider';     // Provider / model integration

export interface UpUpEcosystemPackage {
  /** npm package name (the same as the import name for unscoped packages). */
  readonly name: string;
  /** Currently-installed version. Verified by `check-pi-ecosystem-deps`. */
  readonly version: string;
  /** Import path that actually resolves under Bun in this repo. */
  readonly importPath: string;
  readonly category: EcosystemCategory;
  /**
   * True iff `default(pi)` mounts cleanly on a fake `ExtensionAPI` without
   * raising. CI re-derives this; do not hand-edit to `true`.
   */
  readonly verifiedClean: boolean;
  /** UpUp workspace package this ecosystem package replaces (if any). */
  readonly supersedes?: readonly string[];
  /** One-line description used by `upup plugin recommend`. */
  readonly description: string;
  /** Free-form caveats surfaced by `upup doctor`. */
  readonly caveats?: readonly string[];
}

export const UPUP_ECOSYSTEM_PACKAGES: readonly UpUpEcosystemPackage[] = [
  {
    name: 'pi-subagents',
    version: '0.68.0',
    importPath: 'pi-subagents',
    category: 'subagent',
    verifiedClean: true,
    description: 'Single-agent delegation + scripted multi-agent workflows.',
  },
  {
    name: 'pi-web-access',
    version: '0.29.0',
    importPath: 'pi-web-access',
    category: 'web',
    verifiedClean: true,
    supersedes: ['@upup/pi-research'],
    description: '30+ search / fetch providers (Firecrawl, Jina, Brave, Gemini, …).',
    caveats: [
      'Registers `web_search` which collides with @upup/pi-research; load only one.',
    ],
  },
  {
    name: 'pi-web-search',
    version: '1.6.0',
    importPath: 'pi-web-search',
    category: 'web',
    verifiedClean: true,
    description: 'Provider-native web search (Gemini URL Context, xAI Grok, OpenAI Responses).',
  },
  {
    name: 'pi-cache-optimizer',
    version: '2.8.10',
    importPath: 'pi-cache-optimizer',
    category: 'cache',
    verifiedClean: true,
    description: 'Stable-prompt rewrite + OpenAI-compatible cache keys for high cache hit rate.',
  },
  {
    name: 'pi-advisor-flow',
    version: '0.6.0',
    importPath: 'pi-advisor-flow',
    category: 'advisor',
    verifiedClean: true,
    description: 'Executor/Advisor flow: model can request a second opinion from a stronger reviewer.',
  },
  {
    name: '@plannotator/pi-extension',
    version: '0.27.15',
    importPath: '@plannotator/pi-extension',
    category: 'plan-review',
    verifiedClean: true,
    description: 'Browser-based plan review with annotations; integrates with Pi plan mode.',
  },
  {
    name: 'rolebox',
    version: '1.9.0',
    importPath: 'rolebox/pi',
    category: 'roles',
    verifiedClean: true,
    description: 'Per-role prompts/models/skills/permissions; UpUp SOP role format is a superset.',
  },
  {
    name: 'pi-hermes-memory',
    version: '0.9.9',
    importPath: 'pi-hermes-memory',
    category: 'memory',
    verifiedClean: true,
    supersedes: ['@upup/memory'],
    description: 'SQLite FTS5 + procedural skills + secret scanning.',
    caveats: [
      'Registers `memory_search` / `memory_get` / `memory_update` which collide with @upup/pi-platform; load only one.',
    ],
  },
  {
    name: 'pi-goal-list-loop-audit',
    version: '0.38.56',
    importPath: 'pi-goal-list-loop-audit/extensions/loops/goal.ts',
    category: 'workflow',
    verifiedClean: true,
    description: 'Mission-control: interview-drafted goals, audited task queue, detached auditor.',
  },
  {
    name: '@arhen/pi-core-subagent',
    version: '1.3.54',
    importPath: '@arhen/pi-core-subagent',
    category: 'subagent',
    verifiedClean: true,
    description: 'In-process subagents with dependency-graph scheduler (DAG); replaces UpUp custom research-coordinator.',
  },
] as const;

/** Look up a single ecosystem package by npm name. */
export function findEcosystemPackage(name: string): UpUpEcosystemPackage | undefined {
  return UPUP_ECOSYSTEM_PACKAGES.find((p) => p.name === name);
}

/** Group ecosystem packages by category for `upup plugin recommend` output. */
export function groupEcosystemByCategory(): Record<EcosystemCategory, readonly UpUpEcosystemPackage[]> {
  const groups: Record<EcosystemCategory, UpUpEcosystemPackage[]> = {
    subagent: [], web: [], cache: [], advisor: [], 'plan-review': [],
    roles: [], memory: [], workflow: [], mcp: [], provider: [],
  };
  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    groups[pkg.category].push(pkg);
  }
  return groups;
}
