/**
 * Telemetry — public API surface.
 *
 * Default recorder is module-scoped and reads `UPUP_TELEMETRY` env var.
 * Tests construct their own recorder via `new TelemetryRecorder(...)`.
 */
import { TelemetryRecorder, telemetry } from './recorder.js';

export { anonymizeStack, anonymizeText, anonymizeValue } from './anonymizer.js';
export { TelemetrySink, type SinkConfig } from './sink.js';
export {
  type DecisionEvent,
  type ErrorEvent,
  type FeatureGateEvent,
  type LatencyEvent,
  type ProviderRetryEvent,
  type TelemetryEvent,
  type TelemetryEventKind,
  type ToolCallEvent,
  TELEMETRY_EVENT_KINDS,
  isTelemetryEventKind,
} from './types.js';
export {
  type RecorderOptions,
  TelemetryRecorder,
  telemetry,
  buildErrorPayload,
  hashTelemetryInput,
} from './recorder.js';
export {
  classifyProviderError,
  executeWithProviderRetry,
  type ProviderRetryError,
  type ProviderRetryPolicy,
  type ProviderRetryResult,
} from './provider-retry.js';
