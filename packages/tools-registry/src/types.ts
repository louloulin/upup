/**
 * Shared types for tool registry modules.
 */

import type { StructuredToolInterface } from '@langchain/core/tools';

export type ToolSafetyLevel = 'safe' | 'warning' | 'dangerous' | 'critical';

export type ToolCategory =
  | 'financial'
  | 'search'
  | 'browser'
  | 'filesystem'
  | 'memory'
  | 'agent'
  | 'system'
  | 'compute'
  | 'network'
  | 'execute'
  | 'data'
  | 'collaboration'
  | 'mcp';

export interface ToolSideEffects {
  readsFiles: boolean;
  writesFiles: boolean;
  makesNetworkRequests: boolean;
  hasRateLimit: boolean;
  modifiesState: boolean;
  spawnsProcess: boolean;
  hasFinancialImpact: boolean;
}

export interface ToolConcurrencyMetadata {
  safe: boolean;
  safetyLevel: ToolSafetyLevel;
  category: ToolCategory;
  sideEffects: ToolSideEffects;
  maxConcurrent: number;
  conflictsWith?: string[];
}

export interface RegisteredTool {
  name: string;
  tool: StructuredToolInterface;
  description?: string;
  compactDescription?: string;
  concurrencySafe: boolean;
  concurrencyMetadata?: ToolConcurrencyMetadata;
  /** Custom result renderer for TUI display */
  renderResult?: (result: unknown) => string;
  /** Custom activity description shown while tool is running */
  renderActivity?: (input: Record<string, unknown>) => string;
}

/**
 * Metadata helper factories — shared across domain modules.
 */

export function financialReadMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'financial',
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

export function financialWriteMetadata(): ToolConcurrencyMetadata {
  return {
    safe: false,
    safetyLevel: 'warning',
    category: 'financial',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: true,
      hasRateLimit: true,
      modifiesState: true,
      spawnsProcess: false,
      hasFinancialImpact: true,
    },
    maxConcurrent: 1,
  };
}

export function fileWriteMetadata(): ToolConcurrencyMetadata {
  return {
    safe: false,
    safetyLevel: 'warning',
    category: 'filesystem',
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
  };
}

export function fileReadMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'filesystem',
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

export function computationMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
    category: 'compute',
    sideEffects: {
      readsFiles: false,
      writesFiles: false,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: false,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: 5,
  };
}

export function memoryMetadata(write: boolean): ToolConcurrencyMetadata {
  return {
    safe: !write,
    safetyLevel: write ? 'warning' : 'safe',
    category: 'memory',
    sideEffects: {
      readsFiles: true,
      writesFiles: write,
      makesNetworkRequests: false,
      hasRateLimit: false,
      modifiesState: write,
      spawnsProcess: false,
      hasFinancialImpact: false,
    },
    maxConcurrent: write ? 1 : 5,
  };
}

export function networkMetadata(): ToolConcurrencyMetadata {
  return {
    safe: true,
    safetyLevel: 'safe',
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
    maxConcurrent: 5,
  };
}

export function systemMetadata(): ToolConcurrencyMetadata {
  return {
    safe: false,
    safetyLevel: 'warning',
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

// === Migrated from src/tools/types.ts ===

export interface ToolResult {
  data: unknown;
  sourceUrls?: string[];
}

export function formatToolResult(data: unknown, sourceUrls?: string[]): string {
  const result: ToolResult = { data };
  if (sourceUrls?.length) {
    result.sourceUrls = sourceUrls;
  }
  return JSON.stringify(result);
}

export function parseSearchResults(result: unknown): { parsed: unknown; urls: string[] } {
  let parsed: unknown;
  if (typeof result === 'string') {
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = result;
    }
  } else {
    parsed = result;
  }
  const urls: string[] = [];
  function extractUrls(obj: unknown): void {
    if (!obj || typeof obj !== 'object') return;
    const o = obj as Record<string, unknown>;
    if (typeof o.url === 'string') urls.push(o.url);
    if (Array.isArray(o.results)) {
      for (const r of o.results) extractUrls(r);
    }
  }
  extractUrls(parsed);
  return { parsed, urls };
}

// Portfolio/Benchmark types
export interface Portfolio {
  id: string;
  name: string;
  positions: Array<{ symbol: string; shares: number; costBasis: number }>;
  createdAt: number;
  updatedAt: number;
}

export interface Benchmark {
  symbol: string;
  name: string;
  returnPct: number;
  startDate: string;
  endDate: string;
}

// Override Portfolio/Benchmark to be more permissive for test data
// TODO: reconcile with actual usage
export type PortfolioLike = {
  id?: string;
  name?: string;
  positions?: Array<{ symbol: string; shares: number; costBasis: number }>;
  totalReturn?: number;
  holdings?: Array<{ return: number; sector: string; weight: number }>;
  createdAt?: number;
  updatedAt?: number;
  [key: string]: unknown;
};
export type BenchmarkLike = {
  symbol?: string;
  name?: string;
  returnPct?: number;
  startDate?: string;
  endDate?: string;
  totalReturn?: number;
  holdings?: Array<{ return: number; sector: string; weight: number }>;
  [key: string]: unknown;
};
