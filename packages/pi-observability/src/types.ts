/**
 * Telemetry event types.
 *
 * 5 kinds of events, all extending the base TelemetryEvent:
 *   - tool_call      : LLM 调用某个工具 (input hash, output size, duration, ok)
 *   - decision       : Agent 决策 (buy/sell/hold/analyze),confidence + rationale hash
 *   - feature_gate   : Feature gate 查询 (feature, value, source)
 *   - error          : 错误 (code, sanitized message, stack head)
 *   - latency        : 通用延迟 (op, durationMs, optional metadata)
 *
 * 设计原则:
 *   - 绝不写用户 prompt / 原始内容;只写 hash + size
 *   - 错误 message 走 anonymizer 脱敏
 *   - sessionId 用 hash,不存 raw session
 *   - 全部 unix-ms timestamp,不要 ISO string (省 parse)
 */
export type TaskKindFallback = string;

export const TELEMETRY_EVENT_KINDS = [
  'tool_call',
  'decision',
  'feature_gate',
  'error',
  'latency',
] as const;

export type TelemetryEventKind = (typeof TELEMETRY_EVENT_KINDS)[number];

interface EventBase {
  /** epoch ms (unix timestamp). */
  ts: number;
  /** Opaque session id (hash, not raw). */
  sessionId: string;
  /** Per-query run id (multiple runs per session). */
  runId: string;
  /** Discriminator. */
  kind: TelemetryEventKind;
}

export interface ToolCallEvent extends EventBase {
  kind: 'tool_call';
  tool: string;
  /** sha256 hex of canonical JSON of input. */
  inputHash: string;
  /** Output byte size. */
  outputBytes: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
}

export interface DecisionEvent extends EventBase {
  kind: 'decision';
  decision: 'buy' | 'sell' | 'hold' | 'analyze' | 'skip' | 'observe' | string;
  /** Target symbol or "" if N/A. */
  target: string;
  /** 0.0 - 1.0, model confidence in the decision. */
  confidence: number;
  /** sha256 hex of the LLM rationale. */
  rationaleHash: string;
  /** Optional: which task/runtime kind produced the decision. */
  source?: TaskKindFallback;
}

export interface FeatureGateEvent extends EventBase {
  kind: 'feature_gate';
  feature: string;
  value: boolean;
  source: 'compile' | 'env' | 'growthbook' | 'default';
}

export interface ErrorEvent extends EventBase {
  kind: 'error';
  code: string;
  /** Already-anonymized message. */
  message: string;
  /** First 3 stack lines (sanitized). */
  stackHead?: string;
}

export interface LatencyEvent extends EventBase {
  kind: 'latency';
  op: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export type TelemetryEvent =
  | ToolCallEvent
  | DecisionEvent
  | FeatureGateEvent
  | ErrorEvent
  | LatencyEvent;

export function isTelemetryEventKind(s: string): s is TelemetryEventKind {
  return (TELEMETRY_EVENT_KINDS as readonly string[]).includes(s);
}
