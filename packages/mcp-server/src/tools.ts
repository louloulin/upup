/**
 * UpUp MCP server — tool definitions.
 *
 * Every tool here is a thin adapter over an existing UpUp finance function.
 * The rule "if Pi's ecosystem already provides it, UpUp wraps it" applies to
 * the MCP surface too: each tool delegates to `@upup/pi-finance-sdk`,
 * `@upup/pi-research`, or `@upup/pi-market-data` — no business logic is
 * re-implemented here. Adding a tool = one new entry, with `execute` being
 * a one-liner that calls the SDK function and serialises its result.
 *
 * Tool naming follows MCP convention (`<namespace>__<tool>`) so TradingAgents
 * and Claude Code can recognise UpUp's tool family at a glance and disambiguate
 * from MCP servers shipped by other vendors.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  NativeResearchDataClient,
  fetchNativeAStockNews,
  type NativeAStockNewsItem,
  fetchNativeAStockFinancials,
  listNativeInvestmentStrategies,
  type NativeStrategyRiskTolerance,
  readNativeFilings,
  type NativeFilingRecord,
  getNativeCompanyProfile,
} from '@upup/pi-finance-sdk';

/** One MCP tool description, in the shape Pi's `registerTool` and MCP `tools/list` both accept. */
export interface UpUpMcpToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly execute: (params: Record<string, unknown>, signal: AbortSignal | undefined) => Promise<CallToolResult>;
}

function textResult(text: string): CallToolResult {
  return { content: [{ type: 'text', text }], isError: false };
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** JSON-Schema-style description of a single string parameter. */
function stringParam(description: string): { type: 'string'; description: string } {
  return { type: 'string', description };
}

/** Default research-data client (re-used across tools). Lazy init for testability. */
let cachedClient: NativeResearchDataClient | null = null;
function getResearchClient(): NativeResearchDataClient {
  if (!cachedClient) cachedClient = new NativeResearchDataClient();
  return cachedClient;
}

function filingsToText(filings: readonly NativeFilingRecord[]): string {
  return JSON.stringify(filings.map((filing) => ({
    ticker: filing.ticker,
    form: filing.form,
    filedAt: filing.filedAt,
    accessionNumber: filing.accessionNumber,
    url: filing.url,
  })), null, 2);
}

function aStockNewsToText(news: readonly NativeAStockNewsItem[]): string {
  return JSON.stringify(news.map((entry) => ({
    tsCode: entry.tsCode,
    title: entry.title,
    publishedAt: entry.publishedAt,
    url: entry.url,
    source: entry.source,
    summary: entry.summary,
    kind: entry.kind,
  })), null, 2);
}

/**
 * The full UpUp MCP tool catalog. Tools are intentionally read-only here —
 * financial write operations (`place_trade_order`, `config_set`, …) stay
 * behind Pi's policy approval gate and are NOT exposed to MCP clients.
 *
 * To add a new tool:
 *   1. Find the matching function in `@upup/pi-finance-sdk`, `@upup/pi-research`
 *      or `@upup/pi-market-data` (rule: never reimplement).
 *   2. Append a `UpUpMcpToolSpec` here.
 *   3. `bun run check:mcp-tool-coverage` (added by the script) must stay green.
 */
export const UPUP_MCP_TOOLS: readonly UpUpMcpToolSpec[] = [
  {
    name: 'upup_finance__get_stock_price',
    description: 'Fetch a network stock price snapshot for a ticker (CN/HK/US). Returns provider, freshness, source URLs and the raw price payload.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: stringParam('Ticker symbol, e.g. "AAPL", "600519.SH", "00700.HK"'),
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const json = await getResearchClient().getStockPrice({ ticker: String(params.ticker ?? '') });
        return textResult(json);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__get_key_ratios',
    description: 'Fetch current financial key ratios (P/E, P/B, ROE, …) for a ticker.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: stringParam('Ticker symbol'),
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const json = await getResearchClient().getKeyRatios({ ticker: String(params.ticker ?? '') });
        return textResult(json);
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__get_company_profile',
    description: 'Resolve a ticker to its company name, exchange, sector and basic profile.',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: stringParam('Ticker symbol'),
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const profile = await getNativeCompanyProfile(String(params.ticker ?? ''));
        return textResult(JSON.stringify(profile, null, 2));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__get_filings',
    description: 'List SEC / exchange filings for a ticker (10-K, 10-Q, 8-K, …).',
    inputSchema: {
      type: 'object',
      properties: {
        ticker: stringParam('Ticker symbol'),
        formType: stringParam('Filter by filing form type, e.g. "10-K". Optional.'),
        limit: { type: 'integer', description: 'Maximum number of filings to return.', minimum: 1, maximum: 50 },
      },
      required: ['ticker'],
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const result = await readNativeFilings({
          ticker: String(params.ticker ?? ''),
          query: String(params.ticker ?? ''),
          ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        });
        return textResult(filingsToText(result.filings));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__get_astock_news',
    description: 'Fetch A-share announcements or 7x24 headlines (东方财富). Read-only — original text, no investment advice.',
    inputSchema: {
      type: 'object',
      properties: {
        code: stringParam('A-share code, e.g. "600519" or "600519.SH"'),
        startDate: stringParam('Inclusive start date (YYYY-MM-DD). Optional.'),
        endDate: stringParam('Inclusive end date (YYYY-MM-DD). Optional.'),
        limit: { type: 'integer', description: 'Maximum entries to return.', minimum: 1, maximum: 100 },
      },
      required: ['code'],
      additionalProperties: false,
    },
    async execute(params, signal) {
      try {
        const value = await fetchNativeAStockNews({
          code: String(params.code ?? ''),
          ...(params.startDate ? { startDate: String(params.startDate) } : {}),
          ...(params.endDate ? { endDate: String(params.endDate) } : {}),
          ...(typeof params.limit === 'number' ? { limit: params.limit } : {}),
        }, signal ? { signal } : {});
        return textResult(aStockNewsToText(value.items));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__get_astock_financials',
    description: 'Fetch A-share financial snapshot (income statement / balance sheet / cash flow) for a code.',
    inputSchema: {
      type: 'object',
      properties: {
        code: stringParam('A-share code, e.g. "600519" or "600519.SH"'),
      },
      required: ['code'],
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const snapshot = await fetchNativeAStockFinancials(String(params.code ?? ''));
        return textResult(JSON.stringify(snapshot, null, 2));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
  {
    name: 'upup_finance__list_investment_strategies',
    description: 'List built-in investment strategies / methodologies UpUp ships. Useful for surfacing SOPs to MCP clients.',
    inputSchema: {
      type: 'object',
      properties: {
        riskTolerance: { type: 'string', enum: ['conservative', 'balanced', 'aggressive'], description: 'Filter by risk tolerance.' },
      },
      additionalProperties: false,
    },
    async execute(params, _signal) {
      try {
        const strategies = listNativeInvestmentStrategies(
          params.riskTolerance
            ? { riskTolerance: String(params.riskTolerance) as NativeStrategyRiskTolerance }
            : {},
        );
        return textResult(JSON.stringify(strategies, null, 2));
      } catch (error) {
        return errorResult(error instanceof Error ? error.message : String(error));
      }
    },
  },
] as const;

/** Lookup a tool by name (used by `tools/call` handler). */
export function findUpUpMcpTool(name: string): UpUpMcpToolSpec | undefined {
  return UPUP_MCP_TOOLS.find((tool) => tool.name === name);
}

/** Names of every UpUp MCP tool (used by `tools/list` and the guard script). */
export const UPUP_MCP_TOOL_NAMES: readonly string[] = UPUP_MCP_TOOLS.map((t) => t.name);
