import type { UpUpAgentSpec, UpUpPermissionProfile, UpUpToolSafetyLevel } from './types.js';

const SAFETY_LEVELS: readonly UpUpToolSafetyLevel[] = ['safe', 'warning', 'dangerous', 'critical'];

export const READ_ONLY_PERMISSION_PROFILE: UpUpPermissionProfile = {
  id: 'read-only',
  allow: ['safe', 'warning'],
  requireApproval: [],
  deny: ['dangerous', 'critical'],
  allowExternalNetwork: true,
  allowCredentialAccess: false,
  allowFinancialWrites: false,
};

const PI_FINANCE_PACKAGE = '@upup/pi-finance-sdk';
const PI_MARKET_DATA_PACKAGE = '@upup/pi-market-data';
const PI_INVESTMENT_ANALYSIS_PACKAGE = '@upup/pi-investment-analysis';
const PI_RISK_PACKAGE = '@upup/pi-risk';
const PI_PORTFOLIO_PACKAGE = '@upup/pi-portfolio';
const PI_BACKTEST_PACKAGE = '@upup/pi-backtest';
const PI_PLATFORM_PACKAGE = '@upup/pi-platform';
const PI_RESEARCH_PACKAGE = '@upup/pi-research';
const PI_BROWSER_PACKAGE = '@upup/pi-browser';
const PI_CONFIG_PACKAGE = '@upup/pi-config';
const PI_CACHE_PACKAGE = '@upup/pi-cache';
const PI_NOTIFY_PACKAGE = '@upup/pi-notify';
const PI_INVESTMENT_WORKFLOW_PACKAGE = '@upup/pi-investment-workflow';
const PI_CORE_FINANCE_PACKAGES = [
  PI_FINANCE_PACKAGE,
  PI_MARKET_DATA_PACKAGE,
  PI_INVESTMENT_ANALYSIS_PACKAGE,
  PI_RISK_PACKAGE,
  PI_PORTFOLIO_PACKAGE,
  PI_BACKTEST_PACKAGE,
  PI_PLATFORM_PACKAGE,
  PI_RESEARCH_PACKAGE,
  PI_BROWSER_PACKAGE,
  PI_CONFIG_PACKAGE,
  PI_CACHE_PACKAGE,
  PI_NOTIFY_PACKAGE,
  PI_INVESTMENT_WORKFLOW_PACKAGE,
] as const;
const PI_PLATFORM_TOOLS = [
  'skill', 'bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'send_user_file', 'heartbeat', 'cron',
  'memory_search', 'memory_get', 'memory_update', 'list_mcp_resources', 'read_mcp_resource',
  'mcp_auth_set', 'mcp_auth_get', 'mcp_auth_clear', 'agent', 'enter_plan_mode', 'exit_plan_mode',
  'add_plan_step', 'update_plan_step', 'list_plan_steps', 'create_todo', 'update_todo', 'list_todos',
  'delete_todo', 'task_create', 'task_get', 'task_list', 'task_stop', 'task_update', 'task_result',
  'config_get', 'config_set', 'config_list',
  'get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info',
  'notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions',
] as const;

export interface PiSubagentSpecInput {
  id?: string;
  name?: string;
  type?: 'general' | 'specialized' | 'fork';
  tools: readonly string[] | '*';
  model?: string | 'inherit';
  systemPrompt?: string;
  timeoutMs?: number;
  skills?: readonly string[];
  packages?: readonly string[];
  capabilities?: readonly string[];
  taskTypes?: readonly string[];
  workflow?: string;
  permissions?: UpUpPermissionProfile;
  dataPolicy?: UpUpAgentSpec['dataPolicy'];
  outputContract?: UpUpAgentSpec['outputContract'];
}

export const INVESTMENT_PROFILES: Readonly<Record<string, UpUpAgentSpec>> = {
  'invest-explore': {
    id: 'invest-explore',
    version: '1.0.0',
    name: 'Investment Explorer',
    description: 'Collects financial evidence without changing user state.',
    packages: PI_CORE_FINANCE_PACKAGES,
    skills: ['finance-evidence', 'financial-research', 'fundamental-analysis', 'market-data'],
    tools: [
      ...PI_PLATFORM_TOOLS,
      'get_financials', 'get_market_data', 'read_filings', 'stock_screener',
      'get_astock_price', 'get_astock_financials', 'get_astock_news', 'screen_astocks', 'stock_analysis',
      'get_sector_data', 'get_market_structure', 'get_technical_data', 'fund_search', 'fund_detail', 'fund_performance', 'fund_holdings', 'web_search', 'x_search', 'research_deep_search', 'matrix_analysis',
      'fund_manager', 'fund_compare', 'fund_list', 'fund_alert_list', 'fund_screen', 'fund_top', 'web_fetch', 'browser',
      'get_company_profile', 'get_risks', 'get_sectors', 'get_short_interest',
      'check_trading_day', 'get_upcoming_holidays', 'get_next_trading_day', 'get_trading_days',
      'market_data_quote', 'market_data_history', 'market_data_provider_health', 'market_data_provider_trend',
    ],
    mode: 'subagent',
    capabilities: ['market-data', 'fundamentals', 'filings', 'news', 'search'],
    taskTypes: ['research', 'screening', 'evidence'],
    permissions: READ_ONLY_PERMISSION_PROFILE,
    dataPolicy: 'live',
    outputContract: 'evidence',
  },
  'invest-plan': {
    id: 'invest-plan',
    version: '1.0.0',
    name: 'Investment Planner',
    description: 'Builds and audits deterministic investment research plans.',
    packages: PI_CORE_FINANCE_PACKAGES,
    skills: ['finance-evidence', 'investment-workflow', 'research-planning'],
    tools: [...PI_PLATFORM_TOOLS, 'invest_workflow_phase', 'get_market_data', 'get_financials', 'read_filings', 'web_fetch', 'web_search', 'x_search', 'research_deep_search', 'matrix_analysis', 'dcf_model', 'ddm_model', 'calculate_target_price', 'decision_dashboard', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'fund_follow', 'fund_unfollow', 'fund_alert_create', 'fund_alert_delete'],
    mode: 'subagent',
    capabilities: ['planning', 'task-decomposition'],
    taskTypes: ['plan', 'invest'],
    permissions: {
      ...READ_ONLY_PERMISSION_PROFILE,
      id: 'investment-plan',
      allow: ['safe', 'warning', 'dangerous'],
      requireApproval: ['dangerous'],
      deny: ['critical'],
    },
    workflow: 'invest',
    outputContract: 'report',
  },
  'invest-risk': {
    id: 'invest-risk',
    version: '1.0.0',
    name: 'Investment Risk Analyst',
    description: 'Analyzes portfolio, market, and scenario risk using read-only data.',
    packages: PI_CORE_FINANCE_PACKAGES,
    skills: ['finance-evidence', 'risk-management', 'portfolio-management', 'a-share-risk'],
    tools: [...PI_PLATFORM_TOOLS, 'get_market_data', 'get_financials', 'portfolio_attribution', 'calculate_var', 'calculate_max_drawdown', 'run_backtest', 'research_deep_search', 'matrix_analysis', 'decision_dashboard', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility'],
    mode: 'subagent',
    capabilities: ['risk', 'portfolio', 'scenario-analysis'],
    taskTypes: ['risk', 'portfolio', 'stress-test'],
    permissions: READ_ONLY_PERMISSION_PROFILE,
    workflow: 'invest',
    outputContract: 'report',
  },
  'invest-trade': {
    id: 'invest-trade',
    version: '1.0.0',
    name: 'Investment Trade Simulator',
    description: 'Prepares and validates simulated trades without real execution.',
    packages: PI_CORE_FINANCE_PACKAGES,
    skills: ['finance-evidence', 'trade-execution', 'position-management'],
    tools: [...PI_PLATFORM_TOOLS, 'run_backtest', 'portfolio_attribution', 'place_trade_order', 'cancel_trade_order', 'strategy_run_paper', 'strategy_list', 'strategy_backtest', 'get_trading_positions', 'get_trading_balance', 'get_trade_quote'],
    mode: 'subagent',
    capabilities: ['simulation', 'trade-draft'],
    taskTypes: ['trade', 'rebalance', 'backtest'],
    permissions: {
      ...READ_ONLY_PERMISSION_PROFILE,
      id: 'investment-trade-sandbox',
      allow: ['safe', 'warning', 'dangerous'],
      requireApproval: ['dangerous'],
      deny: ['critical'],
    },
    workflow: 'invest',
    outputContract: 'json',
  },
  'invest-review': {
    id: 'invest-review',
    version: '1.0.0',
    name: 'Investment Reviewer',
    description: 'Checks evidence, calculations, citations, and report consistency.',
    packages: PI_CORE_FINANCE_PACKAGES,
    skills: ['finance-evidence', 'research-report-writing', 'citation-quality', 'verification'],
    tools: [...PI_PLATFORM_TOOLS, 'get_market_data', 'get_financials', 'read_filings', 'research_deep_search', 'matrix_analysis', 'dcf_model', 'ddm_model', 'calculate_target_price', 'decision_dashboard', 'calculate_technical_indicators', 'calculate_kdj', 'calculate_boll', 'calculate_wr', 'calculate_cci', 'calculate_atr', 'calculate_obv', 'calculate_option_price', 'calculate_option_greeks', 'calculate_implied_volatility', 'portfolio_attribution'],
    mode: 'reviewer',
    capabilities: ['verification', 'citations', 'reporting'],
    taskTypes: ['review', 'verify', 'report'],
    permissions: READ_ONLY_PERMISSION_PROFILE,
    workflow: 'invest',
    outputContract: 'report',
  },
};

export function validateAgentSpec(spec: UpUpAgentSpec): void {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(spec.id)) throw new Error(`Invalid agent id: ${spec.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(spec.version)) throw new Error(`Invalid agent version: ${spec.version}`);
  if (!spec.name.trim() || !spec.description.trim()) throw new Error(`Agent ${spec.id} requires name and description`);
  if (spec.packages?.some((name) => !/^(@[a-z0-9-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(name))) {
    throw new Error(`Agent ${spec.id} contains an invalid Pi package name`);
  }
  if (spec.packages && new Set(spec.packages).size !== spec.packages.length) {
    throw new Error(`Agent ${spec.id} contains duplicate Pi package names`);
  }
  if (spec.tools !== '*' && spec.tools.length === 0) throw new Error(`Agent ${spec.id} must declare tools or *`);
  if (spec.permissions.deny.some((level) => !SAFETY_LEVELS.includes(level))) {
    throw new Error(`Agent ${spec.id} contains an unknown denied safety level`);
  }
  if (spec.permissions.allowFinancialWrites && spec.permissions.deny.includes('dangerous')) {
    throw new Error(`Agent ${spec.id} cannot allow financial writes while denying dangerous tools`);
  }
  if (spec.maxConcurrency !== undefined && (!Number.isInteger(spec.maxConcurrency) || spec.maxConcurrency < 1)) {
    throw new Error(`Agent ${spec.id} has invalid maxConcurrency`);
  }
  if (spec.timeoutMs !== undefined && (!Number.isInteger(spec.timeoutMs) || spec.timeoutMs < 1)) {
    throw new Error(`Agent ${spec.id} has invalid timeoutMs`);
  }
}

export function serializeAgentSpec(spec: UpUpAgentSpec): string {
  validateAgentSpec(spec);
  return JSON.stringify(spec, null, 2);
}

export function subagentConfigToPiSpec(config: PiSubagentSpecInput): UpUpAgentSpec {
  const type = config.type ?? 'general';
  const rawId = config.id ?? `subagent-${type}`;
  const id = rawId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'subagent-general';
  const permissions = config.permissions ?? {
    id: `subagent-${type}-readonly`,
    allow: ['safe', 'warning'],
    requireApproval: ['dangerous'],
    deny: ['critical'],
    allowExternalNetwork: true,
    allowCredentialAccess: false,
    allowFinancialWrites: false,
  } satisfies UpUpPermissionProfile;
  return {
    id,
    version: '1.0.0',
    name: config.name?.trim() || `Pi ${type} subagent`,
    description: `Pi-backed ${type} subagent`,
    ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
    ...(config.skills ? { skills: [...config.skills] } : {}),
    ...(config.packages ? { packages: [...config.packages] } : {}),
    tools: config.tools,
    ...(config.model && config.model !== 'inherit' ? { model: config.model } : {}),
    mode: type === 'fork' ? 'subagent' : 'worker',
    capabilities: [...(config.capabilities ?? [type])],
    taskTypes: [...(config.taskTypes ?? [type])],
    permissions,
    ...(config.workflow ? { workflow: config.workflow } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.dataPolicy ? { dataPolicy: config.dataPolicy } : {}),
    outputContract: config.outputContract ?? 'markdown',
  };
}

/** Convert a legacy registry definition into the only executable Pi shape. */
export function agentDefinitionToPiSpec(definition: {
  id: string;
  name: string;
  description: string;
  version?: string;
  capabilities?: readonly string[];
  taskTypes?: readonly string[];
  systemPrompt?: string;
  preferredModel?: string;
  skills?: readonly string[];
  packages?: readonly string[];
  mode?: UpUpAgentSpec['mode'];
  permissions?: UpUpPermissionProfile;
  workflow?: string;
  dataPolicy?: UpUpAgentSpec['dataPolicy'];
  outputContract?: UpUpAgentSpec['outputContract'];
  timeoutMs?: number;
  config?: Record<string, unknown>;
}): UpUpAgentSpec {
  const configuredTools = definition.config?.tools ?? definition.config?.toolWhitelist;
  const configuredPackages = definition.packages ?? (Array.isArray(definition.config?.packages)
    ? definition.config.packages.filter((packageName): packageName is string => typeof packageName === 'string')
    : undefined);
  const configuredToolNames = Array.isArray(configuredTools)
    ? configuredTools.filter((tool): tool is string => typeof tool === 'string')
    : [];
  const tools = configuredToolNames.length > 0 ? configuredToolNames : '*';
  return {
    id: definition.id,
    version: definition.version ?? '1.0.0',
    name: definition.name,
    description: definition.description,
    ...(definition.systemPrompt ? { systemPrompt: definition.systemPrompt } : {}),
    ...(definition.skills ? { skills: [...definition.skills] } : {}),
    ...(configuredPackages ? { packages: [...configuredPackages] } : {}),
    ...(definition.preferredModel ? { model: definition.preferredModel } : {}),
    tools,
    mode: definition.mode ?? 'subagent',
    capabilities: definition.capabilities ?? [],
    taskTypes: definition.taskTypes ?? [],
    permissions: definition.permissions ?? READ_ONLY_PERMISSION_PROFILE,
    ...(definition.workflow ? { workflow: definition.workflow } : {}),
    ...(definition.dataPolicy ? { dataPolicy: definition.dataPolicy } : {}),
    outputContract: definition.outputContract ?? 'report',
    ...(definition.timeoutMs !== undefined ? { timeoutMs: definition.timeoutMs } : {}),
  };
}

export function getInvestmentAgentSpec(id: string): UpUpAgentSpec {
  const spec = INVESTMENT_PROFILES[id];
  if (!spec) throw new Error(`Unknown investment agent: ${id}`);
  return spec;
}
