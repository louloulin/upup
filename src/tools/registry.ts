import { StructuredToolInterface } from '@langchain/core/tools';
import { createGetFinancials, createGetMarketData, createReadFilings, createScreenStocks } from './finance/index.js';
import { exaSearch, perplexitySearch, tavilySearch, WEB_SEARCH_DESCRIPTION, xSearchTool, X_SEARCH_DESCRIPTION } from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from './fetch/web-fetch.js';
import { browserTool, BROWSER_DESCRIPTION } from './browser/browser.js';

// Lazy load - avoid importing browser module unless needed
let browserToolCache: typeof browserTool | null = null;
let browserToolDescriptionCache: string | null = null;
let playwrightAvailableCache: boolean | null = null;

/**
 * Check if playwright is available in the environment.
 * Uses cached result for performance.
 */
async function isPlaywrightAvailable(): Promise<boolean> {
  if (playwrightAvailableCache !== null) {
    return playwrightAvailableCache;
  }
  try {
    await import('playwright');
    playwrightAvailableCache = true;
  } catch {
    playwrightAvailableCache = false;
  }
  return playwrightAvailableCache;
}
import { readFileTool, READ_FILE_DESCRIPTION } from './filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './filesystem/edit-file.js';
import { globTool } from './filesystem/glob.js';
import { grepTool } from './filesystem/grep.js';
import { sendUserFileTool, SEND_USER_FILE_DESCRIPTION } from './filesystem/send-user-file.js';
import { workflowTools, WORKFLOW_TOOL_DESCRIPTION } from './workflow/index.js';
import { GET_FINANCIALS_DESCRIPTION } from './finance/get-financials.js';
import { GET_MARKET_DATA_DESCRIPTION } from './finance/get-market-data.js';
import { READ_FILINGS_DESCRIPTION } from './finance/read-filings.js';
import { SCREEN_STOCKS_DESCRIPTION } from './finance/screen-stocks.js';
import { heartbeatTool, HEARTBEAT_TOOL_DESCRIPTION } from './heartbeat/heartbeat-tool.js';
import { cronTool, CRON_TOOL_DESCRIPTION } from './cron/cron-tool.js';
import { memoryGetTool, MEMORY_GET_DESCRIPTION, memorySearchTool, MEMORY_SEARCH_DESCRIPTION, memoryUpdateTool, MEMORY_UPDATE_DESCRIPTION } from './memory/index.js';
import { discoverSkills } from '../skills/index.js';
import { getMCPStatus, mcpToolsToRegisteredTools, getMCPToolDescriptions } from '../mcp/index.js';
import { getDefaultMCPClient } from '../mcp/client.js';
import { listMcpResourcesTool, readMcpResourceTool, LIST_MCP_RESOURCES_DESCRIPTION, READ_MCP_RESOURCE_DESCRIPTION } from '../mcp/resource-tools.js';

import { getAStockPrice, GET_ASTOCK_PRICE_DESCRIPTION } from './astock/get-astock-price.js';
import { getAStockFinancials, GET_ASTOCK_FINANCIALS_DESCRIPTION } from './astock/get-astock-financials.js';
import { getAStockNews, GET_ASTOCK_NEWS_DESCRIPTION } from './astock/get-astock-news.js';
import { screenAstocks, SCREEN_ASTOCKS_DESCRIPTION } from './astock/screen-astocks.js';
import { getSectorData, GET_SECTOR_DATA_DESCRIPTION } from './astock/get-sector-data.js';
import { getTechnicalData, GET_TECHNICAL_DATA_DESCRIPTION } from './astock/get-technical-data.js';
import { getMarketStructure, GET_MARKET_STRUCTURE_DESCRIPTION } from './astock/get-market-structure.js';
import { buildAgentTool, AGENT_TOOL_DESCRIPTION, AGENT_TOOL_COMPACT_DESCRIPTION } from './agent-tool.js';
import { info, warn } from '../utils/logging/logger.js';
import {
  createEnterPlanModeTool,
  createExitPlanModeTool,
  createAddPlanStepTool,
  createUpdatePlanStepTool,
  createListPlanStepsTool,
} from './plan/index.js';
import {
  createCreateTodoTool,
  createUpdateTodoTool,
  createListTodosTool,
  createDeleteTodoTool,
  CREATE_TODO_DESCRIPTION,
  UPDATE_TODO_DESCRIPTION,
  LIST_TODOS_DESCRIPTION,
  DELETE_TODO_DESCRIPTION,
} from './todo/todo-tool.js';
import {
  createTaskCreateTool,
  createTaskGetTool,
  createTaskListTool,
  createTaskStopTool,
  createTaskUpdateTool,
  TASK_CREATE_DESCRIPTION,
  TASK_GET_DESCRIPTION,
  TASK_LIST_DESCRIPTION,
  TASK_STOP_DESCRIPTION,
  TASK_UPDATE_DESCRIPTION,
} from './task/task-tool.js';
import {
  createAskConfirmTool,
  createAskSelectTool,
  createAskMultiSelectTool,
  createAskInputTool,
  createAskResponseTool,
  ASK_CONFIRM_DESCRIPTION,
  ASK_SELECT_DESCRIPTION,
  ASK_MULTI_SELECT_DESCRIPTION,
  ASK_INPUT_DESCRIPTION,
  ASK_RESPONSE_DESCRIPTION,
} from './ask/ask-tool.js';
import {
  createCalculateVaRTool,
  createCalculateSharpeTool,
  createCalculateSortinoTool,
  createCalculateMaxDrawdownTool,
  createCalculateOptionPriceTool,
  createCalculateGreeksTool,
  createCalculateImpliedVolTool,
  createCalculateTaxTool,
  createCalculateTradesTaxTool,
  createCalculatePnLTool,
  createCalculateIndicatorsTool,
  createCalculateKDJTool,
  createCalculateBOLLTool,
  createCalculateKellyTool,
  createCalculateRiskParityTool,
  createCalculateMeanVarianceTool,
  createScoreDataSourceTool,
  createCompareDataSourcesTool,
  createCorrelationMatrixTool,
  createCalculateCorrelationTool,
  CALCULATE_VAR_DESCRIPTION,
  CALCULATE_SHARPE_DESCRIPTION,
  CALCULATE_SORTINO_DESCRIPTION,
  CALCULATE_MAX_DRAWDOWN_DESCRIPTION,
  CALCULATE_OPTION_PRICE_DESCRIPTION,
  CALCULATE_GREEKS_DESCRIPTION,
  CALCULATE_IMPLIED_VOL_DESCRIPTION,
  CALCULATE_TAX_DESCRIPTION,
  CALCULATE_TRADES_TAX_DESCRIPTION,
  CALCULATE_PNL_DESCRIPTION,
  CALCULATE_TECHNICAL_INDICATORS_DESCRIPTION,
  CALCULATE_KDJ_DESCRIPTION,
  CALCULATE_BOLL_DESCRIPTION,
  CALCULATE_KELLY_DESCRIPTION,
  CALCULATE_RISK_PARITY_DESCRIPTION,
  CALCULATE_MEAN_VARIANCE_DESCRIPTION,
  SCORE_DATA_SOURCE_DESCRIPTION,
  COMPARE_DATA_SOURCES_DESCRIPTION,
  CALCULATE_CORRELATION_MATRIX_DESCRIPTION,
  CALCULATE_CORRELATION_DESCRIPTION,
} from './quant/index.js';
import {
  createEvaluateTradeTool,
  createRunBacktestTool,
  createGetBacktestSummaryTool,
  createCalculateWinRateTool,
  EVALUATE_TRADE_DESCRIPTION,
  RUN_BACKTEST_DESCRIPTION,
  GET_BACKTEST_SUMMARY_DESCRIPTION,
  CALCULATE_WIN_RATE_DESCRIPTION,
} from './backtest/index.js';
import {
  createGetCacheStatsTool,
  createClearCacheTool,
  createInvalidateCacheTool,
  createCacheInfoTool,
  GET_CACHE_STATS_DESCRIPTION,
  CLEAR_CACHE_DESCRIPTION,
  INVALIDATE_CACHE_DESCRIPTION,
  GET_CACHE_INFO_DESCRIPTION,
} from './cache/index.js';
import {
  createCheckTradingDayTool,
  createGetUpcomingHolidaysTool,
  createGetNextTradingDayTool,
  createGetTradingDaysTool,
  CHECK_TRADING_DAY_DESCRIPTION,
  GET_UPCOMING_HOLIDAYS_DESCRIPTION,
  GET_NEXT_TRADING_DAY_DESCRIPTION,
  GET_TRADING_DAYS_DESCRIPTION,
} from './calendar/index.js';
import {
  createGetShortInterestTool,
  createCalculateShortInterestRatioTool,
  createDetectShortSqueezeTool,
  GET_SHORT_INTEREST_DESCRIPTION,
  CALCULATE_SHORT_INTEREST_RATIO_DESCRIPTION,
  DETECT_SHORT_SQUEEZE_DESCRIPTION,
} from './short-interest/index.js';
import {
  createAddPositionTool,
  createUpdatePositionTool,
  createRemovePositionTool,
  createGetPortfolioTool,
  ADD_POSITION_DESCRIPTION,
  UPDATE_POSITION_DESCRIPTION,
  REMOVE_POSITION_DESCRIPTION,
  GET_PORTFOLIO_DESCRIPTION,
} from './portfolio/index.js';
import {
  createWorktreeTool,
  removeWorktreeTool,
  listWorktreeTool,
  CREATE_WORKTREE_DESCRIPTION,
  REMOVE_WORKTREE_DESCRIPTION,
  LIST_WORKTREE_DESCRIPTION,
} from './worktree/index.js';
import {
  createListSkillsTool,
  createSearchSkillsTool,
  createGetSkillTool,
  LIST_SKILLS_DESCRIPTION,
  SEARCH_SKILLS_DESCRIPTION,
  GET_SKILL_DESCRIPTION,
} from './discovery/index.js';
import { researchTools, RESEARCH_TOOLS_DESCRIPTION, ANALYZE_SENTIMENT_DESCRIPTION, DETECT_EVENTS_DESCRIPTION, EXTRACT_ENTITIES_DESCRIPTION } from './research/index.js';
import { createSendMessageTool, SEND_MESSAGE_DESCRIPTION } from './send-message.js';
import { createSnipTool, SNIP_TOOL_DESCRIPTION } from './snip-tool.js';
import { createSleepTool, SLEEP_TOOL_DESCRIPTION } from './sleep-tool.js';
import { createMonitorTool, MONITOR_TOOL_DESCRIPTION } from './monitor-tool.js';
import {
  createToolSearchTool,
  createToolGetTool,
  createToolListTool,
  TOOL_SEARCH_DESCRIPTION,
  TOOL_GET_DESCRIPTION,
  TOOL_LIST_DESCRIPTION,
} from './tool-search-tool.js';
import {
  createTeamCreateTool,
  createTeamDeleteTool,
  createTeamListTool,
  createTeamAddMemberTool,
  createTeamRemoveMemberTool,
  createTeamStatusTool,
  createTeamUpdateStatusTool,
  TEAM_CREATE_DESCRIPTION,
  TEAM_DELETE_DESCRIPTION,
  TEAM_LIST_DESCRIPTION,
  TEAM_ADD_MEMBER_DESCRIPTION,
  TEAM_REMOVE_MEMBER_DESCRIPTION,
  TEAM_STATUS_DESCRIPTION,
  TEAM_UPDATE_STATUS_DESCRIPTION,
} from './team-tools.js';
import {
  createValuationRatiosTool,
  createDCFTool,
  createPeerComparisonTool,
  createDecisionDashboardTool,
  createCalculateTargetPriceTool,
  createQuickTargetPriceTool,
  VALUATION_RATIOS_DESCRIPTION,
  DCF_MODEL_DESCRIPTION,
  PEER_COMPARISON_DESCRIPTION,
  DECISION_DASHBOARD_DESCRIPTION,
  CALCULATE_TARGET_PRICE_DESCRIPTION,
  QUICK_TARGET_PRICE_DESCRIPTION,
} from './valuation/index.js';
import {
  createNotebookReadTool,
  createNotebookCreateTool,
  createNotebookEditCellTool,
  createNotebookInsertCellTool,
  createNotebookDeleteCellTool,
  NOTEBOOK_READ_DESCRIPTION,
  NOTEBOOK_CREATE_DESCRIPTION,
  NOTEBOOK_EDIT_CELL_DESCRIPTION,
  NOTEBOOK_INSERT_CELL_DESCRIPTION,
  NOTEBOOK_DELETE_CELL_DESCRIPTION,
} from './notebook/index.js';
import {
  createNotifyTool,
  createNotifyListTool,
  NOTIFY_DESCRIPTION,
  NOTIFY_LIST_DESCRIPTION,
  createSubscribePRTool,
  createUnsubscribePRTool,
  createListPRSubscriptionsTool,
  SUBSCRIBE_PR_DESCRIPTION,
  UNSUBSCRIBE_PR_DESCRIPTION,
  LIST_PR_SUBSCRIPTIONS_DESCRIPTION,
} from './notify/index.js';
import {
  createExportPortfolioTool,
  createExportWatchlistTool,
  createExportDataTool,
  EXPORT_PORTFOLIO_DESCRIPTION,
  EXPORT_WATCHLIST_DESCRIPTION,
  EXPORT_DATA_DESCRIPTION,
} from './export/index.js';
import {
  createLSPCompleteTool,
  createLSPDefinitionTool,
  createLSPReferencesTool,
  createLSPHoverTool,
  createLSPDiagnosticsTool,
  LSP_COMPLETE_DESCRIPTION,
  LSP_DEFINITION_DESCRIPTION,
  LSP_REFERENCES_DESCRIPTION,
  LSP_HOVER_DESCRIPTION,
  LSP_DIAGNOSTICS_DESCRIPTION,
} from './lsp/index.js';
import {
  createConfigGetTool,
  createConfigSetTool,
  createConfigListTool,
  CONFIG_TOOL_GET_DESCRIPTION,
  CONFIG_TOOL_SET_DESCRIPTION,
  CONFIG_TOOL_LIST_DESCRIPTION,
} from './config-tool.js';
import {
  createForkSubagentTool,
  createResumeAgentTool,
  createAgentMemoryTool,
  createListAgentsTool,
  createRunBuiltInAgentTool,
  FORK_SUBAGENT_DESCRIPTION,
  RESUME_AGENT_DESCRIPTION,
  AGENT_MEMORY_DESCRIPTION,
  LIST_AGENTS_DESCRIPTION,
  RUN_BUILTIN_AGENT_DESCRIPTION,
} from '../agent/subagent/types.js';

/**
 * Tool safety level for access control
 */
export type ToolSafetyLevel = 'safe' | 'warning' | 'dangerous' | 'critical';

/**
 * Tool category for grouping and permissions
 */
export type ToolCategory =
  | 'read'           // Read-only data access
  | 'write'          // File/data modification
  | 'execute'        // Command execution
  | 'system'         // System-level operations
  | 'network'        // Network requests
  | 'computation'     // Pure computation (no side effects)
  | 'investment'     // Financial/investment operations
  | 'memory';        // Memory/persistence operations

/**
 * Potential side effects a tool might have
 */
export interface ToolSideEffects {
  /** Reads from filesystem */
  readsFiles?: boolean;
  /** Writes to filesystem */
  writesFiles?: boolean;
  /** Makes network requests */
  makesNetworkRequests?: boolean;
  /** Has rate limit implications */
  hasRateLimit?: boolean;
  /** Modifies in-memory state (cache, counters, etc.) */
  modifiesState?: boolean;
  /** Creates subprocesses */
  spawnsProcess?: boolean;
  /** Has financial implications */
  hasFinancialImpact?: boolean;
}

/**
 * Enhanced tool concurrency metadata for richer tool execution planning
 */
export interface ToolConcurrencyMetadata {
  /** Basic concurrent-safety flag (true = safe to run with other safe tools) */
  safe: boolean;
  /** Detailed safety level for access control */
  safetyLevel: ToolSafetyLevel;
  /** Tool category for grouping */
  category: ToolCategory;
  /** Potential side effects */
  sideEffects: ToolSideEffects;
  /** Groups of tools that conflict with this one */
  conflictsWith?: string[];
  /** Groups this tool belongs to (tools in same group may conflict) */
  groupId?: string;
  /** Max concurrent instances allowed (Infinity = unlimited) */
  maxConcurrent?: number;
}

/**
 * A registered tool with its rich description for system prompt injection.
 */
export interface RegisteredTool {
  /** Tool name (must match the tool's name property) */
  name: string;
  /** The actual tool instance */
  tool: StructuredToolInterface;
  /** Rich description for system prompt (includes when to use, when not to use, etc.) */
  description: string;
  /** 1-2 sentence description for token-optimized system prompts. */
  compactDescription: string;
  /** Whether this tool can safely execute concurrently with other concurrent-safe tools. */
  concurrencySafe: boolean;
  /** Enhanced concurrency metadata (optional, for richer execution planning) */
  concurrencyMetadata?: ToolConcurrencyMetadata;
}

/**
 * Get all registered tools with their descriptions.
 * Conditionally includes tools based on environment configuration.
 *
 * @param model - The model name (needed for tools that require model-specific configuration)
 * @returns Array of registered tools
 */

import {
  createAddToWatchlistTool,
  createRemoveFromWatchlistTool,
  createGetWatchlistTool,
  createAddAlertTool,
  createCheckAlertsTool,
  createClearAlertTool,
  ADD_TO_WATCHLIST_DESCRIPTION,
  REMOVE_FROM_WATCHLIST_DESCRIPTION,
  GET_WATCHLIST_DESCRIPTION,
  ADD_WATCHLIST_ALERT_DESCRIPTION,
  CHECK_WATCHLIST_ALERTS_DESCRIPTION,
} from './watchlist/index.js';
import {
  createListBenchmarksTool,
  createCompareBenchmarkTool,
  createCalculateAlphaTool,
  LIST_BENCHMARKS_DESCRIPTION,
  COMPARE_BENCHMARK_DESCRIPTION,
  CALCULATE_ALPHA_DESCRIPTION,
} from './benchmark/index.js';
import {
  createConvertCurrencyTool,
  createListCurrenciesTool,
  createGetRateTool,
  CONVERT_CURRENCY_DESCRIPTION,
  LIST_CURRENCIES_DESCRIPTION,
  GET_EXCHANGE_RATE_DESCRIPTION,
} from './fx/index.js';

import {
  multiPortfolioTools,
  MULTI_PORTFOLIO_LIST_DESCRIPTION,
  MULTI_PORTFOLIO_CREATE_DESCRIPTION,
  MULTI_PORTFOLIO_DELETE_DESCRIPTION,
  MULTI_PORTFOLIO_SWITCH_DESCRIPTION,
  MULTI_PORTFOLIO_GET_DESCRIPTION,
  MULTI_PORTFOLIO_ADD_DESCRIPTION,
  MULTI_PORTFOLIO_REMOVE_DESCRIPTION,
} from './portfolio/index.js';

// Helper to create concurrency metadata for read-only financial data tools
function financialReadMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'read',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: true,
      hasRateLimit: true,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 5,
  };
}

// Helper to create concurrency metadata for financial write tools
function financialWriteMetadata(): ToolConcurrencyMetadata {
  return {
    safe: false,
    safetyLevel: 'warning',
    category: 'investment',
    sideEffects: {
      readsFiles: false,
      writesFiles: true,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: true,
      spawnsProcess: false,
      hasFinancialImpact: true,
    },
    maxConcurrent: 1,
  };
}

// Helper to create concurrency metadata for file write tools
function fileWriteMetadata(): ToolConcurrencyMetadata {
  return {
    safe: false,
    safetyLevel: 'dangerous',
    category: 'write',
    sideEffects: {
      readsFiles: true,
      writesFiles: true,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    conflictsWith: ['write_file', 'edit_file'],
    maxConcurrent: 1,
  };
}

// Helper to create concurrency metadata for file read tools
function fileReadMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'read',
    sideEffects: {
      readsFiles: true,
      writesFiles: false,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 10,
  };
}

// Helper for computation-only tools (no side effects)
function computationMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'computation',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 20,
  };
}

// Helper for memory tools
function memoryMetadata(write: boolean): ToolConcurrencyMetadata {
  return {
    safe: !write,
    safetyLevel: write ? 'warning' : 'safe',
    category: 'memory',
    sideEffects: {
      readsFiles: false,
      writesFiles: write,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: true,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: write ? 1 : 10,
  };
}

// Helper for network request tools
function networkMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'warning',
    category: 'network',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: true,
      hasRateLimit: true,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 10,
  };
}

// Helper for system tools
function systemMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'system',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: true,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 5,
  };
}

export async function getToolRegistry(model: string): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [
    {
      name: 'get_financials',
      tool: createGetFinancials(model),
      description: GET_FINANCIALS_DESCRIPTION,
      compactDescription: 'Financial statements, metrics, and analyst estimates. Handles multi-company/multi-metric queries in one call.',
      concurrencySafe: true,
      concurrencyMetadata: financialReadMetadata(),
    },
    {
      name: 'get_market_data',
      tool: createGetMarketData(model),
      description: GET_MARKET_DATA_DESCRIPTION,
      compactDescription: 'Stock/crypto prices, company news, and insider trades. Handles multi-asset queries in one call.',
      concurrencySafe: true,
    },
    {
      name: 'read_filings',
      tool: createReadFilings(model),
      description: READ_FILINGS_DESCRIPTION,
      compactDescription: 'SEC filings (10-K, 10-Q, 8-K). Extracts and summarizes specific filing sections.',
      concurrencySafe: true,
    },
    {
      name: 'stock_screener',
      tool: createScreenStocks(model),
      description: SCREEN_STOCKS_DESCRIPTION,
      compactDescription: 'Screen stocks by financial criteria (P/E, growth, margins, etc.).',
      concurrencySafe: true,
    },
    {
      name: 'get_astock_price',
      tool: getAStockPrice,
      description: GET_ASTOCK_PRICE_DESCRIPTION,
      compactDescription: 'Real-time price data for A-share (Chinese) stocks and HK stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_astock_financials',
      tool: getAStockFinancials,
      description: GET_ASTOCK_FINANCIALS_DESCRIPTION,
      compactDescription: 'Financial statements and key metrics for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_astock_news',
      tool: getAStockNews,
      description: GET_ASTOCK_NEWS_DESCRIPTION,
      compactDescription: 'Company announcements and market news for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'screen_astocks',
      tool: screenAstocks,
      description: SCREEN_ASTOCKS_DESCRIPTION,
      compactDescription: 'Screen A-share stocks by PE, ROE, sector, market cap criteria.',
      concurrencySafe: true,
    },
    {
      name: 'get_sector_data',
      tool: getSectorData,
      description: GET_SECTOR_DATA_DESCRIPTION,
      compactDescription: 'Industry sector and concept board data for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_technical_data',
      tool: getTechnicalData,
      description: GET_TECHNICAL_DATA_DESCRIPTION,
      compactDescription: 'Technical indicators (MA, MACD, RSI) and K-line data for A-share stocks.',
      concurrencySafe: true,
    },
    {
      name: 'get_market_structure',
      tool: getMarketStructure,
      description: GET_MARKET_STRUCTURE_DESCRIPTION,
      compactDescription: 'Dragon-tiger list, northbound flow, money flow for A-share market.',
      concurrencySafe: true,
    },
    {
      name: 'web_fetch',
      tool: webFetchTool,
      description: WEB_FETCH_DESCRIPTION,
      compactDescription: 'Fetch and extract content from a URL as markdown. Use when you need full article text beyond headlines.',
      concurrencySafe: true,
      concurrencyMetadata: networkMetadata(),
    },
    // Browser tool - conditionally registered only when playwright is available
    // This prevents errors when playwright is not installed
    ...(await isPlaywrightAvailable()
      ? [
          {
            name: 'browser' as const,
            tool: browserTool,
            description: BROWSER_DESCRIPTION,
            compactDescription: 'JavaScript-rendered pages and interactive navigation. Actions: navigate, snapshot, act, read, close.',
            concurrencySafe: true,
          },
        ]
      : []),
    {
      name: 'read_file',
      tool: readFileTool,
      description: READ_FILE_DESCRIPTION,
      compactDescription: 'Read a local file by path. Returns file content as text.',
      concurrencySafe: true,
    },
    {
      name: 'write_file',
      tool: writeFileTool,
      description: WRITE_FILE_DESCRIPTION,
      compactDescription: 'Create or overwrite a file. Requires user approval.',
      concurrencySafe: false,
      concurrencyMetadata: fileWriteMetadata(),
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
      compactDescription: 'Edit a file by replacing text. Requires user approval.',
      concurrencySafe: false,
      concurrencyMetadata: fileWriteMetadata(),
    },
    {
      name: 'glob',
      tool: globTool,
      description: `Find files matching a glob pattern. Use this to find all files of a specific type (e.g., "**/*.ts") or files in a directory tree.`,
      compactDescription: 'Find files by glob pattern (e.g., "**/*.ts", "src/**/*.js").',
      concurrencySafe: true,
      concurrencyMetadata: fileReadMetadata(),
    },
    {
      name: 'grep',
      tool: grepTool,
      description: `Search file contents using regular expressions. Use this to find text patterns across files, search for function/variable definitions, or extract matching lines with context.`,
      compactDescription: 'Search file contents with regex patterns. Supports content, files_with_matches, and count modes.',
      concurrencySafe: true,
      concurrencyMetadata: fileReadMetadata(),
    },
    {
      name: 'send_user_file',
      tool: sendUserFileTool,
      description: SEND_USER_FILE_DESCRIPTION,
      compactDescription: 'Send/export a file to the user (copies to Downloads or custom path).',
      concurrencySafe: true,
    },
    {
      name: 'heartbeat',
      tool: heartbeatTool,
      description: HEARTBEAT_TOOL_DESCRIPTION,
      compactDescription: 'View or update the periodic heartbeat checklist (.dexter/HEARTBEAT.md).',
      concurrencySafe: true,
    },
    {
      name: 'cron',
      tool: cronTool,
      description: CRON_TOOL_DESCRIPTION,
      compactDescription: 'Manage scheduled cron jobs (create, list, update, delete).',
      concurrencySafe: true,
    },
    {
      name: 'memory_search',
      tool: memorySearchTool,
      description: MEMORY_SEARCH_DESCRIPTION,
      compactDescription: 'Search persistent memory and past conversations for stored facts and preferences.',
      concurrencySafe: true,
      concurrencyMetadata: memoryMetadata(false),
    },
    {
      name: 'memory_get',
      tool: memoryGetTool,
      description: MEMORY_GET_DESCRIPTION,
      compactDescription: 'Read specific memory file sections by line range.',
      concurrencySafe: true,
      concurrencyMetadata: memoryMetadata(false),
    },
    {
      name: 'memory_update',
      tool: memoryUpdateTool,
      description: MEMORY_UPDATE_DESCRIPTION,
      compactDescription: 'Add, edit, or delete persistent memory entries.',
      concurrencySafe: false,
      concurrencyMetadata: memoryMetadata(true),
    },
  ];

  // Include web_search if Exa, Perplexity, or Tavily API key is configured (Exa → Perplexity → Tavily)
  if (process.env.EXASEARCH_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: exaSearch,
      description: WEB_SEARCH_DESCRIPTION,
      compactDescription: 'Search the web for current information. Returns titles, URLs, and highlights.',
      concurrencySafe: true,
    });
  } else if (process.env.PERPLEXITY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: perplexitySearch,
      description: WEB_SEARCH_DESCRIPTION,
      compactDescription: 'Search the web for current information. Returns an answer with citations.',
      concurrencySafe: true,
    });
  } else if (process.env.TAVILY_API_KEY) {
    tools.push({
      name: 'web_search',
      tool: tavilySearch,
      description: WEB_SEARCH_DESCRIPTION,
      compactDescription: 'Search the web for current information. Returns titles, URLs, and snippets.',
      concurrencySafe: true,
    });
  }

  if (process.env.X_BEARER_TOKEN) {
    tools.push({
      name: 'x_search',
      tool: xSearchTool,
      description: X_SEARCH_DESCRIPTION,
      compactDescription: 'Search X/Twitter for tweets, profiles, and threads.',
      concurrencySafe: true,
    });
  }

  const availableSkills = discoverSkills();
  if (availableSkills.length > 0) {
    tools.push({
      name: 'skill',
      tool: skillTool,
      description: SKILL_TOOL_DESCRIPTION,
      compactDescription: 'Invoke a specialized skill workflow (e.g., DCF valuation).',
      concurrencySafe: false,
    });
  }

  // Add MCP tools from configured servers
  try {
    const mcpClient = getDefaultMCPClient();
    const mcpTools = mcpToolsToRegisteredTools(mcpClient);

    for (const mcpTool of mcpTools) {
      tools.push({
        name: mcpTool.name,
        tool: mcpTool.tool,
        description: mcpTool.description,
        compactDescription: mcpTool.compactDescription,
        concurrencySafe: mcpTool.concurrencySafe,
      });
    }

    // Log MCP status for debugging
    const status = getMCPStatus(mcpClient);
    if (status.connectedServers > 0) {
      info('tools', `MCP: ${status.connectedServers}/${status.totalServers} servers connected, ${status.totalTools} tools available`);
    }
  } catch (error) {
    // MCP initialization failed, tools will be empty
    info('tools', 'MCP not configured or initialization failed');
  }

  // Add MCP resource tools (always available, even when no servers configured)
  tools.push({
    name: 'list_mcp_resources',
    tool: listMcpResourcesTool,
    description: LIST_MCP_RESOURCES_DESCRIPTION,
    compactDescription: 'List resources from connected MCP servers.',
    concurrencySafe: true,
    concurrencyMetadata: networkMetadata(),
  });

  tools.push({
    name: 'read_mcp_resource',
    tool: readMcpResourceTool,
    description: READ_MCP_RESOURCE_DESCRIPTION,
    compactDescription: 'Read a specific resource from an MCP server by URI.',
    concurrencySafe: true,
    concurrencyMetadata: networkMetadata(),
  });

  // Add AgentTool for spawning subagents
  const agentTool = buildAgentTool();
  tools.push({
    name: 'agent',
    tool: agentTool,
    description: AGENT_TOOL_DESCRIPTION,
    compactDescription: AGENT_TOOL_COMPACT_DESCRIPTION,
    concurrencySafe: false,
  });

  // Add Plan Mode tools
  const planModeTools = [
    { name: 'enter_plan_mode', tool: createEnterPlanModeTool() },
    { name: 'exit_plan_mode', tool: createExitPlanModeTool() },
    { name: 'add_plan_step', tool: createAddPlanStepTool() },
    { name: 'update_plan_step', tool: createUpdatePlanStepTool() },
    { name: 'list_plan_steps', tool: createListPlanStepsTool() },
  ];

  for (const { name, tool } of planModeTools) {
    tools.push({
      name,
      tool,
      description: `Plan mode tool: ${name}`,
      compactDescription: `Structured planning tool for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // Add TodoWrite tools
  const todoTools = [
    { name: 'create_todo', tool: createCreateTodoTool() },
    { name: 'update_todo', tool: createUpdateTodoTool() },
    { name: 'list_todos', tool: createListTodosTool() },
    { name: 'delete_todo', tool: createDeleteTodoTool() },
  ];

  for (const { name, tool } of todoTools) {
    tools.push({
      name,
      tool,
      description: `Todo tool: ${name}`,
      compactDescription: `Task list management for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // Add Task System tools
  const taskTools = [
    { name: 'task_create', tool: createTaskCreateTool() },
    { name: 'task_get', tool: createTaskGetTool() },
    { name: 'task_list', tool: createTaskListTool() },
    { name: 'task_stop', tool: createTaskStopTool() },
    { name: 'task_update', tool: createTaskUpdateTool() },
  ];

  for (const { name, tool } of taskTools) {
    tools.push({
      name,
      tool,
      description: `Task tool: ${name}`,
      compactDescription: `Background task management for ${name.replace('_', ' ')}`,
      concurrencySafe: true,
    });
  }

  // Add AskUserQuestion tools
  const askTools = [
    { name: 'ask_confirm', tool: createAskConfirmTool(), description: ASK_CONFIRM_DESCRIPTION },
    { name: 'ask_select', tool: createAskSelectTool(), description: ASK_SELECT_DESCRIPTION },
    { name: 'ask_multi_select', tool: createAskMultiSelectTool(), description: ASK_MULTI_SELECT_DESCRIPTION },
    { name: 'ask_input', tool: createAskInputTool(), description: ASK_INPUT_DESCRIPTION },
    { name: 'ask_response', tool: createAskResponseTool(), description: ASK_RESPONSE_DESCRIPTION },
  ];

  for (const { name, tool, description } of askTools) {
    tools.push({
      name,
      tool,
      description,
      compactDescription: `Interactive question tool for ${name.replace('ask_', '')}`,
      concurrencySafe: true,
    });
  }

  // Add Quantitative Analysis tools
  const quantMetadata = computationMetadata();
  tools.push({
    name: 'calculate_var',
    tool: createCalculateVaRTool(),
    description: CALCULATE_VAR_DESCRIPTION,
    compactDescription: 'Calculate Value at Risk (VaR) for portfolio risk assessment',
    concurrencySafe: true,
    concurrencyMetadata: quantMetadata,
  });

  tools.push({
    name: 'calculate_sharpe',
    tool: createCalculateSharpeTool(),
    description: CALCULATE_SHARPE_DESCRIPTION,
    compactDescription: 'Calculate Sharpe Ratio for risk-adjusted return measurement',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_sortino',
    tool: createCalculateSortinoTool(),
    description: CALCULATE_SORTINO_DESCRIPTION,
    compactDescription: 'Calculate Sortino Ratio for downside risk focus',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_max_drawdown',
    tool: createCalculateMaxDrawdownTool(),
    description: CALCULATE_MAX_DRAWDOWN_DESCRIPTION,
    compactDescription: 'Calculate Maximum Drawdown for worst-case loss measurement',
    concurrencySafe: true,
  });

  // Add Options Pricing tools (Black-Scholes)
  tools.push({
    name: 'calculate_option_price',
    tool: createCalculateOptionPriceTool(),
    description: CALCULATE_OPTION_PRICE_DESCRIPTION,
    compactDescription: 'Calculate Black-Scholes option price for calls and puts',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_option_greeks',
    tool: createCalculateGreeksTool(),
    description: CALCULATE_GREEKS_DESCRIPTION,
    compactDescription: 'Calculate option Greeks (Delta, Gamma, Theta, Vega, Rho)',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_implied_volatility',
    tool: createCalculateImpliedVolTool(),
    description: CALCULATE_IMPLIED_VOL_DESCRIPTION,
    compactDescription: 'Calculate implied volatility from market option price',
    concurrencySafe: true,
  });

  // Add Tax Calculation tools
  tools.push({
    name: 'calculate_capital_gains_tax',
    tool: createCalculateTaxTool(),
    description: CALCULATE_TAX_DESCRIPTION,
    compactDescription: 'Estimate capital gains tax for US, China, HK, UK',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_trades_tax',
    tool: createCalculateTradesTaxTool(),
    description: CALCULATE_TRADES_TAX_DESCRIPTION,
    compactDescription: 'Calculate tax for multiple completed trades',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_pnl',
    tool: createCalculatePnLTool(),
    description: CALCULATE_PNL_DESCRIPTION,
    compactDescription: 'Calculate profit and loss for trades',
    concurrencySafe: true,
  });

  // Add Technical Indicator tools (KDJ, BOLL, WR, CCI, ATR, OBV)
  tools.push({
    name: 'calculate_technical_indicators',
    tool: createCalculateIndicatorsTool(),
    description: CALCULATE_TECHNICAL_INDICATORS_DESCRIPTION,
    compactDescription: 'Calculate KDJ/BOLL/WR/CCI/ATR/OBV technical indicators from OHLCV data',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_kdj',
    tool: createCalculateKDJTool(),
    description: CALCULATE_KDJ_DESCRIPTION,
    compactDescription: 'Calculate KDJ Stochastic Oscillator from OHLCV',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_boll',
    tool: createCalculateBOLLTool(),
    description: CALCULATE_BOLL_DESCRIPTION,
    compactDescription: 'Calculate Bollinger Bands from OHLCV',
    concurrencySafe: true,
  });

  // Add Portfolio Optimization tools
  tools.push({
    name: 'calculate_kelly',
    tool: createCalculateKellyTool(),
    description: CALCULATE_KELLY_DESCRIPTION,
    compactDescription: 'Calculate optimal position size using Kelly Criterion',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_risk_parity',
    tool: createCalculateRiskParityTool(),
    description: CALCULATE_RISK_PARITY_DESCRIPTION,
    compactDescription: 'Calculate risk parity portfolio allocation',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_mean_variance',
    tool: createCalculateMeanVarianceTool(),
    description: CALCULATE_MEAN_VARIANCE_DESCRIPTION,
    compactDescription: 'Calculate mean-variance optimized portfolio (tangency)',
    concurrencySafe: true,
  });

  // Add Data Reliability & Correlation tools
  tools.push({
    name: 'score_data_source',
    tool: createScoreDataSourceTool(),
    description: SCORE_DATA_SOURCE_DESCRIPTION,
    compactDescription: 'Score data source reliability with A-F grade (latency/freshness/coverage/accuracy)',
    concurrencySafe: true,
  });

  tools.push({
    name: 'compare_data_sources',
    tool: createCompareDataSourcesTool(),
    description: COMPARE_DATA_SOURCES_DESCRIPTION,
    compactDescription: 'Compare multiple data sources side-by-side with reliability scores',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_correlation_matrix',
    tool: createCorrelationMatrixTool(),
    description: CALCULATE_CORRELATION_MATRIX_DESCRIPTION,
    compactDescription: 'Calculate Pearson correlation matrix for multiple assets',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_correlation',
    tool: createCalculateCorrelationTool(),
    description: CALCULATE_CORRELATION_DESCRIPTION,
    compactDescription: 'Calculate Pearson correlation between two asset return series',
    concurrencySafe: true,
  });

  // Add Portfolio Management tools
  tools.push({
    name: 'add_position',
    tool: createAddPositionTool(),
    description: ADD_POSITION_DESCRIPTION,
    compactDescription: 'Add a new position to portfolio tracking',
    concurrencySafe: true,
  });

  tools.push({
    name: 'update_position',
    tool: createUpdatePositionTool(),
    description: UPDATE_POSITION_DESCRIPTION,
    compactDescription: 'Update existing position quantity or cost',
    concurrencySafe: true,
  });

  tools.push({
    name: 'remove_position',
    tool: createRemovePositionTool(),
    description: REMOVE_POSITION_DESCRIPTION,
    compactDescription: 'Remove a position from portfolio tracking',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_portfolio',
    tool: createGetPortfolioTool(),
    description: GET_PORTFOLIO_DESCRIPTION,
    compactDescription: 'Get portfolio positions with P&L calculations',
    concurrencySafe: true,
  });

  // Add Worktree tools
  tools.push({
    name: 'create_worktree',
    tool: createWorktreeTool(),
    description: CREATE_WORKTREE_DESCRIPTION,
    compactDescription: 'Create a new git worktree for isolated development',
    concurrencySafe: true,
  });

  tools.push({
    name: 'remove_worktree',
    tool: removeWorktreeTool(),
    description: REMOVE_WORKTREE_DESCRIPTION,
    compactDescription: 'Remove a git worktree',
    concurrencySafe: true,
  });

  tools.push({
    name: 'list_worktree',
    tool: listWorktreeTool(),
    description: LIST_WORKTREE_DESCRIPTION,
    compactDescription: 'List all git worktrees in the repository',
    concurrencySafe: true,
  });

  // Add Skill Discovery tools
  tools.push({
    name: 'list_skills',
    tool: createListSkillsTool(),
    description: LIST_SKILLS_DESCRIPTION,
    compactDescription: 'List all available skills in the system',
    concurrencySafe: true,
  });

  tools.push({
    name: 'search_skills',
    tool: createSearchSkillsTool(),
    description: SEARCH_SKILLS_DESCRIPTION,
    compactDescription: 'Search for skills by keyword',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_skill',
    tool: createGetSkillTool(),
    description: GET_SKILL_DESCRIPTION,
    compactDescription: 'Get detailed information about a specific skill',
    concurrencySafe: true,
  });

  // Add SendMessage tool
  tools.push({
    name: 'send_message',
    tool: createSendMessageTool(),
    description: SEND_MESSAGE_DESCRIPTION,
    compactDescription: 'Send a message to another agent, task, or broadcast to all team members',
    concurrencySafe: true,
  });

  // Add SnipTool
  tools.push({
    name: 'snip_tool',
    tool: createSnipTool(),
    description: SNIP_TOOL_DESCRIPTION,
    compactDescription: 'Remove low-value confirmation/acknowledgment messages from context',
    concurrencySafe: true,
  });

  // Add ConfigTool tools
  tools.push({
    name: 'config_get',
    tool: createConfigGetTool(),
    description: CONFIG_TOOL_GET_DESCRIPTION,
    compactDescription: 'Read a configuration value from Dexter settings',
    concurrencySafe: true,
    concurrencyMetadata: systemMetadata(),
  });

  tools.push({
    name: 'config_set',
    tool: createConfigSetTool(),
    description: CONFIG_TOOL_SET_DESCRIPTION,
    compactDescription: 'Write a configuration value to Dexter settings',
    concurrencySafe: false,
    concurrencyMetadata: {
      safe: false,
      safetyLevel: 'warning',
      category: 'system',
      sideEffects: {
        readsFiles: false,
        writesFiles: true,
        makesNetworkRequests: false,
        hasRateLimit: false,
        modifiesState: true,
        spawnsProcess: false,
        hasFinancialImpact: false,
      },
      maxConcurrent: 1,
    },
  });

  tools.push({
    name: 'config_list',
    tool: createConfigListTool(),
    description: CONFIG_TOOL_LIST_DESCRIPTION,
    compactDescription: 'List all configuration keys and values',
    concurrencySafe: true,
    concurrencyMetadata: systemMetadata(),
  });

  // Add Export tools (数据导出)
  tools.push({
    name: 'export_portfolio',
    tool: createExportPortfolioTool(),
    description: EXPORT_PORTFOLIO_DESCRIPTION,
    compactDescription: 'Export portfolio to CSV/JSON file',
    concurrencySafe: true,
  });

  tools.push({
    name: 'export_watchlist',
    tool: createExportWatchlistTool(),
    description: EXPORT_WATCHLIST_DESCRIPTION,
    compactDescription: 'Export watchlist to CSV/JSON file',
    concurrencySafe: true,
  });

  tools.push({
    name: 'export_data',
    tool: createExportDataTool(),
    description: EXPORT_DATA_DESCRIPTION,
    compactDescription: 'Export analysis data to CSV/JSON file',
    concurrencySafe: true,
  });

  // Add SleepTool
  tools.push({
    name: 'sleep',
    tool: createSleepTool(),
    description: SLEEP_TOOL_DESCRIPTION,
    compactDescription: 'Pause execution for specified duration (0-3600 seconds)',
    concurrencySafe: true,
  });

  // Add WorkflowTool
  for (const workflowTool of workflowTools) {
    tools.push({
      name: workflowTool.name,
      tool: workflowTool,
      description: WORKFLOW_TOOL_DESCRIPTION,
      compactDescription: 'Execute a multi-step workflow as a single atomic operation',
      concurrencySafe: false,
      concurrencyMetadata: {
        safe: false,
        safetyLevel: 'dangerous',
        category: 'execute',
        sideEffects: {
          readsFiles: true,
          writesFiles: true,
          makesNetworkRequests: true,
          hasRateLimit: true,
          modifiesState: true,
          spawnsProcess: false,
          hasFinancialImpact: false,
        },
        conflictsWith: ['workflowTools', 'subagent'],
        maxConcurrent: 1,
      },
    });
  }

  // Add MonitorTool
  tools.push({
    name: 'monitor',
    tool: createMonitorTool(),
    description: MONITOR_TOOL_DESCRIPTION,
    compactDescription: 'Report system resource usage (CPU, memory, uptime)',
    concurrencySafe: true,
  });

  // Add ToolSearchTool tools
  tools.push({
    name: 'tool_search',
    tool: createToolSearchTool(),
    description: TOOL_SEARCH_DESCRIPTION,
    compactDescription: 'Search available tools by keyword, name, or safety',
    concurrencySafe: true,
  });

  tools.push({
    name: 'tool_get',
    tool: createToolGetTool(),
    description: TOOL_GET_DESCRIPTION,
    compactDescription: 'Get detailed info about a specific tool',
    concurrencySafe: true,
  });

  tools.push({
    name: 'tool_list',
    tool: createToolListTool(),
    description: TOOL_LIST_DESCRIPTION,
    compactDescription: 'List all available tools in the registry',
    concurrencySafe: true,
  });

  // Add Team tools
  tools.push({
    name: 'team_create',
    tool: createTeamCreateTool(),
    description: TEAM_CREATE_DESCRIPTION,
    compactDescription: 'Create a new team for multi-agent collaboration',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_delete',
    tool: createTeamDeleteTool(),
    description: TEAM_DELETE_DESCRIPTION,
    compactDescription: 'Delete a team and clean up all resources',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_list',
    tool: createTeamListTool(),
    description: TEAM_LIST_DESCRIPTION,
    compactDescription: 'List all teams with member counts and status',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_add_member',
    tool: createTeamAddMemberTool(),
    description: TEAM_ADD_MEMBER_DESCRIPTION,
    compactDescription: 'Add a member/agent to a team',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_remove_member',
    tool: createTeamRemoveMemberTool(),
    description: TEAM_REMOVE_MEMBER_DESCRIPTION,
    compactDescription: 'Remove a member from a team',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_status',
    tool: createTeamStatusTool(),
    description: TEAM_STATUS_DESCRIPTION,
    compactDescription: 'Get detailed status of a team including all members',
    concurrencySafe: true,
  });

  tools.push({
    name: 'team_update_status',
    tool: createTeamUpdateStatusTool(),
    description: TEAM_UPDATE_STATUS_DESCRIPTION,
    compactDescription: 'Update team status (active, paused, completed)',
    concurrencySafe: true,
  });

  // Add Valuation tools
  tools.push({
    name: 'valuation_ratios',
    tool: createValuationRatiosTool(),
    description: VALUATION_RATIOS_DESCRIPTION,
    compactDescription: 'Calculate PE, PB, PCF ratios and market cap',
    concurrencySafe: true,
  });

  tools.push({
    name: 'dcf_model',
    tool: createDCFTool(),
    description: DCF_MODEL_DESCRIPTION,
    compactDescription: 'DCF intrinsic value calculation with terminal value',
    concurrencySafe: true,
  });

  tools.push({
    name: 'peer_comparison',
    tool: createPeerComparisonTool(),
    description: PEER_COMPARISON_DESCRIPTION,
    compactDescription: 'Compare company metrics against industry peers',
    concurrencySafe: true,
  });

  // Add Decision Dashboard tool
  tools.push({
    name: 'decision_dashboard',
    tool: createDecisionDashboardTool(),
    description: DECISION_DASHBOARD_DESCRIPTION,
    compactDescription: 'Four-dimension scoring (technical/fundamental/sentiment/risk) with buy/sell signal',
    concurrencySafe: true,
  });

  // Add Target Price tools
  tools.push({
    name: 'calculate_target_price',
    tool: createCalculateTargetPriceTool(),
    description: CALCULATE_TARGET_PRICE_DESCRIPTION,
    compactDescription: 'Calculate fair value target price using DCF, PE, or SOTP methods',
    concurrencySafe: true,
  });

  tools.push({
    name: 'quick_target_price',
    tool: createQuickTargetPriceTool(),
    description: QUICK_TARGET_PRICE_DESCRIPTION,
    compactDescription: 'Quick target price with minimal params (EPS + growth rate)',
    concurrencySafe: true,
  });

  // Add Notebook tools
  const notebookTools = [
    { name: 'notebook_read', tool: createNotebookReadTool(), description: NOTEBOOK_READ_DESCRIPTION, compact: 'Read Jupyter notebook cells and metadata' },
    { name: 'notebook_create', tool: createNotebookCreateTool(), description: NOTEBOOK_CREATE_DESCRIPTION, compact: 'Create a new empty Jupyter notebook' },
    { name: 'notebook_edit_cell', tool: createNotebookEditCellTool(), description: NOTEBOOK_EDIT_CELL_DESCRIPTION, compact: 'Edit a cell in a Jupyter notebook' },
    { name: 'notebook_insert_cell', tool: createNotebookInsertCellTool(), description: NOTEBOOK_INSERT_CELL_DESCRIPTION, compact: 'Insert a new cell into a Jupyter notebook' },
    { name: 'notebook_delete_cell', tool: createNotebookDeleteCellTool(), description: NOTEBOOK_DELETE_CELL_DESCRIPTION, compact: 'Delete a cell from a Jupyter notebook' },
  ];

  for (const { name, tool, description, compact } of notebookTools) {
    tools.push({
      name,
      tool,
      description,
      compactDescription: compact,
      concurrencySafe: false,
    });
  }

  // Add Notify tools
  tools.push({
    name: 'notify',
    tool: createNotifyTool(),
    description: NOTIFY_DESCRIPTION,
    compactDescription: 'Send push notification via webhook, Feishu, or log',
    concurrencySafe: true,
  });

  tools.push({
    name: 'notify_list',
    tool: createNotifyListTool(),
    description: NOTIFY_LIST_DESCRIPTION,
    compactDescription: 'List recent notifications from the log',
    concurrencySafe: true,
  });

  // Add SubscribePR tools
  tools.push({
    name: 'subscribe_pr',
    tool: createSubscribePRTool(),
    description: SUBSCRIBE_PR_DESCRIPTION,
    compactDescription: 'Subscribe to GitHub PR events (comment, review, merge) via webhook',
    concurrencySafe: true,
  });

  tools.push({
    name: 'unsubscribe_pr',
    tool: createUnsubscribePRTool(),
    description: UNSUBSCRIBE_PR_DESCRIPTION,
    compactDescription: 'Unsubscribe from a PR subscription',
    concurrencySafe: true,
  });

  tools.push({
    name: 'list_pr_subscriptions',
    tool: createListPRSubscriptionsTool(),
    description: LIST_PR_SUBSCRIPTIONS_DESCRIPTION,
    compactDescription: 'List active PR subscriptions',
    concurrencySafe: true,
  });

  // Add Enhanced Subagent tools
  const subagentTools = [
    {
      name: 'fork_subagent',
      tool: createForkSubagentTool(),
      description: FORK_SUBAGENT_DESCRIPTION,
      compactDescription: 'Fork a subagent with inherited context from parent agent',
      concurrencySafe: false,
    },
    {
      name: 'resume_agent',
      tool: createResumeAgentTool(),
      description: RESUME_AGENT_DESCRIPTION,
      compactDescription: 'Resume a previously paused agent to continue its task',
      concurrencySafe: false,
    },
    {
      name: 'agent_memory',
      tool: createAgentMemoryTool(),
      description: AGENT_MEMORY_DESCRIPTION,
      compactDescription: 'Store or retrieve memory associated with an agent session',
      concurrencySafe: true,
    },
    {
      name: 'list_agents',
      tool: createListAgentsTool(),
      description: LIST_AGENTS_DESCRIPTION,
      compactDescription: 'List available built-in agent types (code-reviewer, researcher, etc.)',
      concurrencySafe: true,
    },
    {
      name: 'run_builtin_agent',
      tool: createRunBuiltInAgentTool(),
      description: RUN_BUILTIN_AGENT_DESCRIPTION,
      compactDescription: 'Run a built-in specialized agent (code-reviewer, tester, debugger, etc.)',
      concurrencySafe: false,
    },
  ];

  for (const { name, tool, description, compactDescription } of subagentTools) {
    tools.push({
      name,
      tool,
      description,
      compactDescription,
      concurrencySafe: name !== 'fork_subagent' && name !== 'resume_agent' && name !== 'run_builtin_agent',
    });
  }

  // Add LSP tools
  tools.push({
    name: 'lsp_complete',
    tool: createLSPCompleteTool(),
    description: LSP_COMPLETE_DESCRIPTION,
    compactDescription: 'Get code completions at a position in a file',
    concurrencySafe: true,
  });
  tools.push({
    name: 'lsp_definition',
    tool: createLSPDefinitionTool(),
    description: LSP_DEFINITION_DESCRIPTION,
    compactDescription: 'Find definition of symbol at position',
    concurrencySafe: true,
  });
  tools.push({
    name: 'lsp_references',
    tool: createLSPReferencesTool(),
    description: LSP_REFERENCES_DESCRIPTION,
    compactDescription: 'Find all references to symbol at position',
    concurrencySafe: true,
  });
  tools.push({
    name: 'lsp_hover',
    tool: createLSPHoverTool(),
    description: LSP_HOVER_DESCRIPTION,
    compactDescription: 'Get hover/type information for symbol at position',
    concurrencySafe: true,
  });
  tools.push({
    name: 'lsp_diagnostics',
    tool: createLSPDiagnosticsTool(),
    description: LSP_DIAGNOSTICS_DESCRIPTION,
    compactDescription: 'Get diagnostics (errors/warnings) for a file',
    concurrencySafe: true,
  });

  // Add Research tools (Phase 9: 智能投研)
  for (const researchTool of researchTools) {
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

    tools.push({
      name: toolName,
      tool: researchTool,
      description,
      compactDescription,
      concurrencySafe: true,
    });
  }

  // Add Watchlist tools (投资关注列表)
  tools.push({
    name: 'add_to_watchlist',
    tool: createAddToWatchlistTool(),
    description: ADD_TO_WATCHLIST_DESCRIPTION,
    compactDescription: 'Add a stock to your investment watchlist for tracking',
    concurrencySafe: true,
  });

  tools.push({
    name: 'remove_from_watchlist',
    tool: createRemoveFromWatchlistTool(),
    description: REMOVE_FROM_WATCHLIST_DESCRIPTION,
    compactDescription: 'Remove a stock from your investment watchlist',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_watchlist',
    tool: createGetWatchlistTool(),
    description: GET_WATCHLIST_DESCRIPTION,
    compactDescription: 'Get your current investment watchlist with alerts',
    concurrencySafe: true,
  });

  tools.push({
    name: 'add_watchlist_alert',
    tool: createAddAlertTool(),
    description: ADD_WATCHLIST_ALERT_DESCRIPTION,
    compactDescription: 'Add a price alert to a watchlist symbol',
    concurrencySafe: true,
  });

  tools.push({
    name: 'check_watchlist_alerts',
    tool: createCheckAlertsTool(),
    description: CHECK_WATCHLIST_ALERTS_DESCRIPTION,
    compactDescription: 'Check watchlist alerts against current prices',
    concurrencySafe: true,
  });

  tools.push({
    name: 'clear_watchlist_alert',
    tool: createClearAlertTool(),
    description: 'Clear/silence a triggered watchlist alert',
    compactDescription: 'Clear a watchlist alert after it triggers',
    concurrencySafe: true,
  });

  // Add Benchmark comparison tools
  tools.push({
    name: 'list_benchmarks',
    tool: createListBenchmarksTool(),
    description: LIST_BENCHMARKS_DESCRIPTION,
    compactDescription: 'List available market benchmarks (SPX, CSI300, NDX)',
    concurrencySafe: true,
  });

  tools.push({
    name: 'compare_to_benchmark',
    tool: createCompareBenchmarkTool(),
    description: COMPARE_BENCHMARK_DESCRIPTION,
    compactDescription: 'Compare portfolio return vs benchmarks for alpha',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_alpha',
    tool: createCalculateAlphaTool(),
    description: CALCULATE_ALPHA_DESCRIPTION,
    compactDescription: 'Calculate portfolio alpha vs a benchmark',
    concurrencySafe: true,
  });

  // Add FX Currency tools
  tools.push({
    name: 'convert_currency',
    tool: createConvertCurrencyTool(),
    description: CONVERT_CURRENCY_DESCRIPTION,
    compactDescription: 'Convert between currencies (USD/CNY/HKD/EUR/GBP)',
    concurrencySafe: true,
  });

  tools.push({
    name: 'list_currencies',
    tool: createListCurrenciesTool(),
    description: LIST_CURRENCIES_DESCRIPTION,
    compactDescription: 'List supported currencies for conversion',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_exchange_rate',
    tool: createGetRateTool(),
    description: GET_EXCHANGE_RATE_DESCRIPTION,
    compactDescription: 'Get current exchange rate between two currencies',
    concurrencySafe: true,
  });

  // Add Multi-Portfolio Management tools
  for (const portfolioTool of multiPortfolioTools) {
    const toolName = portfolioTool.name;

    // Assign compact descriptions based on tool name
    let compactDescription = '';
    let description = '';

    if (toolName === 'list_portfolios') {
      compactDescription = 'List all portfolios and show which one is active';
      description = MULTI_PORTFOLIO_LIST_DESCRIPTION;
    } else if (toolName === 'create_portfolio') {
      compactDescription = 'Create a new named portfolio for tracking separate strategies';
      description = MULTI_PORTFOLIO_CREATE_DESCRIPTION;
    } else if (toolName === 'delete_portfolio') {
      compactDescription = 'Delete a named portfolio';
      description = MULTI_PORTFOLIO_DELETE_DESCRIPTION;
    } else if (toolName === 'switch_portfolio') {
      compactDescription = 'Switch the active portfolio for subsequent operations';
      description = MULTI_PORTFOLIO_SWITCH_DESCRIPTION;
    } else if (toolName === 'add_position_multi') {
      compactDescription = 'Add a position to a specific portfolio';
      description = MULTI_PORTFOLIO_ADD_DESCRIPTION;
    } else if (toolName === 'remove_position_multi') {
      compactDescription = 'Remove a position from a specific portfolio';
      description = MULTI_PORTFOLIO_REMOVE_DESCRIPTION;
    } else if (toolName === 'get_portfolio_multi') {
      compactDescription = 'Get detailed view of a specific portfolio with P&L';
      description = MULTI_PORTFOLIO_GET_DESCRIPTION;
    }

    tools.push({
      name: toolName,
      tool: portfolioTool,
      description,
      compactDescription,
      concurrencySafe: true,
    });
  }

  // Add Market Calendar tools
  tools.push({
    name: 'check_trading_day',
    tool: createCheckTradingDayTool(),
    description: CHECK_TRADING_DAY_DESCRIPTION,
    compactDescription: 'Check if a date is a trading day for US/China/HK markets',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_upcoming_holidays',
    tool: createGetUpcomingHolidaysTool(),
    description: GET_UPCOMING_HOLIDAYS_DESCRIPTION,
    compactDescription: 'Get upcoming market holidays for US/China/HK',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_next_trading_day',
    tool: createGetNextTradingDayTool(),
    description: GET_NEXT_TRADING_DAY_DESCRIPTION,
    compactDescription: 'Find next trading day after a given date',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_trading_days',
    tool: createGetTradingDaysTool(),
    description: GET_TRADING_DAYS_DESCRIPTION,
    compactDescription: 'Get all trading days between two dates',
    concurrencySafe: true,
  });

  // Add Short Interest tools
  tools.push({
    name: 'get_short_interest',
    tool: createGetShortInterestTool(),
    description: GET_SHORT_INTEREST_DESCRIPTION,
    compactDescription: 'Get short interest data and squeeze risk analysis',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_short_interest_ratio',
    tool: createCalculateShortInterestRatioTool(),
    description: CALCULATE_SHORT_INTEREST_RATIO_DESCRIPTION,
    compactDescription: 'Calculate position squeeze risk from short interest',
    concurrencySafe: true,
  });

  tools.push({
    name: 'detect_short_squeeze',
    tool: createDetectShortSqueezeTool(),
    description: DETECT_SHORT_SQUEEZE_DESCRIPTION,
    compactDescription: 'Screen stocks for short squeeze potential',
    concurrencySafe: true,
  });

  // Add Backtest tools
  tools.push({
    name: 'evaluate_trade',
    tool: createEvaluateTradeTool(),
    description: EVALUATE_TRADE_DESCRIPTION,
    compactDescription: 'Evaluate single historical trade against forward price data',
    concurrencySafe: true,
  });

  tools.push({
    name: 'run_backtest',
    tool: createRunBacktestTool(),
    description: RUN_BACKTEST_DESCRIPTION,
    compactDescription: 'Run batch backtest on multiple historical trades',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_backtest_summary',
    tool: createGetBacktestSummaryTool(),
    description: GET_BACKTEST_SUMMARY_DESCRIPTION,
    compactDescription: 'Get guidance on backtest summary metrics interpretation',
    concurrencySafe: true,
  });

  tools.push({
    name: 'calculate_win_rate',
    tool: createCalculateWinRateTool(),
    description: CALCULATE_WIN_RATE_DESCRIPTION,
    compactDescription: 'Calculate win rate from trade outcomes',
    concurrencySafe: true,
  });

  // Add Cache Management tools
  tools.push({
    name: 'get_cache_stats',
    tool: createGetCacheStatsTool(),
    description: GET_CACHE_STATS_DESCRIPTION,
    compactDescription: 'Get market data cache statistics',
    concurrencySafe: true,
  });

  tools.push({
    name: 'clear_cache',
    tool: createClearCacheTool(),
    description: CLEAR_CACHE_DESCRIPTION,
    compactDescription: 'Clear the market data cache',
    concurrencySafe: true,
  });

  tools.push({
    name: 'invalidate_cache',
    tool: createInvalidateCacheTool(),
    description: INVALIDATE_CACHE_DESCRIPTION,
    compactDescription: 'Invalidate specific cache entries by prefix',
    concurrencySafe: true,
  });

  tools.push({
    name: 'get_cache_info',
    tool: createCacheInfoTool(),
    description: GET_CACHE_INFO_DESCRIPTION,
    compactDescription: 'Get cache configuration information',
    concurrencySafe: true,
  });

  return tools;
}

/**
 * Build a name → concurrencySafe map for the tool executor.
 */
export async function getToolConcurrencyMap(model: string): Promise<Map<string, boolean>> {
  const tools = await getToolRegistry(model);
  return new Map(tools.map(t => [t.name, t.concurrencySafe]));
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export async function getTools(model: string): Promise<StructuredToolInterface[]> {
  const tools = await getToolRegistry(model);
  return tools.map(t => t.tool);
}

/**
 * Build the tool descriptions section for the system prompt.
 * Formats each tool's rich description with a header.
 *
 * @param model - The model name
 * @returns Formatted string with all tool descriptions
 */
/**
 * Build compact tool descriptions for token-optimized system prompts.
 * Uses 1-2 sentence descriptions instead of full multi-paragraph ones.
 * The LLM already has full tool schemas via bindTools().
 */
export async function buildCompactToolDescriptions(model: string): Promise<string> {
  const tools = await getToolRegistry(model);
  return tools
    .map((t) => `- **${t.name}**: ${t.compactDescription}`)
    .join('\n');
}
