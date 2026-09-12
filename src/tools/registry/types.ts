/**
 * Shared types for tool registry modules.
 */

import type { PiTool } from '../../runtime/pi/tool.js';

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
  tool: PiTool;
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
