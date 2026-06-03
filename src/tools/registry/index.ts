/**
 * Tool Registry — Composes domain-specific tool loaders.
 *
 * This module re-exports the registry API but delegates actual tool
 * registration to domain-specific sub-modules for maintainability.
 *
 * Previous: 1978 lines monolithic → Now: ~60 lines orchestration
 */

import type { StructuredToolInterface } from '@langchain/core/tools';

// Re-export types from sub-module
export type { ToolSafetyLevel, ToolCategory, ToolSideEffects, ToolConcurrencyMetadata, RegisteredTool } from './types.js';
export {
  financialReadMetadata, financialWriteMetadata,
  fileWriteMetadata, fileReadMetadata,
  computationMetadata, memoryMetadata,
  networkMetadata, systemMetadata,
} from './types.js';

// Import domain loaders
import { loadFinanceTools } from './finance-tools.js';
import { loadWebSearchTools } from './web-search-tools.js';
import { loadFilesystemTools } from './filesystem-tools.js';
import { loadMCPTools } from './mcp-tools.js';
import { loadAgentPlanningTools } from './agent-planning-tools.js';
import { loadQuantTools } from './quant-tools.js';
import { loadDomainTools } from './domain-tools.js';
import { loadDuckDBTools } from './duckdb-tools.js';
import { loadInvestmentKnowledgeTools } from './investment-knowledge-tools.js';
import { loadTradingTools } from './trading-tools.js';
import { loadRealtimeTools } from './realtime-tools.js';
import { loadCoordinatorTools } from './coordinator-tools.js';
import { loadKairosTools } from './kairos-tools.js';
import { loadFundTools } from './fund-tools.js';

import type { RegisteredTool } from './types.js';

/**
 * Build the full tool registry by composing all domain loaders.
 */
export async function getToolRegistry(model: string): Promise<RegisteredTool[]> {
  const tools: RegisteredTool[] = [
    // Finance (US + A-share + Fund)
    ...loadFinanceTools(model),

    // Fund tools (Chinese mutual funds - 天天基金)
    ...loadFundTools(),

    // Web, search, browser
    ...await loadWebSearchTools(),

    // Filesystem, heartbeat, cron, memory
    ...loadFilesystemTools(),

    // MCP (Model Context Protocol)
    ...loadMCPTools(),

    // Agent, planning, todo, task, ask
    ...await loadAgentPlanningTools(),

    // Quantitative analysis
    ...loadQuantTools(),

    // Domain-specific (portfolio, worktree, skill, team, valuation, etc.)
    ...await loadDomainTools(),

    // DuckDB data analytics (in-process SQL for investment data)
    ...await loadDuckDBTools(),

    // Investment knowledge management
    ...loadInvestmentKnowledgeTools(),

    // Trading (sandbox + broker adapters)
    ...loadTradingTools(),

    // Realtime feed (mock / eastmoney) with throttle + OHLC aggregation
    ...loadRealtimeTools(),

    // 4-worker investment-analysis coordinator
    ...loadCoordinatorTools(),

    // KAIROS proactive / position monitor / event scanner (read-only tools)
    ...loadKairosTools(),
  ];

  return tools;
}

/**
 * Build a name → concurrencySafe map for the tool executor.
 */
export async function getToolConcurrencyMap(model: string): Promise<Map<string, boolean>> {
  const tools = await getToolRegistry(model);
  return new Map(tools.filter(t => t?.name).map(t => [t!.name, t!.concurrencySafe]));
}

/**
 * Get just the tool instances for binding to the LLM.
 */
export async function getTools(model: string): Promise<StructuredToolInterface[]> {
  const tools = await getToolRegistry(model);
  return tools.filter(t => t?.tool).map(t => t!.tool);
}

/**
 * Build compact tool descriptions for token-optimized system prompts.
 */
export async function buildCompactToolDescriptions(model: string): Promise<string> {
  const tools = await getToolRegistry(model);
  return tools
    .filter(t => t?.name)
    .map((t) => `- **${t!.name}**: ${t!.compactDescription}`)
    .join('\n');
}
