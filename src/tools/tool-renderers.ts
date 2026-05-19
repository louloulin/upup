/**
 * Tool-specific result renderers
 *
 * Each tool can have a custom renderer that formats its output
 * for the TUI display. Falls back to generic summarization.
 *
 * Reference: Loucode's Tool UI 4-function contract pattern
 */

import { truncateAtWord } from './bash/output-processors.js';

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

function tryParseJSON(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

/**
 * Tool result renderer type.
 * Returns a human-readable summary string, or null to use generic rendering.
 */
export type ToolResultRenderer = (
  args: Record<string, unknown>,
  result: string,
) => string | null;

// Re-export truncateAtWord as truncateWithKeyword for backward compatibility
// The function in output-processors.ts already implements word-boundary truncation
const truncateWithKeyword = truncateAtWord;

// ============================================================================
// Per-tool renderers
// ============================================================================

const bashRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { exitCode?: number; stdout?: string; stderr?: string } | null;
  if (!parsed) return null;

  const exitCode = parsed.exitCode ?? 0;
  const stdout = parsed.stdout ?? '';
  const stderr = parsed.stderr ?? '';

  // Error case: classify security errors
  if (exitCode !== 0) {
    // Security validation errors
    if (stderr.includes('validation failed')) {
      // Extract the denied path if present
      const pathMatch = stderr.match(/path ['"]([^'"]+)['"]/);
      const path = pathMatch ? pathMatch[1].split('/').pop() : '';
      return path ? `Security: denied '${path}'` : 'Security: path denied';
    }
    // Other security errors
    if (stderr.includes('Security')) {
      return `Security: ${truncateWithKeyword(stderr.trim(), 50)}`;
    }
    // General errors
    return `Error: ${truncateWithKeyword(stderr.trim(), 60)}`;
  }

  // Success case: summarize output
  const lines = stdout.trim().split('\n').length;
  if (lines > 1) {
    return `${lines} lines output`;  // No duration - setComplete handles it
  }
  return truncateWithKeyword(stdout.trim(), 60) || 'Done';
};

const editFileRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { message?: string; replacements?: number; diff?: string } | null;
  if (!parsed) return null;

  if (parsed.replacements !== undefined) {
    return `${parsed.replacements} replacement(s)`;
  }
  return parsed.message ? truncate(parsed.message, 60) : null;
};

const readFileRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { totalLines?: number; truncated?: boolean; path?: string } | null;
  if (!parsed) return null;

  const parts: string[] = [];
  if (parsed.totalLines !== undefined) {
    parts.push(`${parsed.totalLines} lines`);
  }
  if (parsed.truncated) {
    parts.push('(truncated)');
  }
  return parts.length > 0 ? parts.join(' ') : null;
};

const writeFileRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { message?: string; bytesWritten?: number } | null;
  if (!parsed) return null;

  if (parsed.bytesWritten !== undefined) {
    const kb = (parsed.bytesWritten / 1024).toFixed(1);
    return `Wrote ${kb}KB`;
  }
  return parsed.message ? truncate(parsed.message, 60) : null;
};

const webSearchRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { results?: unknown[] } | null;
  if (!parsed) return null;

  if (Array.isArray(parsed.results)) {
    return `${parsed.results.length} search results`;
  }
  return null;
};

const webFetchRenderer: ToolResultRenderer = (_args, result) => {
  const parsed = tryParseJSON(result) as { title?: string; content?: string } | null;
  if (!parsed) return null;

  if (parsed.title) {
    return truncate(parsed.title, 60);
  }
  return null;
};

// Financial tool renderers
const financialRenderer: ToolResultRenderer = (args, result) => {
  const parsed = tryParseJSON(result) as { data?: Record<string, unknown> } | null;
  if (!parsed?.data) return null;

  const ticker = (args.symbol ?? args.ticker ?? '') as string;
  const keys = Object.keys(parsed.data).filter(k => !k.startsWith('_'));

  if (ticker) {
    return `${ticker}: ${keys.length} data fields`;
  }
  return `${keys.length} data fields`;
};

const quantRenderer: ToolResultRenderer = (args, result) => {
  const parsed = tryParseJSON(result) as { data?: Record<string, unknown> } | null;
  if (!parsed?.data) return null;

  // Show key metric values
  const data = parsed.data;
  const displayKeys = ['sharpeRatio', 'sortinoRatio', 'maxDrawdown', 'var95', 'value', 'beta', 'alpha'];
  const values: string[] = [];

  for (const key of displayKeys) {
    if (key in data && typeof data[key] === 'number') {
      values.push(`${key}: ${(data[key] as number).toFixed(4)}`);
    }
  }

  if (values.length > 0) {
    return values.slice(0, 2).join(', ');
  }
  return null;
};

// ============================================================================
// Registry
// ============================================================================

const renderers = new Map<string, ToolResultRenderer>([
  ['bash', bashRenderer],
  ['edit_file', editFileRenderer],
  ['read_file', readFileRenderer],
  ['write_file', writeFileRenderer],
  ['web_search', webSearchRenderer],
  ['web_fetch', webFetchRenderer],
  ['get_financials', financialRenderer],
  ['get_market_data', financialRenderer],
  ['stock_screener', financialRenderer],
  ['calculate_sharpe_ratio', quantRenderer],
  ['calculate_sortino_ratio', quantRenderer],
  ['calculate_max_drawdown', quantRenderer],
  ['calculate_var', quantRenderer],
  ['calculate_beta', quantRenderer],
]);

/**
 * Get a custom summary for a tool result.
 * Returns null if no custom renderer exists (use generic summarization).
 */
export function renderToolResult(
  toolName: string,
  args: Record<string, unknown>,
  result: string,
): string | null {
  const renderer = renderers.get(toolName);
  if (!renderer) return null;
  return renderer(args, result);
}

/**
 * Register a custom renderer for a tool.
 */
export function registerToolRenderer(
  toolName: string,
  renderer: ToolResultRenderer,
): void {
  renderers.set(toolName, renderer);
}
