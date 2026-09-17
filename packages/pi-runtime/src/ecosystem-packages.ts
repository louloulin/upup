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
  | 'goal'          // Single-objective autonomous completion
  | 'mcp'           // MCP adapter (Pi official)
  | 'observability' // LLM/tool tracing
  | 'code-review'   // Code review / simplify / lint
  | 'lsp'           // LSP / linters / type-check
  | 'interview'     // Structured questionnaire for the model
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
  /**
   * Tool names this package registers. Pi's resource loader fails the *whole*
   * extension when two extensions claim the same tool name, so a package whose
   * tool set intersects one UpUp already ships has to be skipped at mount time
   * (see `mountUpUpEcosystemPackages`). Keep this list in sync with the
   * package's own `pi.registerTool(...)` calls; a missing entry means a silent
   * duplicate rather than a clean skip.
   */
  readonly registersTools?: readonly string[];
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
    // `web_search` is owned by @upup/pi-research in the UpUp host; Pi's
    // resource loader rejects the entire extension on a duplicate tool name,
    // so this package is skipped unless the UpUp counterpart is disabled.
    registersTools: ['web_search', 'web_fetch'],
    description: '30+ search / fetch providers (Firecrawl, Jina, Brave, Gemini, …).',
    caveats: [
      'Registers `web_search` which collides with @upup/pi-research; UpUp skips this package at mount time rather than failing the whole extension.',
    ],
  },
  {
    name: 'pi-web-search',
    version: '1.6.0',
    importPath: 'pi-web-search',
    category: 'web',
    verifiedClean: true,
    // Both tools are already owned by @upup/pi-research in the UpUp host.
    registersTools: ['web_search', 'url_context'],
    description: 'Provider-native web search (Gemini URL Context, xAI Grok, OpenAI Responses).',
    caveats: [
      'Registers `web_search` / `url_context` which collide with @upup/pi-research; UpUp skips this package at mount time rather than failing the whole extension.',
    ],
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
    // `memory_search` is owned by @upup/pi-platform in the UpUp host; the
    // duplicate would abort the entire ecosystem extension, so this package is
    // skipped until the UpUp memory tools are turned off.
    registersTools: ['memory_search', 'memory_get', 'memory_update'],
    description: 'SQLite FTS5 + procedural skills + secret scanning.',
    caveats: [
      'Registers `memory_search` / `memory_get` / `memory_update` which collide with @upup/pi-platform; UpUp skips this package at mount time rather than failing the whole extension.',
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
  {
    name: 'pi-mcp-adapter',
    version: '2.34.0',
    importPath: 'pi-mcp-adapter',
    category: 'mcp',
    verifiedClean: true,
    description: "Pi's official MCP (Model Context Protocol) adapter; replaces UpUp's hand-rolled MCP client with Pi's vetted implementation.",
  },
  {
    name: 'pi-lens',
    version: '4.2.0',
    importPath: 'pi-lens',
    category: 'lsp',
    verifiedClean: true,
    description: 'Real-time code feedback for Pi — LSP, linters, formatters, type-checking, structural analysis.',
  },
  {
    name: '@braintrust/pi-extension',
    version: '2.1.0',
    importPath: '@braintrust/pi-extension',
    category: 'observability',
    verifiedClean: true,
    description: 'Automatic tracing for Pi sessions, turns, LLM calls, and tool executions to Braintrust.',
  },
  {
    name: 'pi-simplify',
    version: '0.2.3',
    importPath: 'pi-simplify',
    category: 'code-review',
    verifiedClean: true,
    description: 'Reviews recently changed code for clarity, consistency, and maintainability.',
  },
  {
    name: '@narumitw/pi-plan-mode',
    version: '0.58.0',
    importPath: '@narumitw/pi-plan-mode/dist/index.ts',
    category: 'plan-review',
    verifiedClean: true,
    description: 'Codex-like read-only /plan collaboration mode (block mutations, structured questions, plan export).',
  },
  {
    name: 'pi-goal-x',
    version: '0.31.5',
    importPath: 'pi-goal-x/extensions/goal.ts',
    category: 'goal',
    verifiedClean: true,
    description: 'Conversational goal planning with persistent progress and an independent completion auditor.',
  },
  {
    name: '@juicesharp/rpiv-ask-user-question',
    version: '2.10.1',
    importPath: '@juicesharp/rpiv-ask-user-question',
    category: 'interview',
    verifiedClean: true,
    description: 'Structured questionnaire the model can put to the user with typed options.',
  },
  {
    name: '@quintinshaw/pi-dynamic-workflows',
    version: '3.12.0',
    importPath: '@quintinshaw/pi-dynamic-workflows',
    category: 'workflow',
    verifiedClean: true,
    description: 'Claude-Code-style dynamic workflows: fan out 100s of subagents, model routing, token/cost accounting, resume, /workflows TUI, /deep-research.',
  },
  {
    name: 'toolflow',
    version: '3.1.4',
    importPath: 'toolflow',
    category: 'workflow',
    verifiedClean: true,
    description: 'Stage-gated tool pruning + 95% token dehydration + blast-radius guard + prompt workbench.',
  },
  {
    name: 'pi-esr',
    version: '0.6.3',
    importPath: 'pi-esr',
    category: 'workflow',
    verifiedClean: true,
    description: 'Engineering State Runtime: entity-graph state machine + SQLite memory provider for run persistence.',
  },
  {
    name: 'pi-brainstorm',
    version: '0.4.3',
    importPath: 'pi-brainstorm/extensions/brainstorm.ts',
    category: 'subagent',
    verifiedClean: true,
    description: 'Multi-model brainstorm/debate with file-based blackboard and main-conv compact cards.',
  },
  {
    name: 'pi-conductor',
    version: '0.21.7',
    importPath: 'pi-conductor',
    category: 'workflow',
    verifiedClean: false,
    description: 'Multi-role LLM orchestration via handoff FSM. Not loadable under current pi-coding-agent (transitive AuthStorage missing).',
    caveats: [
      'Top-level import of pi-conductor fails because host/stub-host.js references AuthStorage, which pi-coding-agent no longer exports. Subpath file-URL imports of dist/core/* and dist/manifest/* still resolve.',
    ],
  },
  {
    name: 'pi-crew',
    version: '0.11.1',
    importPath: 'pi-crew/index.ts',
    category: 'workflow',
    verifiedClean: true,
    description: 'Coordinated AI teams, worktrees, async task orchestration.',
    caveats: [
      "pi-crew declares no `.`-export, so `import('pi-crew')` fails. UpUp loads it through its `pi.extensions` entry (index.ts), which is Pi's authoritative contract — resolution goes through `resolvePiExtensionEntries`, not the npm main entry.",
    ],
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
    roles: [], memory: [], workflow: [], goal: [], mcp: [],
    observability: [], 'code-review': [], lsp: [], interview: [], provider: [],
  };
  for (const pkg of UPUP_ECOSYSTEM_PACKAGES) {
    groups[pkg.category].push(pkg);
  }
  return groups;
}
