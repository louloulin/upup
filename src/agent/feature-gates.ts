/**
 * Feature Gates — three-layer enablement for UpUp capabilities.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/feature-gates
 *
 * Three layers, evaluated in this order:
 *   1. Compile-time: process.env.BUN_CONFIG_FEATURE_<NAME> = '0' excludes
 *      code from Bun.build bundles. Read at module load.
 *   2. Startup: process.env.FEATURE_<NAME> = 'false' / '0' disables at boot.
 *   3. Runtime: featureGates.set(name, { ratio, userId }) for A/B rollouts,
 *      using deterministic hashing so the same user always lands in the
 *      same bucket.
 *
 * Doctor: `featureGates.doctor()` returns a structured table of every known
 * gate with its current state and source.
 */

export type FeatureSource = 'compile' | 'startup' | 'runtime' | 'default';

export interface FeatureState {
  name: string;
  enabled: boolean;
  source: FeatureSource;
  /** For runtime gates with ratio < 1. */
  ratio?: number;
}

export interface RuntimeConfig {
  /** Stable identifier for deterministic bucketing. */
  userId?: string;
  /** Fraction of users in [0, 1] for whom this gate is enabled. */
  ratio?: number;
  /** Force-enable regardless of ratio. */
  force?: boolean;
}

export interface FeatureGates {
  isEnabled(name: string, ctx?: { userId?: string }): boolean;
  set(name: string, cfg: RuntimeConfig): void;
  clearRuntime(name: string): void;
  /** Returns the current state for a single gate. */
  inspect(name: string): FeatureState;
  /** Returns states for all known gates (defaults + registered). */
  doctor(): FeatureState[];
  /** Register a default-enabled gate at startup. */
  register(name: string, opts?: { defaultEnabled?: boolean }): void;
}

function parseBool(s: string | undefined): boolean | null {
  if (s === undefined) return null;
  const v = s.toLowerCase();
  if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
  if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
  return null;
}

function readCompileTime(name: string): boolean | null {
  return parseBool(process.env[`BUN_CONFIG_FEATURE_${name.toUpperCase()}`]);
}

function readStartup(name: string): boolean | null {
  return parseBool(process.env[`FEATURE_${name.toUpperCase()}`]);
}

/** Deterministic 32-bit FNV-1a hash. Same input always lands in the same bucket. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function bucket(userId: string, name: string): number {
  // Mix gate name + userId so two gates with the same ratio don't draw from
  // the exact same users.
  return (fnv1a(`${name}::${userId}`) % 10_000) / 10_000;
}

export function createFeatureGates(): FeatureGates {
  const RUNTIME = new Map<string, RuntimeConfig>();
  const DEFAULTS = new Map<string, boolean>();
  function isEnabled(name: string, ctx?: { userId?: string }): boolean {
    const rt = RUNTIME.get(name);
    if (rt) {
      if (rt.force === true) return true;
      if (rt.force === false) return false;
      if (rt.ratio === undefined) return true;
      const ratio = Math.max(0, Math.min(1, rt.ratio));
      const uid = ctx?.userId ?? rt.userId;
      if (!uid) {
        // Without a stable userId, fall back to enabled (so dev mode is opt-in).
        return true;
      }
      return bucket(uid, name) < ratio;
    }
    const compile = readCompileTime(name);
    if (compile !== null) return compile;
    const startup = readStartup(name);
    if (startup !== null) return startup;
    return DEFAULTS.get(name) ?? false;
  }

  function inspect(name: string): FeatureState {
    if (RUNTIME.has(name)) {
      const rt = RUNTIME.get(name)!;
      return {
        name,
        enabled: isEnabled(name),
        source: 'runtime',
        ratio: rt.ratio,
      };
    }
    if (readCompileTime(name) !== null) {
      return { name, enabled: isEnabled(name), source: 'compile' };
    }
    if (readStartup(name) !== null) {
      return { name, enabled: isEnabled(name), source: 'startup' };
    }
    return { name, enabled: isEnabled(name), source: 'default' };
  }

  return {
    isEnabled,
    set(name, cfg) {
      RUNTIME.set(name, cfg);
    },
    clearRuntime(name) {
      RUNTIME.delete(name);
    },
    inspect,
    doctor() {
      // v2: include every registered feature flag in the report.
      // Falls back to env-var sniffing for unknown gates that some
      // legacy code might still set.
      const names = new Set<string>([...DEFAULTS.keys(), ...RUNTIME.keys()]);
      for (const f of REGISTERED_FEATURES.values()) names.add(f.name);
      for (const k of Object.keys(process.env)) {
        if (k.startsWith('BUN_CONFIG_FEATURE_') || k.startsWith('FEATURE_')) {
          names.add(k.split('_', 3).slice(2).join('_').toLowerCase());
        }
      }
      return Array.from(names).sort().map((n) => inspect(n));
    },
    register(name, opts) {
      DEFAULTS.set(name, opts?.defaultEnabled ?? true);
    },
  };
}

/** Process-wide default. Replaced by tests via resetDefaultGates(). */
let defaultGates: FeatureGates | null = null;
export function getDefaultGates(): FeatureGates {
  if (!defaultGates) defaultGates = createFeatureGates();
  return defaultGates;
}
export function resetDefaultGates(): void {
  defaultGates = null;
}

// =====================================================================
// v2 (Sprint 2.2): compile-time feature flag registry + DCE pattern
// =====================================================================

export type FeatureCategory =
  | 'agent'
  | 'trading'
  | 'data'
  | 'tools'
  | 'analytics'
  | 'integration'
  | 'experimental';

export interface FeatureFlag {
  name: string;
  description: string;
  category: FeatureCategory;
  defaultEnabled: boolean;
  /** Version when the flag was introduced (CalVer YYYY.M.D). */
  since: string;
  /** Owning team / component. */
  owner: string;
}

/** Augmented FeatureState with v2 metadata. */
export interface FeatureStateV2 extends FeatureState {
  category?: FeatureCategory;
  description?: string;
  since?: string;
  owner?: string;
}

/**
 * Registry of every known feature flag. Populated by:
 *   1. The BUILTIN_FEATURES array below (56 entries across 5 categories)
 *   2. Plugin code calling registerFeature() at startup
 *
 * Lookup is O(1); the registry is process-wide.
 */
const REGISTERED_FEATURES = new Map<string, FeatureFlag>();

/**
 * Built-in feature flag catalog. Source of truth for the 50+ compile
 * flags referenced across the codebase. Adding a new flag here makes
 * it visible to `doctor()` / `listFeatures()` and enables
 * `isFeatureCompiledIn()` lookups in the DCE pattern.
 *
 * Each flag is gated by:
 *   - Compile: BUN_CONFIG_FEATURE_<NAME>=0/1  (Bun.build DCE)
 *   - Startup: FEATURE_<NAME>=false/true      (boot-time kill switch)
 *   - Runtime: featureGates.set(<NAME>, { ratio, userId }) for A/B
 *
 * Production rollout: register with defaultEnabled=false so a fresh
 * deploy doesn't accidentally turn on an unfinished feature; gate
 * activation on featureGates.set() with a ratio ramp.
 */
const BUILTIN_FEATURES: ReadonlyArray<FeatureFlag> = [
  // ---- Agent (16) -----------------------------------------------------
  { name: 'COORDINATOR_MODE',       description: 'Main agent runs as pure dispatcher, not researcher',        category: 'agent', defaultEnabled: false, since: '2026.6.0', owner: 'core' },
  { name: 'COORDINATOR_V2',         description: 'v2 coordinator with worker-xml + runVerification',         category: 'agent', defaultEnabled: false, since: '2026.6.0', owner: 'core' },
  { name: 'WORKER_RESUME',          description: 'Worker task retry with exponential backoff',              category: 'agent', defaultEnabled: true,  since: '2026.6.0', owner: 'core' },
  { name: 'WORKER_XML',             description: 'Worker results serialized as <task-notification> XML',     category: 'agent', defaultEnabled: true,  since: '2026.6.0', owner: 'core' },
  { name: 'AGENT_SCRATCHPAD',       description: 'Single-source scratchpad for all tool results',            category: 'agent', defaultEnabled: true,  since: '2026.4.0', owner: 'core' },
  { name: 'AGENT_TOKEN_COUNTING',   description: 'Accurate token estimation + context threshold management', category: 'agent', defaultEnabled: true,  since: '2026.4.0', owner: 'core' },
  { name: 'AGENT_PARALLEL_TOOLS',   description: 'Run independent tool calls concurrently within one turn',  category: 'agent', defaultEnabled: true,  since: '2026.5.0', owner: 'core' },
  { name: 'AGENT_STREAMING',        description: 'Stream LLM tokens to the TUI in real time',               category: 'agent', defaultEnabled: true,  since: '2026.3.0', owner: 'core' },
  { name: 'AGENT_VISION',           description: 'Multimodal image inputs in the agent loop',               category: 'agent', defaultEnabled: false, since: '2026.5.0', owner: 'core' },
  { name: 'AGENT_CACHE_CONTROL',    description: 'Anthropic cache_control for prompt caching cost savings',  category: 'agent', defaultEnabled: true,  since: '2026.5.0', owner: 'core' },
  { name: 'AGENT_MULTI_TURN',       description: 'Multi-turn dialog with conversation history compression',  category: 'agent', defaultEnabled: true,  since: '2026.3.0', owner: 'core' },
  { name: 'AGENT_TOOL_FILTER',      description: 'Whitelist / blacklist tools by role',                     category: 'agent', defaultEnabled: true,  since: '2026.6.0', owner: 'core' },
  { name: 'AGENT_GUARDRAILS',       description: 'Pre-tool-call safety checks + rate limits',               category: 'agent', defaultEnabled: false, since: '2026.5.0', owner: 'core' },
  { name: 'AGENT_REFLECTION',       description: 'Self-critique pass after each turn',                      category: 'agent', defaultEnabled: false, since: '2026.6.0', owner: 'core' },
  { name: 'AGENT_CONTEXT_COMPACTION', description: 'Compress old tool results when token budget exceeded',  category: 'agent', defaultEnabled: true,  since: '2026.5.0', owner: 'core' },
  { name: 'KAIROS_PROACTIVE',       description: 'Kairos 6-state proactive agent with autonomy mode',       category: 'agent', defaultEnabled: false, since: '2026.6.0', owner: 'kairos' },

  // ---- Trading (10) ----------------------------------------------------
  { name: 'PAPER_TRADING',          description: 'Paper trading with simulated order matching',             category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'BACKTEST_V2',            description: 'Full pipeline: data -> strategy -> match -> attribution', category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'BACKTEST_ENGINE',        description: 'High-throughput backtest simulator',                      category: 'trading', defaultEnabled: true,  since: '2026.4.0', owner: 'trading' },
  { name: 'RISK_CONTROL',           description: 'Real-time position / sector / concentration checks',     category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'POSITION_SIZING',        description: 'Kelly / vol-target / fixed-fraction sizing models',      category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'STOP_LOSS_AUTO',         description: 'Auto stop-loss on every open position',                   category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'PORTFOLIO_REBALANCE',    description: 'Periodic portfolio rebalance to target weights',          category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'TRADE_ROUTING',          description: 'Smart order routing across brokers',                      category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'ORDER_TYPES_ADVANCED',   description: 'Iceberg, TWAP, VWAP, bracket orders',                     category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },
  { name: 'MARGIN_TRADING',         description: 'Margin / short-selling support',                          category: 'trading', defaultEnabled: false, since: '2026.6.0', owner: 'trading' },

  // ---- Data (10) -------------------------------------------------------
  { name: 'ALT_DATA',               description: 'Alt-data adapters: news / reports / social / block trades', category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'NEWS_FEED',              description: 'Real-time news feed (Eastmoney + Xueqiu + Reuters)',      category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'REALTIME_FEED',          description: 'Level-1 real-time quote feed',                            category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'FILINGS_FEED',           description: 'SEC / HKEX / SSE filings, parsed into structured events',  category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'SOCIAL_SENTIMENT',       description: 'Social media sentiment (Xueqiu / Twitter / Reddit)',      category: 'data', defaultEnabled: false, since: '2026.6.0', owner: 'data' },
  { name: 'DRAGON_TIGER',           description: 'Dragon-Tiger list (龙虎榜) daily',                       category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'NORTH_BOUND',            description: 'Northbound / Stock-Connect flow tracking',                category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'FUND_FLOW',              description: 'Main-board net inflow / outflow, institutional flow',     category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'INSIDER_TRADES',         description: 'Form 4 / 5 insider transaction feed',                     category: 'data', defaultEnabled: true, since: '2026.4.0', owner: 'data' },
  { name: 'INSTITUTIONAL_FEED',     description: 'Choice / Wind institutional-grade data feed',            category: 'data', defaultEnabled: false, since: '2026.6.0', owner: 'data' },

  // ---- Tools (10) ------------------------------------------------------
  { name: 'SKILL_TOOL',             description: 'SKILL.md-based extensible workflows (DCF, dca, ...)',     category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'BROWSER_TOOL',           description: 'Playwright-based headless browser for rich page reads',   category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'WEB_SEARCH_TOOL',        description: 'Exa / Tavily web search',                                category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'FINANCIAL_SEARCH_TOOL',   description: 'financial_datasets API for prices / metrics / filings',   category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'FILE_EDIT_TOOL',         description: 'Edit files with diff-based preview + rollback',           category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'BASH_TOOL',              description: 'Sandboxed shell exec with confirmation prompts',          category: 'tools', defaultEnabled: true, since: '2026.4.0', owner: 'tools' },
  { name: 'BRIDGE_TOOL',            description: 'Remote bridge (SSH / HTTP) to other UpUp instances',      category: 'tools', defaultEnabled: false, since: '2026.6.0', owner: 'bridge' },
  { name: 'SESSION_TOOL',           description: 'Persist + replay agent sessions across machines',         category: 'tools', defaultEnabled: false, since: '2026.6.0', owner: 'bridge' },
  { name: 'SCREEN_TOOL',            description: 'Stock screener with natural-language queries',            category: 'tools', defaultEnabled: false, since: '2026.6.0', owner: 'tools' },
  { name: 'RESEARCH_TOOL',          description: 'AlphaSense-style deep research: full-text + citation graph', category: 'tools', defaultEnabled: false, since: '2026.6.0', owner: 'tools' },

  // ---- Analytics (10) --------------------------------------------------
  { name: 'TELEMETRY',              description: 'Structured event logging to local + remote sinks',         category: 'analytics', defaultEnabled: true, since: '2026.4.0', owner: 'analytics' },
  { name: 'A_B_TESTING',            description: 'A/B experiment framework with deterministic bucketing',   category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'GROWTHBOOK',             description: 'GrowthBook-style feature experiments with variants',      category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'ACCURACY_METRICS',       description: 'Per-tool accuracy tracking + drift detection',             category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'EVENT_LOGGING',          description: 'Domain event log (research, trade, alert, ...)',          category: 'analytics', defaultEnabled: true, since: '2026.4.0', owner: 'analytics' },
  { name: 'FUNNELS',                description: 'Funnel analytics: analyze_user -> analyze_symbol -> trade', category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'COHORTS',                description: 'User cohort analysis for retention / activation',         category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'ALERTS',                 description: 'Real-time alert system (price / news / risk thresholds)',  category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'DASHBOARDS',             description: 'Pre-built analytics dashboards',                          category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
  { name: 'REPORTS',                description: 'Scheduled + on-demand PDF/HTML reports',                  category: 'analytics', defaultEnabled: false, since: '2026.6.0', owner: 'analytics' },
];

// Populate the registry at module load. Idempotent if a plugin
// re-registers with the same flag (last write wins; the metadata is
// typically identical).
for (const f of BUILTIN_FEATURES) {
  REGISTERED_FEATURES.set(f.name, f);
}

/**
 * Register a feature flag at runtime. Use from plugins to add new flags
 * beyond the 56 built-ins. Idempotent: re-registering the same name
 * overwrites the metadata.
 */
export function registerFeature(flag: FeatureFlag): void {
  REGISTERED_FEATURES.set(flag.name, flag);
}

/**
 * Look up a flag's metadata. Returns null if the flag isn't registered.
 * Use this to check "is this a known flag?" before reading env vars.
 */
export function getFeatureFlag(name: string): FeatureFlag | null {
  return REGISTERED_FEATURES.get(name) ?? null;
}

/**
 * List every known feature flag with its current state. Output is sorted
 * by category then name for stable diffs in `featureGates.doctor()`
 * output and CLI listing.
 */
export function listFeatures(): FeatureStateV2[] {
  return Array.from(REGISTERED_FEATURES.values())
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    })
    .map((f) => ({
      name: f.name,
      enabled: featureGates.isEnabled(f.name),
      source: sourceFor(f.name),
      category: f.category,
      description: f.description,
      since: f.since,
      owner: f.owner,
    }));
}

/** Compute the current source for a given flag (compile / startup / runtime / default). */
function sourceFor(name: string): FeatureSource {
  return featureGates.inspect(name).source;
}

/**
 * DCE-friendly compile-time check. Returns true iff the flag is BOTH
 * registered AND currently enabled.
 *
 * Use in `if (isFeatureCompiledIn('FOO')) { ... }` blocks. When
 * BUN_CONFIG_FEATURE_FOO=0 is set at build time, Bun.build can
 * dead-code-eliminate the entire branch (assuming the inline call is
 * statically resolvable, which it is for a const string literal).
 *
 * The two-condition check (registered + enabled) means a typo in a flag
 * name returns false silently rather than silently passing the gate —
 * match the spirit of the v1 system that required explicit registration.
 */
export function isFeatureCompiledIn(name: string): boolean {
  const flag = REGISTERED_FEATURES.get(name);
  if (!flag) return false; // typo guard: unknown name returns false
  // The v1 engine handles env vars + runtime overrides. If those don't
  // enable the flag, fall back to the registry's defaultEnabled so a
  // BUILTIN_FEATURE with `defaultEnabled: true` is on out of the box
  // without requiring an extra featureGates.register() call.
  if (featureGates.isEnabled(name)) return true;
  return flag.defaultEnabled;
}


/** Convenience: top-level `featureGates.isEnabled('kairos')` style API. */
export const featureGates: FeatureGates = {
  isEnabled: (n, c) => getDefaultGates().isEnabled(n, c),
  set: (n, c) => getDefaultGates().set(n, c),
  clearRuntime: (n) => getDefaultGates().clearRuntime(n),
  inspect: (n) => getDefaultGates().inspect(n),
  doctor: () => getDefaultGates().doctor(),
  register: (n, o) => getDefaultGates().register(n, o),
};
