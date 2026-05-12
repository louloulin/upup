/**
 * Types for @upup/adapter-paperclip
 */

import type {
  AdapterAgent,
  AdapterRuntime,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentCheck,
  AdapterSessionCodec,
  AdapterModel,
} from '@paperclipai/adapter-utils';

// Re-export from adapter-utils for convenience
export type {
  AdapterAgent,
  AdapterRuntime,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentCheck,
  AdapterSessionCodec,
  AdapterModel,
};
export type AdapterEnvironmentTestResult = AdapterEnvironmentCheck[];

// UpUp-specific adapter config
export interface UpupAdapterConfig {
  // Model configuration
  model?: string;
  provider?: string;

  // Execution configuration
  timeoutSec?: number;
  maxIterations?: number;

  // Session configuration
  persistSession?: boolean;
  sessionId?: string;

  // Working directory
  cwd?: string;

  // Tool configuration
  enabledTools?: string[];
  disabledTools?: string[];

  // Prompt template override
  promptTemplate?: string;

  // Additional environment variables
  env?: Record<string, string>;

  // Paperclip API URL
  paperclipApiUrl?: string;
}

// Session params stored for cross-heartbeat persistence
export interface UpupSessionParams {
  sessionId: string;
  model: string;
  provider: string;
  cwd: string;
  historyCount?: number;
}

// ACPX-style log entry for streaming
export interface AcpxTextDelta {
  type: 'acpx.text_delta';
  text: string;
  channel: 'output' | 'thought';
  tag?: string;
}

export interface AcpxToolCall {
  type: 'acpx.tool_call';
  name: string;
  toolCallId?: string;
  status: 'pending' | 'completed' | 'error';
  text?: string;
  tag?: string;
}

export interface AcpxStatus {
  type: 'acpx.status';
  text: string;
  tag?: string;
  used?: number;
  size?: number;
}

export interface AcpxResult {
  type: 'acpx.result';
  summary: string;
  stopReason?: string;
}

export interface AcpxError {
  type: 'acpx.error';
  message: string;
  code: string;
  retryable?: boolean;
}

export type AcpxLogEntry =
  | AcpxTextDelta
  | AcpxToolCall
  | AcpxStatus
  | AcpxResult
  | AcpxError;

// Build session params helper
export function buildSessionParams(input: {
  sessionId: string;
  model: string;
  provider: string;
  cwd: string;
  historyCount?: number;
}): Record<string, unknown> {
  return {
    sessionId: input.sessionId,
    model: input.model,
    provider: input.provider,
    cwd: input.cwd,
    historyCount: input.historyCount ?? 0,
  };
}
