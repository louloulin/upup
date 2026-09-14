/**
 * Telemetry integration helpers.
 *
 * These functions are designed to be called from the agent loop,
 * feature-gates, and other hot paths. They are **safe-by-default**:
 *   - Never throw (wrap in try/catch — telemetry must not crash host)
 *   - Never block (recorder is async / no-op when disabled)
 *   - Cheap when disabled (one boolean check + return)
 *
 * The intent is for the host code to call these unconditionally and
 * let the recorder's `enabled` flag decide whether to actually emit.
 */
import { telemetry, hashTelemetryInput, type TelemetryRecorder } from './index.js';
import type { UpUpAgentEvent } from '@upup/pi-runtime';

type CanonicalToolEndEvent = Extract<UpUpAgentEvent, { type: 'tool_end' }>;

export interface ToolTelemetryContext {
  input?: unknown;
  result?: unknown;
  durationMs?: number;
}

/** Approximate byte size of an arbitrary value. */
function byteSize(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'string') return value.length;
  if (value instanceof Uint8Array) return value.byteLength;
  if (typeof value === 'object' && value !== null && 'byteLength' in value && typeof (value as { byteLength: unknown }).byteLength === 'number') {
    return (value as { byteLength: number }).byteLength;
  }
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
}

/** Record a successful tool call. Safe to call from hot paths. */
export function recordToolCallOk(event: CanonicalToolEndEvent, context: ToolTelemetryContext = {}): void {
  try {
    telemetry.recordToolCall({
      tool: event.toolName,
      inputHash: hashTelemetryInput(context.input ?? {}),
      outputBytes: byteSize(context.result),
      durationMs: context.durationMs ?? 0,
      ok: true,
    });
  } catch {
    // telemetry must never crash the host
  }
}

/**
 * Record a failed tool call. The caller passes the start time so we can
 * compute the duration (ToolErrorEvent does not carry it).
 */
export function recordToolCallErr(event: CanonicalToolEndEvent, startedAt: number | null): void {
  try {
    const durationMs = startedAt !== null ? Date.now() - startedAt : 0;
    telemetry.recordToolCall({
      tool: event.toolName,
      inputHash: '', // args not present on ToolErrorEvent
      outputBytes: 0,
      durationMs,
      ok: false,
      errorCode: classifyErrorCode(event.error ?? ''),
    });
  } catch {
    // telemetry must never crash the host
  }
}

/** Record a feature gate check outcome. */
export function recordFeatureGate(
  feature: string,
  value: boolean,
  source: 'compile' | 'env' | 'growthbook' | 'default',
): void {
  try {
    telemetry.recordFeatureGate({ feature, value, source });
  } catch {
    // never throw
  }
}

/** Record a generic latency event. */
export function recordLatency(
  op: string,
  durationMs: number,
  metadata?: Record<string, unknown>,
): void {
  try {
    telemetry.recordLatency({ op, durationMs, metadata });
  } catch {
    // never throw
  }
}

/**
 * Heuristic classifier: pull a short error code from the error string.
 * Falls back to 'unknown' for anything we cannot identify.
 */
function classifyErrorCode(error: string): string {
  if (!error) return 'unknown';
  const head = error.split(/[\s:]/, 2)[0]?.toLowerCase() ?? 'unknown';
  if (head.length === 0 || head.length > 32) return 'unknown';
  return head;
}

/** Bind a recorder explicitly (for tests / non-default sinks). */
export function bindRecorder(rec: TelemetryRecorder): void {
  (telemetry as unknown as { _enabled?: boolean })._enabled = rec.isEnabled();
}
