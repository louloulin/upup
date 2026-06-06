/**
 * Telemetry Integration - re-exports and convenience functions
 */

export {
  TelemetryRecorder,
  hashTelemetryInput,
  buildErrorPayload,
  type RecorderOptions,
} from './recorder.js';

import { TelemetryRecorder, hashTelemetryInput } from './recorder.js';
import type { FeatureGateEvent, ToolCallEvent } from './types.js';

const _defaultRecorder = new TelemetryRecorder();

/**
 * Record a feature gate check.
 *
 * @param feature Feature name
 * @param value Whether the feature is enabled
 * @param source Where the value came from (compile/env/growthbook/default)
 */
export function recordFeatureGate(feature: string, value: boolean, source: FeatureGateEvent['source']): void {
  _defaultRecorder.recordFeatureGate({ feature, value, source });
}

/**
 * Record a successful tool call. Computes inputHash from the canonicalized input.
 */
export function recordToolCallOk(args: { tool: string; input: unknown; outputBytes: number; durationMs: number; timestamp: number }): void {
  _defaultRecorder.recordToolCall({
    tool: args.tool,
    inputHash: hashTelemetryInput(args.input),
    outputBytes: args.outputBytes,
    durationMs: args.durationMs,
    ok: true,
  });
}

/**
 * Record a failed tool call. Computes inputHash from the canonicalized input.
 */
export function recordToolCallErr(args: { tool: string; input: unknown; outputBytes: number; durationMs: number; timestamp: number; errorCode: string }): void {
  _defaultRecorder.recordToolCall({
    tool: args.tool,
    inputHash: hashTelemetryInput(args.input),
    outputBytes: args.outputBytes,
    durationMs: args.durationMs,
    ok: false,
    errorCode: args.errorCode,
  });
}

export type ToolCallRecord = ToolCallEvent;

export type TelemetryEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};
