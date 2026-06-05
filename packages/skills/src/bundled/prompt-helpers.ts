/**
 * Investment Skill Prompt Helpers
 *
 * Dynamic prompt generation utilities that align with Loucode's pattern.
 * These helpers enable:
 * - MCP availability detection and context injection
 * - Dynamic prompt generation based on runtime conditions
 * - Investment data context injection
 * - Feature flag support for skill capabilities
 *
 * Pattern Reference: Loucode's bundledSkills.ts and prompt-helpers.ts
 */

import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { isInvestmentMcpConfigured } from '@upup/mcp/investment-data';

// ============================================================================
// Feature Flags (Aligned with Loucode's feature system)
// ============================================================================

/**
 * Feature flags for investment skills.
 * These can be toggled at runtime to enable/disable capabilities.
 */
export const INVESTMENT_FEATURE_FLAGS = {
  /** Enable real-time market data access */
  REALTIME_DATA: true,
  /** Enable DCF valuation calculations */
  DCF_ANALYSIS: true,
  /** Enable technical analysis indicators */
  TECHNICAL_ANALYSIS: true,
  /** Enable portfolio optimization suggestions */
  PORTFOLIO_OPTIMIZATION: true,
  /** Enable risk metrics calculations */
  RISK_METRICS: true,
  /** Enable sentiment analysis from news */
  SENTIMENT_ANALYSIS: true,
  /** Enable market structure analysis */
  MARKET_STRUCTURE: true,
} as const;

export type InvestmentFeatureFlag = keyof typeof INVESTMENT_FEATURE_FLAGS;

/**
 * Check if a feature is enabled.
 */
export function isFeatureEnabled(feature: InvestmentFeatureFlag): boolean {
  return INVESTMENT_FEATURE_FLAGS[feature] ?? false;
}

/**
 * Get all enabled features as a list.
 */
export function getEnabledFeatures(): InvestmentFeatureFlag[] {
  return Object.entries(INVESTMENT_FEATURE_FLAGS)
    .filter(([, enabled]) => enabled)
    .map(([feature]) => feature as InvestmentFeatureFlag);
}

/**
 * Check if investment data MCP is available.
 * Used by skill prompts to determine what data access methods are available.
 */
export function isMcpAvailable(): boolean {
  return isInvestmentMcpConfigured();
}

/**
 * Get available investment data sources.
 * Returns the list of data sources the skill can use.
 */
export function getAvailableDataSources(): string[] {
  const sources: string[] = [];

  // Check for local data files
  const dataPaths = [
    '.upup/portfolio',
    '.upup/trades',
    '.upup/analyses',
    '.upup/research',
  ];

  for (const dataPath of dataPaths) {
    if (existsSync(dataPath)) {
      const type = dataPath.replace('.upup/', '');
      sources.push(type);
    }
  }

  // Check for MCP data access
  if (isInvestmentMcpConfigured()) {
    sources.push('mcp:tushare');
    sources.push('mcp:akshare');
    sources.push('mcp:eastmoney');
  }

  return sources.length > 0 ? sources : ['none'];
}

/**
 * Build investment data context for skill prompts.
 * This context informs the skill about available data sources.
 * Returns empty string if no data sources are available.
 *
 * Enhanced with feature flags support (aligned with Loucode pattern).
 */
export function buildInvestmentContext(): string {
  const sources = getAvailableDataSources();
  const hasMcp = isMcpAvailable();
  const hasLocalData = sources.length > 0 && sources[0] !== 'none';

  // If no data sources at all, return empty string
  if (!hasMcp && !hasLocalData) {
    return ''; // No context needed when there's no data
  }

  const contextParts: string[] = [
    '## 可用数据源',
    '',
  ];

  if (hasMcp) {
    contextParts.push('**MCP 数据源** (实时):');

    // Add data sources based on feature flags
    if (isFeatureEnabled('REALTIME_DATA')) {
      contextParts.push('- 实时行情数据 (getStockPrice)');
    }
    if (isFeatureEnabled('DCF_ANALYSIS')) {
      contextParts.push('- 财务数据 (getFinancials)');
    }
    if (isFeatureEnabled('TECHNICAL_ANALYSIS')) {
      contextParts.push('- 技术指标 (getTechnicalData)');
    }
    if (isFeatureEnabled('SENTIMENT_ANALYSIS')) {
      contextParts.push('- 新闻舆情 (getNews)');
    }
    if (isFeatureEnabled('MARKET_STRUCTURE')) {
      contextParts.push('- 市场数据 (getMarketData)');
    }
    if (isFeatureEnabled('RISK_METRICS')) {
      contextParts.push('- 风险指标 (riskMetrics)');
    }
    if (isFeatureEnabled('PORTFOLIO_OPTIMIZATION')) {
      contextParts.push('- 组合优化 (portfolioOptimization)');
    }

    contextParts.push('');
  }

  if (hasLocalData) {
    contextParts.push('**本地数据**:');
    for (const source of sources) {
      if (source.startsWith('mcp:')) continue;
      contextParts.push(`- ${source}`);
    }
    contextParts.push('');
  }

  // Add enabled features summary
  const enabledFeatures = getEnabledFeatures();
  if (enabledFeatures.length > 0) {
    contextParts.push('**启用的分析功能**:');
    contextParts.push(enabledFeatures.map(f => `- ${f}`).join('\n'));
    contextParts.push('');
  }

  return contextParts.join('\n');
}

/**
 * Build skill execution header with metadata.
 * Similar to Loucode's skill execution headers.
 */
export function buildSkillHeader(
  skillName: string,
  skillDescription: string
): string {
  const timestamp = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  });

  return `# ${skillName}

> ${skillDescription}
> 时间: ${timestamp}

${buildInvestmentContext()}`;
}

/**
 * Investment skill result formatter.
 * Standardizes the output format for investment analysis results.
 */
export interface InvestmentResult {
  stock?: string;
  score?: number;
  signal?: 'buy' | 'sell' | 'hold';
  metrics?: Record<string, string | number>;
  recommendation?: string;
}

/**
 * Format investment analysis result as markdown.
 */
export function formatInvestmentResult(result: InvestmentResult): string {
  const lines: string[] = [];

  if (result.stock) {
    lines.push(`### ${result.stock}`);
    lines.push('');
  }

  if (result.score !== undefined) {
    const emoji = result.score >= 70 ? '🟢' : result.score >= 40 ? '🟡' : '🔴';
    lines.push(`**综合评分**: ${emoji} ${result.score}/100`);
    lines.push('');
  }

  if (result.signal) {
    const signalMap = {
      buy: '🟢 买入',
      sell: '🔴 卖出',
      hold: '🟡 持有',
    };
    lines.push(`**信号**: ${signalMap[result.signal]}`);
    lines.push('');
  }

  if (result.metrics && Object.keys(result.metrics).length > 0) {
    lines.push('**关键指标**:');
    for (const [key, value] of Object.entries(result.metrics)) {
      lines.push(`- ${key}: ${value}`);
    }
    lines.push('');
  }

  if (result.recommendation) {
    lines.push('**建议**:');
    lines.push(result.recommendation);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if portfolio data exists.
 */
export function hasPortfolioData(): boolean {
  const portfolioPaths = [
    '.upup/portfolio/positions.md',
    '.upup/portfolio/notes.md',
    '.upup/trades/history.md',
  ];

  return portfolioPaths.some(p => existsSync(p));
}

/**
 * Get portfolio data summary.
 */
export function getPortfolioSummary(): string {
  const summaryParts: string[] = [];

  // Count positions
  const positionsPath = '.upup/portfolio/positions.md';
  if (existsSync(positionsPath)) {
    try {
      const content = require('fs').readFileSync(positionsPath, 'utf-8');
      const lines = content.split('\n').filter((l: string) => l.trim() && !l.startsWith('#'));
      summaryParts.push(`- 持仓记录: ${lines.length} 条`);
    } catch {
      // Ignore
    }
  }

  // Count trades
  const tradesPath = '.upup/trades/history.md';
  if (existsSync(tradesPath)) {
    try {
      const content = require('fs').readFileSync(tradesPath, 'utf-8');
      const trades = content.match(/\| .* \|/g);
      summaryParts.push(`- 交易记录: ${trades ? trades.length : 0} 条`);
    } catch {
      // Ignore
    }
  }

  return summaryParts.length > 0
    ? `**投资组合数据**: ${summaryParts.join(', ')}`
    : '**投资组合数据**: 未找到本地数据';
}

/**
 * Dynamic prompt builder for investment skills.
 * Creates prompts with contextual information based on available data.
 */
export function buildInvestmentPrompt(
  basePrompt: string,
  options: {
    includeDataContext?: boolean;
    includePortfolio?: boolean;
    userArgs?: string;
  } = {}
): string {
  const parts: string[] = [];

  // Add base prompt
  parts.push(basePrompt);

  // Add data context if requested
  if (options.includeDataContext !== false) {
    const dataContext = buildInvestmentContext();
    if (dataContext) {
      parts.push('');
      parts.push(dataContext);
    }
  }

  // Add portfolio summary if requested
  if (options.includePortfolio) {
    parts.push('');
    parts.push(getPortfolioSummary());
  }

  // Add user arguments if provided
  if (options.userArgs && options.userArgs.trim()) {
    parts.push('');
    parts.push(`## 用户指定任务`);
    parts.push('');
    parts.push(options.userArgs.trim());
  }

  return parts.join('\n');
}

// ============================================================================
// Enhanced Prompt Builders (Loucode Pattern)
// ============================================================================

/**
 * Build skill execution context metadata.
 * This provides structured metadata for skill execution.
 *
 * Similar to Loucode's skill execution headers.
 */
export interface SkillExecutionContext {
  skillName: string;
  timestamp: string;
  hasMcp: boolean;
  hasPortfolioData: boolean;
  enabledFeatures: InvestmentFeatureFlag[];
  availableDataSources: string[];
}

export function buildSkillExecutionContextMetadata(
  skillName: string
): SkillExecutionContext {
  return {
    skillName,
    timestamp: new Date().toISOString(),
    hasMcp: isMcpAvailable(),
    hasPortfolioData: hasPortfolioData(),
    enabledFeatures: getEnabledFeatures(),
    availableDataSources: getAvailableDataSources(),
  };
}

/**
 * Format skill execution context as markdown for prompt injection.
 */
export function formatSkillExecutionContextMetadata(
  skillName: string,
  description: string
): string {
  const ctx = buildSkillExecutionContextMetadata(skillName);

  const lines: string[] = [];
  lines.push(`# ${skillName}`);
  lines.push('');
  lines.push(`> ${description}`);
  lines.push(`> 时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  lines.push('');

  lines.push('## 执行上下文');
  lines.push('');

  if (ctx.hasMcp) {
    lines.push('- ✅ MCP 数据源可用');
  } else {
    lines.push('- ⚠️ MCP 数据源不可用');
  }

  if (ctx.hasPortfolioData) {
    lines.push('- ✅ 投资组合数据可用');
  } else {
    lines.push('- ⚠️ 投资组合数据不可用');
  }

  if (ctx.enabledFeatures.length > 0) {
    lines.push('');
    lines.push('**启用的功能**:');
    for (const feature of ctx.enabledFeatures) {
      lines.push(`- ${feature}`);
    }
  }

  return lines.join('\n');
}

/**
 * Enhanced investment prompt builder with Loucode pattern support.
 * Adds skill root directory and session context similar to Loucode's approach.
 */
export function buildEnhancedInvestmentPrompt(
  basePrompt: string,
  options: {
    skillRoot?: string;
    sessionId?: string;
    includeDataContext?: boolean;
    includePortfolio?: boolean;
    userArgs?: string;
    skillName?: string;
    skillDescription?: string;
  } = {}
): string {
  const parts: string[] = [];

  // Add base directory reference (Loucode pattern)
  if (options.skillRoot) {
    parts.push(`Base directory for this skill: ${options.skillRoot}`);
    parts.push('');
  }

  // Add skill header if provided
  if (options.skillName) {
    parts.push(`# ${options.skillName}`);
    if (options.skillDescription) {
      parts.push(`> ${options.skillDescription}`);
    }
    parts.push('');
  }

  // Add session context (Loucode pattern)
  if (options.sessionId) {
    parts.push(`<!-- Session: ${options.sessionId} -->`);
    parts.push('');
  }

  // Add timestamp
  const timestamp = new Date().toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
  });
  parts.push(`> 生成时间: ${timestamp}`);
  parts.push('');

  // Add base prompt
  parts.push(basePrompt);

  // Add data context if requested
  if (options.includeDataContext !== false) {
    const dataContext = buildInvestmentContext();
    if (dataContext) {
      parts.push('');
      parts.push(dataContext);
    }
  }

  // Add portfolio summary if requested
  if (options.includePortfolio) {
    parts.push('');
    parts.push(getPortfolioSummary());
  }

  // Add user arguments if provided
  if (options.userArgs && options.userArgs.trim()) {
    parts.push('');
    parts.push('## 用户指定任务');
    parts.push('');
    parts.push(options.userArgs.trim());
  }

  return parts.join('\n');
}
