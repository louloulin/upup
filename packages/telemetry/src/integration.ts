// @ts-nocheck - temporary during modularization migration
/**
 * Telemetry Integration - re-exports and convenience functions
 */

export {
  TelemetryRecorder,
  hashTelemetryInput,
  buildErrorPayload,
  type RecorderOptions,
} from './recorder.js';

import { TelemetryRecorder } from './recorder.js';

const _defaultRecorder = new TelemetryRecorder();

export function recordFeatureGate(args: { feature: string; value: boolean; source: string }): void {
  _defaultRecorder.recordFeatureGate(args);
}

export function recordToolCallOk(record: { tool: string; args: Record<string, unknown>; durationMs: number; timestamp: number }): void {
  _defaultRecorder.recordToolCall({ ...record, success: true });
}

export function recordToolCallErr(record: { tool: string; args: Record<string, unknown>; durationMs: number; timestamp: number; error: string }): void {
  _defaultRecorder.recordToolCall({ ...record, success: false });
}

export function recordEvent(event: { type: string; data: Record<string, unknown>; timestamp: number }): void {
  _defaultRecorder.recordEvent(event);
}

export type ToolCallRecord = {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
};

export type TelemetryEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};

export type FeatureGateEvent = {
  feature: string;
  value: boolean;
  source: string;
  ts: number;
  sessionId: string;
  runId: string;
  kind: 'feature_gate';
};
