/**
 * UpUp TypeScript Types
 *
 * Re-exports shared types from @upup/types and defines UpUp-specific types.
 */

import type { DisplayEvent, TokenUsage } from './agent/types.js';

// Re-export shared types from @upup/types
export type {
  AgentTool,
  ToolOptions,
  HookConfig,
  HookContext,
  HookResult,
  ProviderConfig,
  LlmOptions,
  LlmResponse,
  SessionConfig,
  Session,
  Message,
  MemoryEntry,
  SearchResult,
  SearchOptions,
  UpupError,
  PluginError,
  ToolError,
  ProviderError,
} from '@upup/types';

// ===== UpUp-specific Types =====

export type WorkingState =
  | { status: 'idle' }
  | { status: 'thinking' }
  | { status: 'tool'; toolName: string }
  | { status: 'approval'; toolName: string };

export type HistoryItemStatus = 'processing' | 'complete' | 'error' | 'interrupted';

export interface HistoryItem {
  id: string;
  query: string;
  events: DisplayEvent[];
  answer: string;
  status: HistoryItemStatus;
  activeToolId?: string;
  startTime?: number;
  duration?: number;
  tokenUsage?: TokenUsage;
  tokensPerSecond?: number;
}
