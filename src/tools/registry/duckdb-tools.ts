/**
 * DuckDB Tools — Tool loader for DuckDB data analytics plugin.
 *
 * DuckDB provides fast in-process SQL analytics for investment data.
 * Tools are loaded from the DuckDBPlugin and registered as standard UpUp tools.
 *
 * Design: DuckDB runs in-process via duckdb-wasm, enabling:
 * - Portfolio risk analysis (VaR, Sharpe, volatility)
 * - Time series aggregation (daily, weekly, monthly)
 * - CSV/Parquet import for financial datasets
 * - Ad-hoc SQL queries against loaded data
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import type { RegisteredTool } from './types.js';
import { DuckDBPlugin } from '../../plugins/data/duckdb-plugin.js';

/** Lazy singleton for DuckDB plugin */
let duckDBPlugin: DuckDBPlugin | null = null;

/** Get or create DuckDB plugin instance */
function getDuckDBPlugin(): DuckDBPlugin {
  if (!duckDBPlugin) {
    duckDBPlugin = new DuckDBPlugin();
  }
  return duckDBPlugin;
}

/**
 * Load DuckDB tools as UpUp registered tools.
 */
export async function loadDuckDBTools(): Promise<RegisteredTool[]> {
  try {
    const plugin = getDuckDBPlugin();
    const pluginTools = plugin.getTools();

    // Convert AgentTool (Plugin format) to DynamicStructuredTool (LangChain format)
    // This ensures tools have proper .toJSON() with 'type' field for OpenAI SDK compatibility
    const registeredTools: RegisteredTool[] = pluginTools.map((tool: any) => {
      const langChainTool = new DynamicStructuredTool({
        name: tool.name,
        description: tool.description,
        schema: tool.schema,
        func: tool.execute,
      });

      return {
        name: tool.name,
        description: tool.description,
        compactDescription: `[DuckDB] ${tool.description.substring(0, 100)}`,
        tool: langChainTool as unknown as StructuredToolInterface,
        concurrencySafe: true, // DuckDB handles concurrent queries
      };
    });

    return registeredTools;
  } catch {
    // DuckDB not available, return empty
    return [];
  }
}

/**
 * Get DuckDB service for direct access.
 * Used by other parts of the system that need DuckDB capabilities.
 */
export function getDuckDBService() {
  const plugin = getDuckDBPlugin();
  return plugin.getService();
}