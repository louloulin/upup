/**
 * Investment Data MCP Integration
 *
 * Provides MCP tools for investment data access.
 * This module defines the interface for investment data MCP servers.
 */

/**
 * Investment data tools that can be exposed via MCP.
 */
export interface InvestmentMcpTools {
  // Market Data
  getStockPrice: {
    description: '获取股票实时价格';
    parameters: { code: string };
  };

  // Financial Data
  getFinancials: {
    description: '获取财务数据';
    parameters: { code: string; period: 'annual' | 'quarterly' };
  };

  // Technical Data
  getTechnicalData: {
    description: '获取技术指标数据';
    parameters: { code: string; indicators: string[] };
  };

  // News Data
  getNews: {
    description: '获取股票新闻';
    parameters: { code: string; limit?: number };
  };

  // Market Data
  getMarketData: {
    description: '获取市场数据';
    parameters: { type: 'index' | 'sector' | 'hot' };
  };
}

/**
 * Investment data MCP server configuration.
 */
export interface InvestmentMcpConfig {
  /** Server name */
  name: string;
  /** Server type */
  type: 'market' | 'financial' | 'news' | 'comprehensive';
  /** Whether server is enabled */
  enabled: boolean;
  /** API endpoint (if external) */
  endpoint?: string;
  /** API key (if required) */
  apiKey?: string;
}

/**
 * Default investment MCP servers.
 */
export const DEFAULT_INVESTMENT_MCP_SERVERS: InvestmentMcpConfig[] = [
  {
    name: 'tushare',
    type: 'comprehensive',
    enabled: false,
    endpoint: 'https://api.tushare.pro',
  },
  {
    name: 'akshare',
    type: 'comprehensive',
    enabled: true,
  },
  {
    name: 'eastmoney',
    type: 'market',
    enabled: true,
  },
];

/**
 * Get available investment data tools.
 *
 * @returns Array of available investment data tools
 */
export function getAvailableInvestmentTools(): string[] {
  return [
    'getStockPrice',
    'getFinancials',
    'getTechnicalData',
    'getNews',
    'getMarketData',
  ];
}

/**
 * Check if investment data MCP is configured.
 *
 * @returns true if at least one investment MCP server is enabled
 */
export function isInvestmentMcpConfigured(): boolean {
  return DEFAULT_INVESTMENT_MCP_SERVERS.some(s => s.enabled);
}
