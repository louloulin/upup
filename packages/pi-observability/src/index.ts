/**
 * Telemetry — public API surface.
 *
 * Default recorder is module-scoped and reads `UPUP_TELEMETRY` env var.
 * Tests construct their own recorder via `new TelemetryRecorder(...)`.
 */
import { TelemetryRecorder, telemetry } from './recorder';

export { anonymizeStack, anonymizeText, anonymizeValue } from './anonymizer';
export { TelemetrySink, type SinkConfig } from './sink';
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
} from './types';
export {
  type RecorderOptions,
  TelemetryRecorder,
  telemetry,
  buildErrorPayload,
  hashTelemetryInput,
} from './recorder';
export {
  createHostRequestGate,
  hostGateFor,
  HostThrottleError,
  isHostThrottleError,
  isSocketResetError,
  resetHostGates,
  DEFAULT_HOST_COOLDOWN_MS,
  DEFAULT_HOST_MIN_INTERVAL_MS,
  DEFAULT_HOST_RESETS_BEFORE_COOLDOWN,
  type HostRequestGate,
  type HostRequestGateOptions,
} from './host-request-gate';
export {
  classifyProviderError,
  executeWithProviderRetry,
  type ProviderRetryError,
  type ProviderRetryPolicy,
  type ProviderRetryResult,
} from './provider-retry';
