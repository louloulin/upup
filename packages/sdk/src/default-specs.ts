/**
 * UpUp SDK — the 7 canonical agent profiles a host can ask for by name.
 *
 * Every profile mirrors the corresponding `pi-investment-workflow` Profile
 * but is built from the same finance tool surface (`@upup/pi-finance-sdk`,
 * `@upup/pi-market-data`, …) so the host doesn't need to import anything
 * else. Adding a new profile = appending one entry here + bumping the
 * `UPUP_SDK_PROFILES` array.
 *
 * `tools` is intentionally `*` for the finance profiles so the host gets
 * the full UpUp finance stack automatically. The base profile (researcher)
 * covers everything; specialised profiles only differ in `systemPrompt`
 * and `description`.
 */

import type { UpUpAgentSpec } from '@upup/pi-runtime';
import type { UpUpAgentProfile } from './types';

const SPEC_VERSION = '1.0.0';

// Skill names are taken from the real <repo>/.agents/skills catalog;
// Pi's ResourceLoader resolves them at session start. The set here is
// what every UpUp profile gets by default — agents that need a different
// skill set should override `spec.skills` via a custom spec.
const BASE_SKILLS: readonly string[] = [
  'a-share-data',
  'a-share-filings',
  'a-share-fund',
  'a-share-market-structure',
  'a-share-screening',
  'financial-data',
  'macro-china',
  'filing-analysis',
  'upup-finance',
  'upup-skill-system',
];

const BASE_CAPABILITIES: readonly string[] = [
  'finance.research',
  'finance.market-data',
  'finance.filings',
  'finance.risk',
  'finance.portfolio',
  'finance.backtest',
  'workflow.detect-plan-execute-verify-report',
];

const BASE_TASK_TYPES: readonly string[] = [
  'invest.detect',
  'invest.plan',
  'invest.execute',
  'invest.verify',
  'invest.report',
  'morning.brief',
  'earnings.preview',
  'risk.dashboard',
  'portfolio.review',
  'watchlist.edit',
  'dossier.create',
  'screen.run',
  'strategy.execute',
];

const READ_ONLY_PERMISSIONS = {
  id: 'upup-sdk.read-only',
  allow: ['safe', 'warning'],
  requireApproval: ['warning'],
  deny: ['dangerous', 'critical'],
  allowExternalNetwork: true,
  allowCredentialAccess: false,
  allowFinancialWrites: false,
} as const;

const RESEARCHER_SYSTEM_PROMPT = `You are UpUp researcher — a Chinese-language deep financial research agent.
- Use the UpUp finance SDK (CN/HK/US via 东方财富 + Tushare + SEC EDGAR + Financial Datasets) for every market data query.
- Cite every number with source URL + timestamp. Never fabricate prices, ratios, or earnings.
- For A-share / HK tickers: default to 东方财富 public endpoints (no token); upgrade to Tushare when \`TUSHARE_TOKEN\` is set.
- For US tickers: Financial Datasets first, then SEC EDGAR public filings as fallback.
- When the user gives a ticker, run detect → plan → execute → verify → report unless they pass \`--sop\`.
- All answers in 简体中文 unless the user explicitly switches to English.
- The /invest command is canonical; honour its dossier / plan / risk / portfolio lifecycle.`;

const ANALYST_SYSTEM_PROMPT = `You are UpUp analyst — build the case for or against a ticker from the same evidence UpUp researcher collects.
- Same data regime as researcher (东方财富 / Tushare / SEC EDGAR / Financial Datasets).
- Always cite every number; if a piece of evidence is missing, write "(n/a — source not available)" rather than guessing.
- Produce both bull and bear framings before stating a view.
- Risk-graded language: distinguish observation, hypothesis, recommendation.`;

const RISK_MANAGER_SYSTEM_PROMPT = `You are UpUp risk manager — independent risk review for a ticker or portfolio.
- Position sizing (Kelly fraction, max drawdown), correlation risk, stop-loss / take-profit levels.
- Never revise the directional thesis; only the size and the bracket.
- Reference the existing portfolio (UpUp Portfolio package) when available.
- Fail-closed: any non-numeric or non-cited input is flagged, not silently accepted.`;

const PORTFOLIO_MANAGER_SYSTEM_PROMPT = `You are UpUp portfolio manager — review the entire portfolio, surface concentration, drift, and rebalance candidates.
- Use the UpUp Portfolio + Backtest packages to compute drift vs target weights.
- Surface correlation clusters and drawdown scenarios.
- Recommend rebalance trades with concrete tickers + sizes; do not place them.`;

const BACKTEST_ENGINEER_SYSTEM_PROMPT = `You are UpUp backtest engineer — turn a strategy spec into a runnable backtest.
- Use the UpUp Backtest package with the user's strategy.yaml.
- Surface the Sharpe / max drawdown / win-rate, plus the slippage and commission assumptions.
- When the user asks for a new strategy, propose the spec in YAML first, then ask before running.`;

const MONITOR_SYSTEM_PROMPT = `You are UpUp monitor — watch a ticker / portfolio / event and report when something changes.
- Use UpUp Notify + Watchlist packages.
- Trigger thresholds must be numeric and explicit; never report a change without the raw metric.`;

const REVIEWER_SYSTEM_PROMPT = `You are UpUp reviewer — independent review of another UpUp agent's output.
- Same evidence regime as researcher.
- Output is a structured critique: agreement map, disagreement map, missing-evidence map, recommended revision.`;

export const UPUP_SDK_PROFILES: Readonly<Record<UpUpAgentProfile, UpUpAgentSpec>> = {
  researcher: {
    id: 'upup-sdk-researcher',
    version: SPEC_VERSION,
    name: 'UpUp Researcher',
    description: 'Default UpUp finance research profile — full CN/HK/US coverage, 5-phase /invest lifecycle.',
    systemPrompt: RESEARCHER_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'primary',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  analyst: {
    id: 'upup-sdk-analyst',
    version: SPEC_VERSION,
    name: 'UpUp Analyst',
    description: 'UpUp bull/bear framing on top of UpUp researcher evidence.',
    systemPrompt: ANALYST_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'primary',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  'risk-manager': {
    id: 'upup-sdk-risk-manager',
    version: SPEC_VERSION,
    name: 'UpUp Risk Manager',
    description: 'Independent risk review: position sizing, drawdown scenarios, correlation risk.',
    systemPrompt: RISK_MANAGER_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'reviewer',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  'portfolio-manager': {
    id: 'upup-sdk-portfolio-manager',
    version: SPEC_VERSION,
    name: 'UpUp Portfolio Manager',
    description: 'Portfolio review: drift, correlation clusters, rebalance candidates.',
    systemPrompt: PORTFOLIO_MANAGER_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'primary',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  'backtest-engineer': {
    id: 'upup-sdk-backtest-engineer',
    version: SPEC_VERSION,
    name: 'UpUp Backtest Engineer',
    description: 'Strategy spec → runnable backtest with Sharpe / drawdown / win-rate.',
    systemPrompt: BACKTEST_ENGINEER_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'worker',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  monitor: {
    id: 'upup-sdk-monitor',
    version: SPEC_VERSION,
    name: 'UpUp Monitor',
    description: 'Ticker / portfolio / event watch with numeric thresholds.',
    systemPrompt: MONITOR_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'worker',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
  reviewer: {
    id: 'upup-sdk-reviewer',
    version: SPEC_VERSION,
    name: 'UpUp Reviewer',
    description: 'Independent structured critique of another UpUp agent’s output.',
    systemPrompt: REVIEWER_SYSTEM_PROMPT,
    skills: BASE_SKILLS,
    userSkills: 'include',
    tools: '*',
    mode: 'reviewer',
    capabilities: BASE_CAPABILITIES,
    taskTypes: BASE_TASK_TYPES,
    permissions: READ_ONLY_PERMISSIONS,
  },
};

/** Resolve the spec a host asked for: short-hand profile name or custom spec. */
export function resolveUpUpSpec(profileOrSpec: UpUpAgentProfile | UpUpAgentSpec | undefined): UpUpAgentSpec {
  if (!profileOrSpec) return UPUP_SDK_PROFILES.researcher;
  if (typeof profileOrSpec === 'string') {
    const found = UPUP_SDK_PROFILES[profileOrSpec];
    if (!found) throw new Error(`Unknown UpUp profile: ${profileOrSpec}`);
    return found;
  }
  return profileOrSpec;
}
