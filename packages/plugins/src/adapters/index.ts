/**
 * UpUp Plugin System — Adapter Registration
 *
 * Registers all runtime adapters with the plugin loader.
 */

import { getPluginLoader } from '../loader.js';
import { BunAdapter } from './bun.js';
import { JitiAdapter } from './jiti.js';
import { WasmAdapter } from './wasm.js';
import { McpAdapter } from './mcp.js';
import { DuckDBAdapter } from '../data/duckdb-plugin.js';

/**
 * Register all built-in adapters with the plugin loader
 */
export function registerAllAdapters(): void {
  const loader = getPluginLoader();

  // Register in priority order (bun first for speed)
  loader.registerAdapter(new BunAdapter());
  loader.registerAdapter(new JitiAdapter());
  loader.registerAdapter(new WasmAdapter());
  loader.registerAdapter(new McpAdapter());

  // Register data source adapters
  loader.registerAdapter(new DuckDBAdapter());
}

// Export adapters for direct access
export { BunAdapter } from './bun.js';
export { JitiAdapter } from './jiti.js';
export { WasmAdapter } from './wasm.js';
export { McpAdapter } from './mcp.js';
export { DuckDBAdapter } from '../data/duckdb-plugin.js';