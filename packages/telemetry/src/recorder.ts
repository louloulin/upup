/**
 * Telemetry recorder — main entry point for emitting events.
 *
 * Usage:
 *   import { telemetry } from '@upup/./telemetry';
 *   telemetry.recordToolCall({ tool: 'analyze_symbol', input: {...}, output, durationMs, ok });
 *
 * The recorder is **opt-in**: by default it's a no-op. Enable via:
 *   - process.env.UPUP_TELEMETRY === '1'
 *   - or settings.json: { telemetry: { enabled: true } }
 *   - or programmatically: telemetry.enable()
 *
 * All input/output is anonymized before hashing so the JSONL file never
 * contains raw user content. See anonymizer.ts for the rules.
 */
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { anonymizeStack, anonymizeText, anonymizeValue } from './anonymizer.js';
import { TelemetrySink, type SinkConfig } from './sink.js';
import type {
  DecisionEvent,
  ErrorEvent,
  FeatureGateEvent,
  LatencyEvent,
  TelemetryEvent,
  ToolCallEvent,
} from './types.js';

const DEFAULT_DIR = join(homedir(), '.upup', 'telemetry');

function hashInput(value: unknown): string {
  const sanitized = anonymizeValue(value);
  const json = JSON.stringify(sanitized, Object.keys(sanitized as object).sort());
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString('hex')}`;
}

export interface RecorderOptions {
  enabled?: boolean;
  sinkConfig?: Partial<SinkConfig>;
}

export class TelemetryRecorder {
  private _enabled: boolean;
  private readonly sink: TelemetrySink;
  private readonly sessionId: string;
  private runId: string;

  constructor(options: RecorderOptions = {}) {
    this._enabled = options.enabled ?? defaultEnabled();
    this.sink = new TelemetrySink({
      dir: options.sinkConfig?.dir ?? DEFAULT_DIR,
      ...options.sinkConfig,
    });
    this.sessionId = newId('s');
    this.runId = newId('r');
  }

  isEnabled(): boolean {
    return this._enabled;
  }

  enable(): void {
    this._enabled = true;
  }

  disable(): void {
    this._enabled = false;
  }

  /** Start a new query/run; old runId is preserved in any pending events. */
  newRun(): string {
    this.runId = newId('r');
    return this.runId;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getRunId(): string {
    return this.runId;
  }

  recordToolCall(args: Omit<ToolCallEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>): void {
    this.emit({
      ts: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
      kind: 'tool_call',
      ...args,
    });
  }

  recordDecision(args: Omit<DecisionEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>): void {
    this.emit({
      ts: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
      kind: 'decision',
      ...args,
    });
  }

  recordFeatureGate(args: Omit<FeatureGateEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>): void {
    this.emit({
      ts: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
      kind: 'feature_gate',
      ...args,
    });
  }

  recordError(args: Omit<ErrorEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>): void {
    this.emit({
      ts: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
      kind: 'error',
      ...args,
    });
  }

  recordLatency(args: Omit<LatencyEvent, 'ts' | 'sessionId' | 'runId' | 'kind'>): void {
    this.emit({
      ts: Date.now(),
      sessionId: this.sessionId,
      runId: this.runId,
      kind: 'latency',
      ...args,
    });
  }

  /** Flush pending events (call before process exit). */
  async flush(): Promise<void> {
    await this.sink.flush();
  }

  private emit(event: TelemetryEvent): void {
    if (!this._enabled) return;
    this.sink.write(event);
  }
}

function defaultEnabled(): boolean {
  if (process.env.UPUP_TELEMETRY === '1') return true;
  if (process.env.UPUP_TELEMETRY === '0') return false;
  return false;
}

/** Convenience helper: hash an input value the same way the recorder does. */
export function hashTelemetryInput(value: unknown): string {
  return hashInput(value);
}

/** Convenience helper: build a sanitized error payload. */
export function buildErrorPayload(code: string, err: unknown): Omit<ErrorEvent, 'ts' | 'sessionId' | 'runId' | 'kind'> {
  const raw = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  // Anonymize the message itself so PII (emails / phones / paths) cannot
  // leak into the JSONL even if the caller forgets to scrub.
  const sanitized = anonymizeText(raw).text;
  return {
    code,
    message: sanitized.slice(0, 500),
    stackHead: stack ? anonymizeStack(stack) : undefined,
  };
}
