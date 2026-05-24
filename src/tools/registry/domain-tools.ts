/**
 * Domain-specific tool registrations — portfolio, worktree, skill discovery,
 * messaging, config, export, sleep, workflow, monitor, tool search, team,
 * valuation, notebook, notify, subscribe-pr, subagent, LSP, research,
 * watchlist, benchmark, FX, multi-portfolio, calendar, short-interest,
 * backtest, cache.
 */

import type { RegisteredTool } from './types.js';
import { systemMetadata } from './types.js';
import {
  createAddPositionTool, createUpdatePositionTool,
  createRemovePositionTool, createGetPortfolioTool,
  ADD_POSITION_DESCRIPTION, UPDATE_POSITION_DESCRIPTION,
  REMOVE_POSITION_DESCRIPTION, GET_PORTFOLIO_DESCRIPTION,
} from '../portfolio/index.js';
import {
  createWorktreeTool, removeWorktreeTool, listWorktreeTool,
  CREATE_WORKTREE_DESCRIPTION, REMOVE_WORKTREE_DESCRIPTION, LIST_WORKTREE_DESCRIPTION,
} from '../worktree/index.js';
import {
  createListSkillsTool, createSearchSkillsTool, createGetSkillTool,
  LIST_SKILLS_DESCRIPTION, SEARCH_SKILLS_DESCRIPTION, GET_SKILL_DESCRIPTION,
} from '../discovery/index.js';
import { createSendMessageTool, SEND_MESSAGE_DESCRIPTION } from '../send-message.js';
import { createSnipTool, SNIP_TOOL_DESCRIPTION } from '../snip-tool.js';
import { createSleepTool, SLEEP_TOOL_DESCRIPTION } from '../sleep-tool.js';
import { createMonitorTool, MONITOR_TOOL_DESCRIPTION } from '../monitor-tool.js';
import {
  createToolSearchTool, createToolGetTool, createToolListTool,
  TOOL_SEARCH_DESCRIPTION, TOOL_GET_DESCRIPTION, TOOL_LIST_DESCRIPTION,
} from '../tool-search-tool.js';
import {
  createTeamCreateTool, createTeamDeleteTool, createTeamListTool,
  createTeamAddMemberTool, createTeamRemoveMemberTool,
  createTeamStatusTool, createTeamUpdateStatusTool,
  TEAM_CREATE_DESCRIPTION, TEAM_DELETE_DESCRIPTION, TEAM_LIST_DESCRIPTION,
  TEAM_ADD_MEMBER_DESCRIPTION, TEAM_REMOVE_MEMBER_DESCRIPTION,
  TEAM_STATUS_DESCRIPTION, TEAM_UPDATE_STATUS_DESCRIPTION,
} from '../team-tools.js';
import {
  createValuationRatiosTool, createDCFTool, createPeerComparisonTool,
  createDecisionDashboardTool, createCalculateTargetPriceTool, createQuickTargetPriceTool,
  VALUATION_RATIOS_DESCRIPTION, DCF_MODEL_DESCRIPTION, PEER_COMPARISON_DESCRIPTION,
  DECISION_DASHBOARD_DESCRIPTION, CALCULATE_TARGET_PRICE_DESCRIPTION, QUICK_TARGET_PRICE_DESCRIPTION,
} from '../valuation/index.js';
import {
  createNotebookReadTool, createNotebookCreateTool, createNotebookEditCellTool,
  createNotebookInsertCellTool, createNotebookDeleteCellTool,
  NOTEBOOK_READ_DESCRIPTION, NOTEBOOK_CREATE_DESCRIPTION,
  NOTEBOOK_EDIT_CELL_DESCRIPTION, NOTEBOOK_INSERT_CELL_DESCRIPTION, NOTEBOOK_DELETE_CELL_DESCRIPTION,
} from '../notebook/index.js';
import {
  createNotifyTool, createNotifyListTool,
  NOTIFY_DESCRIPTION, NOTIFY_LIST_DESCRIPTION,
  createSubscribePRTool, createUnsubscribePRTool, createListPRSubscriptionsTool,
  SUBSCRIBE_PR_DESCRIPTION, UNSUBSCRIBE_PR_DESCRIPTION, LIST_PR_SUBSCRIPTIONS_DESCRIPTION,
} from '../notify/index.js';
import {
  createExportPortfolioTool, createExportWatchlistTool, createExportDataTool,
  EXPORT_PORTFOLIO_DESCRIPTION, EXPORT_WATCHLIST_DESCRIPTION, EXPORT_DATA_DESCRIPTION,
} from '../export/index.js';
import {
  createLSPCompleteTool, createLSPDefinitionTool, createLSPReferencesTool,
  createLSPHoverTool, createLSPDiagnosticsTool,
  LSP_COMPLETE_DESCRIPTION, LSP_DEFINITION_DESCRIPTION,
  LSP_REFERENCES_DESCRIPTION, LSP_HOVER_DESCRIPTION, LSP_DIAGNOSTICS_DESCRIPTION,
} from '../lsp/index.js';
import {
  createConfigGetTool, createConfigSetTool, createConfigListTool,
  CONFIG_TOOL_GET_DESCRIPTION, CONFIG_TOOL_SET_DESCRIPTION, CONFIG_TOOL_LIST_DESCRIPTION,
} from '../config-tool.js';
import {
  createForkSubagentTool, createResumeAgentTool,
  createAgentMemoryTool, createListAgentsTool, createRunBuiltInAgentTool,
  FORK_SUBAGENT_DESCRIPTION, RESUME_AGENT_DESCRIPTION,
  AGENT_MEMORY_DESCRIPTION, LIST_AGENTS_DESCRIPTION, RUN_BUILTIN_AGENT_DESCRIPTION,
} from '../../agent/subagent/types.js';

// Research tool descriptions (placeholders)
const ANALYZE_SENTIMENT_DESCRIPTION = "Analyze sentiment from financial text.";
const DETECT_EVENTS_DESCRIPTION = "Detect investment events.";
const EXTRACT_ENTITIES_DESCRIPTION = "Extract entities from text.";

const researchTools: any[] = [];
import { workflowTools, WORKFLOW_TOOL_DESCRIPTION } from '../workflow/index.js';

// Dynamic imports needed for watchlist/benchmark/fx/multi-portfolio/calendar/short-interest/backtest/cache
// These are loaded via dynamic import to keep the module clean

export async function loadDomainTools(): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [];

  // Portfolio management
  tools.push({ name: 'add_position', tool: createAddPositionTool(), description: ADD_POSITION_DESCRIPTION, compactDescription: 'Add a new position to portfolio tracking', concurrencySafe: true });
  tools.push({ name: 'update_position', tool: createUpdatePositionTool(), description: UPDATE_POSITION_DESCRIPTION, compactDescription: 'Update existing position quantity or cost', concurrencySafe: true });
  tools.push({ name: 'remove_position', tool: createRemovePositionTool(), description: REMOVE_POSITION_DESCRIPTION, compactDescription: 'Remove a position from portfolio tracking', concurrencySafe: true });
  tools.push({ name: 'get_portfolio', tool: createGetPortfolioTool(), description: GET_PORTFOLIO_DESCRIPTION, compactDescription: 'Get portfolio positions with P&L calculations', concurrencySafe: true });

  // Worktree
  tools.push({ name: 'create_worktree', tool: createWorktreeTool(), description: CREATE_WORKTREE_DESCRIPTION, compactDescription: 'Create a new git worktree for isolated development', concurrencySafe: true });
  tools.push({ name: 'remove_worktree', tool: removeWorktreeTool(), description: REMOVE_WORKTREE_DESCRIPTION, compactDescription: 'Remove a git worktree', concurrencySafe: true });
  tools.push({ name: 'list_worktree', tool: listWorktreeTool(), description: LIST_WORKTREE_DESCRIPTION, compactDescription: 'List all git worktrees in the repository', concurrencySafe: true });

  // Skill discovery
  tools.push({ name: 'list_skills', tool: createListSkillsTool(), description: LIST_SKILLS_DESCRIPTION, compactDescription: 'List all available skills in the system', concurrencySafe: true });
  tools.push({ name: 'search_skills', tool: createSearchSkillsTool(), description: SEARCH_SKILLS_DESCRIPTION, compactDescription: 'Search for skills by keyword', concurrencySafe: true });
  tools.push({ name: 'get_skill', tool: createGetSkillTool(), description: GET_SKILL_DESCRIPTION, compactDescription: 'Get detailed information about a specific skill', concurrencySafe: true });

  // Messaging & utilities
  tools.push({ name: 'send_message', tool: createSendMessageTool(), description: SEND_MESSAGE_DESCRIPTION, compactDescription: 'Send a message to another agent, task, or broadcast to all team members', concurrencySafe: true });
  tools.push({ name: 'snip_tool', tool: createSnipTool(), description: SNIP_TOOL_DESCRIPTION, compactDescription: 'Remove low-value confirmation/acknowledgment messages from context', concurrencySafe: true });
  tools.push({ name: 'sleep', tool: createSleepTool(), description: SLEEP_TOOL_DESCRIPTION, compactDescription: 'Pause execution for specified duration (0-3600 seconds)', concurrencySafe: true });
  tools.push({ name: 'monitor', tool: createMonitorTool(), description: MONITOR_TOOL_DESCRIPTION, compactDescription: 'Report system resource usage (CPU, memory, uptime)', concurrencySafe: true });

  // Tool search
  tools.push({ name: 'tool_search', tool: createToolSearchTool(), description: TOOL_SEARCH_DESCRIPTION, compactDescription: 'Search available tools by keyword, name, or safety', concurrencySafe: true });
  tools.push({ name: 'tool_get', tool: createToolGetTool(), description: TOOL_GET_DESCRIPTION, compactDescription: 'Get detailed info about a specific tool', concurrencySafe: true });
  tools.push({ name: 'tool_list', tool: createToolListTool(), description: TOOL_LIST_DESCRIPTION, compactDescription: 'List all available tools in the registry', concurrencySafe: true });

  // Team tools
  tools.push({ name: 'team_create', tool: createTeamCreateTool(), description: TEAM_CREATE_DESCRIPTION, compactDescription: 'Create a new team for multi-agent collaboration', concurrencySafe: true });
  tools.push({ name: 'team_delete', tool: createTeamDeleteTool(), description: TEAM_DELETE_DESCRIPTION, compactDescription: 'Delete a team and clean up all resources', concurrencySafe: true });
  tools.push({ name: 'team_list', tool: createTeamListTool(), description: TEAM_LIST_DESCRIPTION, compactDescription: 'List all teams with member counts and status', concurrencySafe: true });
  tools.push({ name: 'team_add_member', tool: createTeamAddMemberTool(), description: TEAM_ADD_MEMBER_DESCRIPTION, compactDescription: 'Add a member/agent to a team', concurrencySafe: true });
  tools.push({ name: 'team_remove_member', tool: createTeamRemoveMemberTool(), description: TEAM_REMOVE_MEMBER_DESCRIPTION, compactDescription: 'Remove a member from a team', concurrencySafe: true });
  tools.push({ name: 'team_status', tool: createTeamStatusTool(), description: TEAM_STATUS_DESCRIPTION, compactDescription: 'Get detailed status of a team including all members', concurrencySafe: true });
  tools.push({ name: 'team_update_status', tool: createTeamUpdateStatusTool(), description: TEAM_UPDATE_STATUS_DESCRIPTION, compactDescription: 'Update team status (active, paused, completed)', concurrencySafe: true });

  // Valuation
  tools.push({ name: 'valuation_ratios', tool: createValuationRatiosTool(), description: VALUATION_RATIOS_DESCRIPTION, compactDescription: 'Calculate PE, PB, PCF ratios and market cap', concurrencySafe: true });
  tools.push({ name: 'dcf_model', tool: createDCFTool(), description: DCF_MODEL_DESCRIPTION, compactDescription: 'DCF intrinsic value calculation with terminal value', concurrencySafe: true });
  tools.push({ name: 'peer_comparison', tool: createPeerComparisonTool(), description: PEER_COMPARISON_DESCRIPTION, compactDescription: 'Compare company metrics against industry peers', concurrencySafe: true });
  tools.push({ name: 'decision_dashboard', tool: createDecisionDashboardTool(), description: DECISION_DASHBOARD_DESCRIPTION, compactDescription: 'Four-dimension scoring (technical/fundamental/sentiment/risk) with buy/sell signal', concurrencySafe: true });
  tools.push({ name: 'calculate_target_price', tool: createCalculateTargetPriceTool(), description: CALCULATE_TARGET_PRICE_DESCRIPTION, compactDescription: 'Calculate fair value target price using DCF, PE, or SOTP methods', concurrencySafe: true });
  tools.push({ name: 'quick_target_price', tool: createQuickTargetPriceTool(), description: QUICK_TARGET_PRICE_DESCRIPTION, compactDescription: 'Quick target price with minimal params (EPS + growth rate)', concurrencySafe: true });

  // Notebook
  const notebookTools = [
    { name: 'notebook_read', tool: createNotebookReadTool(), description: NOTEBOOK_READ_DESCRIPTION, compact: 'Read Jupyter notebook cells and metadata' },
    { name: 'notebook_create', tool: createNotebookCreateTool(), description: NOTEBOOK_CREATE_DESCRIPTION, compact: 'Create a new empty Jupyter notebook' },
    { name: 'notebook_edit_cell', tool: createNotebookEditCellTool(), description: NOTEBOOK_EDIT_CELL_DESCRIPTION, compact: 'Edit a cell in a Jupyter notebook' },
    { name: 'notebook_insert_cell', tool: createNotebookInsertCellTool(), description: NOTEBOOK_INSERT_CELL_DESCRIPTION, compact: 'Insert a new cell into a Jupyter notebook' },
    { name: 'notebook_delete_cell', tool: createNotebookDeleteCellTool(), description: NOTEBOOK_DELETE_CELL_DESCRIPTION, compact: 'Delete a cell from a Jupyter notebook' },
  ];
  for (const { name, tool, description, compact } of notebookTools) {
    tools.push({ name, tool, description, compactDescription: compact, concurrencySafe: false });
  }

  // Notify
  tools.push({ name: 'notify', tool: createNotifyTool(), description: NOTIFY_DESCRIPTION, compactDescription: 'Send push notification via webhook, Feishu, or log', concurrencySafe: true });
  tools.push({ name: 'notify_list', tool: createNotifyListTool(), description: NOTIFY_LIST_DESCRIPTION, compactDescription: 'List recent notifications from the log', concurrencySafe: true });

  // SubscribePR
  tools.push({ name: 'subscribe_pr', tool: createSubscribePRTool(), description: SUBSCRIBE_PR_DESCRIPTION, compactDescription: 'Subscribe to GitHub PR events (comment, review, merge) via webhook', concurrencySafe: true });
  tools.push({ name: 'unsubscribe_pr', tool: createUnsubscribePRTool(), description: UNSUBSCRIBE_PR_DESCRIPTION, compactDescription: 'Unsubscribe from a PR subscription', concurrencySafe: true });
  tools.push({ name: 'list_pr_subscriptions', tool: createListPRSubscriptionsTool(), description: LIST_PR_SUBSCRIPTIONS_DESCRIPTION, compactDescription: 'List active PR subscriptions', concurrencySafe: true });

  // Enhanced Subagent tools
  const subagentTools = [
    { name: 'fork_subagent', tool: createForkSubagentTool(), description: FORK_SUBAGENT_DESCRIPTION, compactDescription: 'Fork a subagent with inherited context from parent agent', concurrencySafe: false },
    { name: 'resume_agent', tool: createResumeAgentTool(), description: RESUME_AGENT_DESCRIPTION, compactDescription: 'Resume a previously paused agent to continue its task', concurrencySafe: false },
    { name: 'agent_memory', tool: createAgentMemoryTool(), description: AGENT_MEMORY_DESCRIPTION, compactDescription: 'Store or retrieve memory associated with an agent session', concurrencySafe: true },
    { name: 'list_agents', tool: createListAgentsTool(), description: LIST_AGENTS_DESCRIPTION, compactDescription: 'List available built-in agent types (code-reviewer, researcher, etc.)', concurrencySafe: true },
    { name: 'run_builtin_agent', tool: createRunBuiltInAgentTool(), description: RUN_BUILTIN_AGENT_DESCRIPTION, compactDescription: 'Run a built-in specialized agent (code-reviewer, tester, debugger, etc.)', concurrencySafe: false },
  ];
  for (const { name, tool, description, compactDescription, concurrencySafe } of subagentTools) {
    tools.push({ name, tool, description, compactDescription, concurrencySafe });
  }

  // LSP tools
  tools.push({ name: 'lsp_complete', tool: createLSPCompleteTool(), description: LSP_COMPLETE_DESCRIPTION, compactDescription: 'Get code completions at a position in a file', concurrencySafe: true });
  tools.push({ name: 'lsp_definition', tool: createLSPDefinitionTool(), description: LSP_DEFINITION_DESCRIPTION, compactDescription: 'Find definition of symbol at position', concurrencySafe: true });
  tools.push({ name: 'lsp_references', tool: createLSPReferencesTool(), description: LSP_REFERENCES_DESCRIPTION, compactDescription: 'Find all references to symbol at position', concurrencySafe: true });
  tools.push({ name: 'lsp_hover', tool: createLSPHoverTool(), description: LSP_HOVER_DESCRIPTION, compactDescription: 'Get hover/type information for symbol at position', concurrencySafe: true });
  tools.push({ name: 'lsp_diagnostics', tool: createLSPDiagnosticsTool(), description: LSP_DIAGNOSTICS_DESCRIPTION, compactDescription: 'Get diagnostics (errors/warnings) for a file', concurrencySafe: true });

  // Research tools (智能投研)
  for (const researchTool of researchTools) {
    if (!researchTool?.name) continue;
    const toolName = researchTool.name;
    let compactDescription = '';
    let description = '';
    if (toolName === 'analyze_sentiment') {
      compactDescription = 'Analyze sentiment (positive/negative/neutral) of financial text';
      description = ANALYZE_SENTIMENT_DESCRIPTION;
    } else if (toolName === 'detect_events') {
      compactDescription = 'Detect investment events (earnings, M&A, regulatory) from text';
      description = DETECT_EVENTS_DESCRIPTION;
    } else if (toolName === 'extract_entities') {
      compactDescription = 'Extract stock tickers, numbers, and dates from text';
      description = EXTRACT_ENTITIES_DESCRIPTION;
    }
    tools.push({ name: toolName, tool: researchTool, description, compactDescription, concurrencySafe: true });
  }

  // Config tools
  tools.push({ name: 'config_get', tool: createConfigGetTool(), description: CONFIG_TOOL_GET_DESCRIPTION, compactDescription: 'Read a configuration value from UpUp settings', concurrencySafe: true, concurrencyMetadata: systemMetadata() });
  tools.push({
    name: 'config_set', tool: createConfigSetTool(), description: CONFIG_TOOL_SET_DESCRIPTION, compactDescription: 'Write a configuration value to UpUp settings',
    concurrencySafe: false,
    concurrencyMetadata: { safe: false, safetyLevel: 'warning', category: 'system', sideEffects: { readsFiles: false, writesFiles: true, makesNetworkRequests: false, hasRateLimit: false, modifiesState: true, spawnsProcess: false, hasFinancialImpact: false }, maxConcurrent: 1 },
  });
  tools.push({ name: 'config_list', tool: createConfigListTool(), description: CONFIG_TOOL_LIST_DESCRIPTION, compactDescription: 'List all configuration keys and values', concurrencySafe: true, concurrencyMetadata: systemMetadata() });

  // Export tools
  tools.push({ name: 'export_portfolio', tool: createExportPortfolioTool(), description: EXPORT_PORTFOLIO_DESCRIPTION, compactDescription: 'Export portfolio to CSV/JSON file', concurrencySafe: true });
  tools.push({ name: 'export_watchlist', tool: createExportWatchlistTool(), description: EXPORT_WATCHLIST_DESCRIPTION, compactDescription: 'Export watchlist to CSV/JSON file', concurrencySafe: true });
  tools.push({ name: 'export_data', tool: createExportDataTool(), description: EXPORT_DATA_DESCRIPTION, compactDescription: 'Export analysis data to CSV/JSON file', concurrencySafe: true });

  // Workflow tools
  for (const workflowTool of workflowTools) {
    if (!workflowTool?.name) continue;
    tools.push({
      name: workflowTool.name, tool: workflowTool, description: WORKFLOW_TOOL_DESCRIPTION,
      compactDescription: 'Execute a multi-step workflow as a single atomic operation',
      concurrencySafe: false,
      concurrencyMetadata: {
        safe: false, safetyLevel: 'dangerous', category: 'execute',
        sideEffects: { readsFiles: true, writesFiles: true, makesNetworkRequests: true, hasRateLimit: true, modifiesState: true, spawnsProcess: false, hasFinancialImpact: false },
        conflictsWith: ['workflowTools', 'subagent'], maxConcurrent: 1,
      },
    });
  }

  // ===== Dynamic-import domains (watchlist, benchmark, fx, multi-portfolio, calendar, short-interest, backtest, cache) =====
  await loadDynamicDomainTools(tools);

// Swarm tools (multi-agent)
try {
  const { swarmTools } = await import('../../multi-agent/index.js');
  for (const tool of swarmTools) {
    if (!tool?.name) continue;
    tools.push({
      name: tool.name,
      tool,
      description: tool.description,
      compactDescription: `Swarm: ${tool.description}`,
      concurrencySafe: true,
      concurrencyMetadata: {
        safe: true,
        safetyLevel: 'safe',
        category: 'system',
        sideEffects: { readsFiles: false, writesFiles: true, makesNetworkRequests: false, hasRateLimit: false, modifiesState: true, spawnsProcess: false, hasFinancialImpact: false },
        maxConcurrent: 5,
      },
    });
  }
} catch { /* swarm tools not available */ }

  return tools;
}

async function loadDynamicDomainTools(tools: RegisteredTool[]): Promise<void> {
  // Watchlist
  try {
    const wl = await import('../watchlist/index.js');
    tools.push({ name: 'add_to_watchlist', tool: wl.createAddToWatchlistTool(), description: wl.ADD_TO_WATCHLIST_DESCRIPTION, compactDescription: 'Add a stock to your investment watchlist for tracking', concurrencySafe: true });
    tools.push({ name: 'remove_from_watchlist', tool: wl.createRemoveFromWatchlistTool(), description: wl.REMOVE_FROM_WATCHLIST_DESCRIPTION, compactDescription: 'Remove a stock from your investment watchlist', concurrencySafe: true });
    tools.push({ name: 'get_watchlist', tool: wl.createGetWatchlistTool(), description: wl.GET_WATCHLIST_DESCRIPTION, compactDescription: 'Get your current investment watchlist with alerts', concurrencySafe: true });
    tools.push({ name: 'add_watchlist_alert', tool: wl.createAddAlertTool(), description: wl.ADD_WATCHLIST_ALERT_DESCRIPTION, compactDescription: 'Add a price alert to a watchlist symbol', concurrencySafe: true });
    tools.push({ name: 'check_watchlist_alerts', tool: wl.createCheckAlertsTool(), description: wl.CHECK_WATCHLIST_ALERTS_DESCRIPTION, compactDescription: 'Check watchlist alerts against current prices', concurrencySafe: true });
    tools.push({ name: 'clear_watchlist_alert', tool: wl.createClearAlertTool(), description: 'Clear or dismiss a triggered watchlist alert. Use after reviewing the alert to remove it from the active alerts list.', compactDescription: 'Clear a watchlist alert after it triggers', concurrencySafe: true });
  } catch { /* watchlist tools not available */ }

  // Benchmark
  try {
    const bm = await import('../benchmark/index.js');
    tools.push({ name: 'list_benchmarks', tool: bm.createListBenchmarksTool(), description: bm.LIST_BENCHMARKS_DESCRIPTION, compactDescription: 'List available market benchmarks (SPX, CSI300, NDX)', concurrencySafe: true });
    tools.push({ name: 'compare_to_benchmark', tool: bm.createCompareBenchmarkTool(), description: bm.COMPARE_BENCHMARK_DESCRIPTION, compactDescription: 'Compare portfolio return vs benchmarks for alpha', concurrencySafe: true });
    tools.push({ name: 'calculate_alpha', tool: bm.createCalculateAlphaTool(), description: bm.CALCULATE_ALPHA_DESCRIPTION, compactDescription: 'Calculate portfolio alpha vs a benchmark', concurrencySafe: true });
  } catch { /* benchmark tools not available */ }

  // FX Currency
  try {
    const fx = await import('../fx/index.js');
    tools.push({ name: 'convert_currency', tool: fx.createConvertCurrencyTool(), description: fx.CONVERT_CURRENCY_DESCRIPTION, compactDescription: 'Convert between currencies (USD/CNY/HKD/EUR/GBP)', concurrencySafe: true });
    tools.push({ name: 'list_currencies', tool: fx.createListCurrenciesTool(), description: fx.LIST_CURRENCIES_DESCRIPTION, compactDescription: 'List supported currencies for conversion', concurrencySafe: true });
    tools.push({ name: 'get_exchange_rate', tool: fx.createGetRateTool(), description: fx.GET_EXCHANGE_RATE_DESCRIPTION, compactDescription: 'Get current exchange rate between two currencies', concurrencySafe: true });
  } catch { /* fx tools not available */ }

  // Multi-Portfolio
  try {
    const mp = await import('../portfolio/multi-portfolio.js');
    const mpTools = mp.multiPortfolioTools;
    for (const pt of mpTools) {
      if (!pt?.name) continue;
      const toolName = pt.name;
      let compactDescription = '';
      if (toolName === 'list_portfolios') compactDescription = 'List all portfolios and show which one is active';
      else if (toolName === 'create_portfolio') compactDescription = 'Create a new named portfolio for tracking separate strategies';
      else if (toolName === 'delete_portfolio') compactDescription = 'Delete a named portfolio';
      else if (toolName === 'switch_portfolio') compactDescription = 'Switch the active portfolio for subsequent operations';
      else if (toolName === 'add_position_multi') compactDescription = 'Add a position to a specific portfolio';
      else if (toolName === 'remove_position_multi') compactDescription = 'Remove a position from a specific portfolio';
      else if (toolName === 'get_portfolio_multi') compactDescription = 'Get detailed view of a specific portfolio with P&L';
      tools.push({ name: toolName, tool: pt, description: `Multi-portfolio: ${toolName}`, compactDescription, concurrencySafe: true });
    }
  } catch { /* multi-portfolio tools not available */ }

  // Calendar
  try {
    const cal = await import('../calendar/index.js');
    tools.push({ name: 'check_trading_day', tool: cal.createCheckTradingDayTool(), description: cal.CHECK_TRADING_DAY_DESCRIPTION, compactDescription: 'Check if a date is a trading day for US/China/HK markets', concurrencySafe: true });
    tools.push({ name: 'get_upcoming_holidays', tool: cal.createGetUpcomingHolidaysTool(), description: cal.GET_UPCOMING_HOLIDAYS_DESCRIPTION, compactDescription: 'Get upcoming market holidays for US/China/HK', concurrencySafe: true });
    tools.push({ name: 'get_next_trading_day', tool: cal.createGetNextTradingDayTool(), description: cal.GET_NEXT_TRADING_DAY_DESCRIPTION, compactDescription: 'Find next trading day after a given date', concurrencySafe: true });
    tools.push({ name: 'get_trading_days', tool: cal.createGetTradingDaysTool(), description: cal.GET_TRADING_DAYS_DESCRIPTION, compactDescription: 'Get all trading days between two dates', concurrencySafe: true });
  } catch { /* calendar tools not available */ }

  // Short Interest
  try {
    const si = await import('../short-interest/index.js');
    tools.push({ name: 'get_short_interest', tool: si.createGetShortInterestTool(), description: si.GET_SHORT_INTEREST_DESCRIPTION, compactDescription: 'Get short interest data and squeeze risk analysis', concurrencySafe: true });
    tools.push({ name: 'calculate_short_interest_ratio', tool: si.createCalculateShortInterestRatioTool(), description: si.CALCULATE_SHORT_INTEREST_RATIO_DESCRIPTION, compactDescription: 'Calculate position squeeze risk from short interest', concurrencySafe: true });
    tools.push({ name: 'detect_short_squeeze', tool: si.createDetectShortSqueezeTool(), description: si.DETECT_SHORT_SQUEEZE_DESCRIPTION, compactDescription: 'Screen stocks for short squeeze potential', concurrencySafe: true });
  } catch { /* short interest tools not available */ }

  // Backtest
  try {
    const bt = await import('../backtest/index.js');
    tools.push({ name: 'evaluate_trade', tool: bt.createEvaluateTradeTool(), description: bt.EVALUATE_TRADE_DESCRIPTION, compactDescription: 'Evaluate single historical trade against forward price data', concurrencySafe: true });
    tools.push({ name: 'run_backtest', tool: bt.createRunBacktestTool(), description: bt.RUN_BACKTEST_DESCRIPTION, compactDescription: 'Run batch backtest on multiple historical trades', concurrencySafe: true });
    tools.push({ name: 'get_backtest_summary', tool: bt.createGetBacktestSummaryTool(), description: bt.GET_BACKTEST_SUMMARY_DESCRIPTION, compactDescription: 'Get guidance on backtest summary metrics interpretation', concurrencySafe: true });
    tools.push({ name: 'calculate_win_rate', tool: bt.createCalculateWinRateTool(), description: bt.CALCULATE_WIN_RATE_DESCRIPTION, compactDescription: 'Calculate win rate from trade outcomes', concurrencySafe: true });
  } catch { /* backtest tools not available */ }

  // Cache
  try {
    const cache = await import('../cache/index.js');
    tools.push({ name: 'get_cache_stats', tool: cache.createGetCacheStatsTool(), description: cache.GET_CACHE_STATS_DESCRIPTION, compactDescription: 'Get market data cache statistics', concurrencySafe: true });
    tools.push({ name: 'clear_cache', tool: cache.createClearCacheTool(), description: cache.CLEAR_CACHE_DESCRIPTION, compactDescription: 'Clear the market data cache', concurrencySafe: true });
    tools.push({ name: 'invalidate_cache', tool: cache.createInvalidateCacheTool(), description: cache.INVALIDATE_CACHE_DESCRIPTION, compactDescription: 'Invalidate specific cache entries by prefix', concurrencySafe: true });
    tools.push({ name: 'get_cache_info', tool: cache.createCacheInfoTool(), description: cache.GET_CACHE_INFO_DESCRIPTION, compactDescription: 'Get cache configuration information', concurrencySafe: true });
  } catch { /* cache tools not available */ }
}
