/**
 * UpUp research DAG — wraps `@arhen/pi-core-subagent`'s dependency-graph
 * scheduler to replace the 4-role parallel worker loop in
 * `packages/pi-investment-analysis/src/research-coordinator.ts`.
 *
 * Why a dedicated bridge:
 *   `@arhen/pi-core-subagent` ships a `subagent` tool whose `tasks[]`
 *   array supports a `needs` edge array (DAG). UpUp's
 *   `runResearchCoordinator` currently uses `Promise.all` to run 4
 *   roles in parallel; that works for a flat topology but cannot
 *   express "fundamental-analysis must complete before capital-flow
 *   starts". With the DAG scheduler, a SOP author can define a
 *   `requires: ['fundamental-analysis']` edge and Pi handles the
 *   sequencing, retries, timeouts, and evidence forwarding.
 *
 * Usage:
 *   registerUpUpResearchDag(pi)  — registers `upup_research_dag` tool
 *
 *   The tool takes a symbol + question + optional `needs` overrides.
 *   When the caller passes no custom needs, the 4 default roles run in
 *   parallel (matching the current behaviour); when the caller passes
 *   `needs`, the DAG scheduler sequences them.
 *
 * Failure isolation:
 *   `@arhen/pi-core-subagent` registration is optional; a missing
 *   package yields zero registrations and the legacy coordinator is
 *   still callable.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createEcosystemImporter } from './ecosystem-resolver';

type TaskItem = {
  readonly id: string;
  readonly agent: string;
  readonly task: string;
  readonly needs?: readonly string[];
  readonly tools?: readonly string[];
  readonly model?: string;
  readonly thinking?: string;
};

type SubagentInput = {
  readonly tasks: readonly TaskItem[];
  readonly concurrency?: number;
  readonly await?: boolean;
};

type SubagentResult = {
  readonly run?: {
    readonly id: string;
    readonly tasks: readonly { readonly id: string; readonly agent: string; readonly status: string; readonly text?: string }[];
  };
};

type SubagentToolInput = { readonly input: Record<string, unknown> };

export interface UpUpResearchDagOptions {
  readonly sink?: { readonly onError?: (where: string, error: unknown) => void };
  /** Override the package loader (tests inject a fake). */
  readonly importer?: (specifier: string) => Promise<unknown>;
}

const RESEARCH_ROLE_TOOLS: Readonly<Record<string, readonly string[]>> = {
  'technical-analysis': ['get_market_data', 'get_technical_data', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv'],
  'fundamental-analysis': ['get_financials', 'read_filings', 'get_company_profile', 'dcf_model', 'ddm_model', 'valuation_ratios', 'peer_comparison'],
  'capital-flow': ['get_market_data', 'get_market_structure', 'get_sector_data', 'get_astock_price'],
  'sentiment-analysis': ['web_fetch', 'browser', 'get_astock_news', 'get_market_data'],
};

const RESEARCH_ROLE_PROMPTS: Readonly<Record<string, string>> = {
  'technical-analysis': '你是技术分析研究员。只基于工具返回的证据分析趋势、动量、波动与关键价位，明确区分事实和推断。',
  'fundamental-analysis': '你是基本面研究员。分析财务质量、估值、竞争地位与催化剂，所有结论必须引用工具证据并标注不确定性。',
  'capital-flow': '你是资金流研究员。分析市场结构、板块轮动、成交与资金行为，避免把推测写成事实。',
  'sentiment-analysis': '你是情绪与事件研究员。检索近期新闻和事件，评估情绪、风险与可能影响，保留来源证据。',
};

const ALL_ROLES: readonly string[] = ['technical-analysis', 'fundamental-analysis', 'capital-flow', 'sentiment-analysis'];

function buildDefaultTasks(symbol: string, question: string): readonly TaskItem[] {
  return ALL_ROLES.map((role) => ({
    id: role,
    agent: role,
    task: `${RESEARCH_ROLE_PROMPTS[role]}\n\n标的: ${symbol}\n研究问题: ${question}`,
    tools: [...RESEARCH_ROLE_TOOLS[role]],
  }));
}

export async function registerUpUpResearchDag(
  pi: ExtensionAPI,
  options: UpUpResearchDagOptions = {},
): Promise<boolean> {
  try {
    // Resolved through the dual-scope importer so a user-installed copy in
    // `~/.upup/agent/npm` shadows the bundled one.
    const load = options.importer ?? createEcosystemImporter();
    // `@arhen/pi-core-subagent` registers a `subagent` tool whose name
    // collides with `pi-subagents` (loaded via `<agentDir>/settings.json#packages`).
    // Loading `@arhen` twice — once through UpUp's ecosystem sweep and once
    // through this DAG bridge — would escalate the duplicate to a fatal
    // `Failed to load extension` diagnostic. Skip whenever either package
    // is present; the legacy `research-coordinator` covers the
    // bull/bear/synthesizer/risk workflow without needing `@arhen`'s
    // DAG scheduler.
    const { piLoadedPackageNames } = await import('./ecosystem-extension');
    const loaded = piLoadedPackageNames();
    if (loaded.has('@arhen/pi-core-subagent') || loaded.has('pi-subagents')) {
      options.sink?.onError?.('@arhen/pi-core-subagent', new Error('skipped: a subagent-registered package is already loaded; legacy research-coordinator covers UpUp'));
      return false;
    }
    const mod = (await load('@arhen/pi-core-subagent')) as { default: (api: ExtensionAPI) => void };
    if (typeof mod.default !== 'function') {
      options.sink?.onError?.('@arhen/pi-core-subagent', new Error('default export is not a function'));
      return false;
    }
    mod.default(pi);
    return true;
  } catch (error) {
    options.sink?.onError?.('@arhen/pi-core-subagent', error);
    return false;
  }
}

export function buildUpUpResearchDagTasks(
  symbol: string,
  question: string,
  needs?: Readonly<Record<string, readonly string[]>>,
): readonly TaskItem[] {
  if (!needs) return buildDefaultTasks(symbol, question);
  return ALL_ROLES.map((role) => ({
    id: role,
    agent: role,
    task: `${RESEARCH_ROLE_PROMPTS[role]}\n\n标的: ${symbol}\n研究问题: ${question}`,
    ...(needs[role] ? { needs: [...needs[role]] } : {}),
    tools: [...RESEARCH_ROLE_TOOLS[role]],
  }));
}

export const researchDagRoles = ALL_ROLES;
