import { StructuredToolInterface } from '@langchain/core/tools';
import { createGetFinancials, createGetMarketData, createReadFilings, createScreenStocks } from './finance/index.js';
import { exaSearch, perplexitySearch, tavilySearch, WEB_SEARCH_DESCRIPTION, xSearchTool, X_SEARCH_DESCRIPTION } from './search/index.js';
import { skillTool, SKILL_TOOL_DESCRIPTION } from './skill.js';
import { webFetchTool, WEB_FETCH_DESCRIPTION } from './fetch/web-fetch.js';
import { browserTool, BROWSER_DESCRIPTION } from './browser/browser.js';
import { readFileTool, READ_FILE_DESCRIPTION } from './filesystem/read-file.js';
import { writeFileTool, WRITE_FILE_DESCRIPTION } from './filesystem/write-file.js';
import { editFileTool, EDIT_FILE_DESCRIPTION } from './filesystem/edit-file.js';
import { globTool } from './filesystem/glob.js';
import { grepTool } from './filesystem/grep.js';
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
  createCalculateVaRTool,
  createCalculateSharpeTool,
  createCalculateSortinoTool,
  createCalculateMaxDrawdownTool,
  CALCULATE_VAR_DESCRIPTION,
  CALCULATE_SHARPE_DESCRIPTION,
  CALCULATE_SORTINO_DESCRIPTION,
  CALCULATE_MAX_DRAWDOWN_DESCRIPTION,
} from './quant/index.js';
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
}

/**
 * Get all registered tools with their descriptions.
 * Conditionally includes tools based on environment configuration.
 *
 * @param model - The model name (needed for tools that require model-specific configuration)
 * @returns Array of registered tools
 */
export function getToolRegistry(model: string): RegisteredTool[] {
  const tools: RegisteredTool[] = [
    {
      name: 'get_financials',
      tool: createGetFinancials(model),
      description: GET_FINANCIALS_DESCRIPTION,
      compactDescription: 'Financial statements, metrics, and analyst estimates. Handles multi-company/multi-metric queries in one call.',
      concurrencySafe: true,
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
    },
    {
      name: 'browser',
      tool: browserTool,
      description: BROWSER_DESCRIPTION,
      compactDescription: 'JavaScript-rendered pages and interactive navigation. Actions: navigate, snapshot, act, read, close.',
      concurrencySafe: true,
    },
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
    },
    {
      name: 'edit_file',
      tool: editFileTool,
      description: EDIT_FILE_DESCRIPTION,
      compactDescription: 'Edit a file by replacing text. Requires user approval.',
      concurrencySafe: false,
    },
    {
      name: 'glob',
      tool: globTool,
      description: `Find files matching a glob pattern. Use this to find all files of a specific type (e.g., "**/*.ts") or files in a directory tree.`,
      compactDescription: 'Find files by glob pattern (e.g., "**/*.ts", "src/**/*.js").',
      concurrencySafe: true,
    },
    {
      name: 'grep',
      tool: grepTool,
      description: `Search file contents using regular expressions. Use this to find text patterns across files, search for function/variable definitions, or extract matching lines with context.`,
      compactDescription: 'Search file contents with regex patterns. Supports content, files_with_matches, and count modes.',
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
    },
    {
      name: 'memory_get',
      tool: memoryGetTool,
      description: MEMORY_GET_DESCRIPTION,
      compactDescription: 'Read specific memory file sections by line range.',
      concurrencySafe: true,
    },
    {
      name: 'memory_update',
      tool: memoryUpdateTool,
      description: MEMORY_UPDATE_DESCRIPTION,
      compactDescription: 'Add, edit, or delete persistent memory entries.',
      concurrencySafe: false,
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

  // Add Quantitative Analysis tools
  tools.push({
    name: 'calculate_var',
    tool: createCalculateVaRTool(),
    description: CALCULATE_VAR_DESCRIPTION,
    compactDescription: 'Calculate Value at Risk (VaR) for portfolio risk assessment',
    concurrencySafe: true,
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

  return tools;
}

/**
 * Build a name → concurrencySafe map for the tool executor.
 */
export function getToolConcurrencyMap(model: string): Map<string, boolean> {
  return new Map(getToolRegistry(model).map(t => [t.name, t.concurrencySafe]));
}

/**
 * Get just the tool instances for binding to the LLM.
 *
 * @param model - The model name
 * @returns Array of tool instances
 */
export function getTools(model: string): StructuredToolInterface[] {
  return getToolRegistry(model).map((t) => t.tool);
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
export function buildCompactToolDescriptions(model: string): string {
  return getToolRegistry(model)
    .map((t) => `- **${t.name}**: ${t.compactDescription}`)
    .join('\n');
}
