/**
 * Append-only JSONL audit sink for the UpUp Pi event surface.
 *
 * Why a file sink instead of in-memory counters: a financial research session
 * has to be *auditable after the fact* — which model answered, how many tokens
 * the provider billed, which tool failed, when the context was compacted, and
 * what the user typed before that. The trail is written as one JSON object per
 * line so `jq`/`grep` can slice it without loading the whole file.
 *
 * Contract:
 *   - Opt-in, mirroring `@upup/pi-observability`: only when `UPUP_TELEMETRY=1`
 *     (or `options.enabled`), so the default install writes nothing.
 *   - Honors `$UPUP_HOME` (falls back to `~/.upup`), so sandboxed/CI runs stay
 *     inside their own home.
 *   - Never throws: a broken disk must not break a research run.
 *   - Never records model or user text. Callers pass counts, ids, statuses.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { PiEventAuditRecord } from './event-surface';

/** Environment variable that relocates the UpUp home root. */
const UPUP_HOME_ENV = 'UPUP_HOME';
/** Opt-in flag, same contract as the telemetry recorder. */
const TELEMETRY_ENV = 'UPUP_TELEMETRY';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

/** Resolve the audit trail path: `$UPUP_HOME/telemetry/pi-events.jsonl`. */
export function eventAuditPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.UPUP_PI_EVENT_AUDIT_PATH?.trim();
  if (override) return resolve(override);
  const root = env[UPUP_HOME_ENV]?.trim() || join(env.HOME || homedir(), '.upup');
  return join(resolve(root), 'telemetry', 'pi-events.jsonl');
}

/** True when the audit trail is enabled for this process. */
export function isEventAuditEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const explicit = env.UPUP_PI_EVENT_AUDIT?.trim();
  if (explicit === '0' || explicit === 'false') return false;
  if (explicit === '1' || explicit === 'true') return true;
  return env[TELEMETRY_ENV] === '1';
}

/**
 * One audit line. Key order is stable and `fields` is last so the readable
 * prefix of every line stays greppable.
 */
export function formatEventAuditLine(record: PiEventAuditRecord): string {
  return `${JSON.stringify({
    ts: new Date(record.at).toISOString(),
    event: record.event,
    role: record.role,
    outcome: record.outcome,
    ...(record.sessionId ? { sessionId: record.sessionId } : {}),
    ...(record.durationMs !== undefined ? { durationMs: record.durationMs } : {}),
    ...(record.errorMessage ? { error: record.errorMessage } : {}),
    ...(record.fields ? { fields: record.fields } : {}),
  })}\n`;
}

export interface EventAuditSinkOptions {
  readonly path?: string;
  readonly enabled?: boolean;
  readonly maxBytes?: number;
  /** Injectable writer (tests). Defaults to a best-effort synchronous append. */
  readonly write?: (path: string, line: string) => void;
}

export interface EventAuditSink {
  readonly path: string;
  readonly enabled: boolean;
  /** Record one event. No-op when disabled; swallows I/O errors by design. */
  readonly record: (record: PiEventAuditRecord) => void;
  /** Number of lines written by this sink instance. */
  readonly written: () => number;
  /** Flush hook — the current implementation writes synchronously. */
  readonly flush: () => void;
}

/**
 * Create the JSONL sink. Rotation keeps one generation (`<path>.1`) so a long
 * running daemon cannot fill the disk.
 */
export function createEventAuditSink(options: EventAuditSinkOptions = {}): EventAuditSink {
  const path = options.path ?? eventAuditPath();
  const enabled = options.enabled ?? isEventAuditEnabled();
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const write = options.write ?? defaultWrite;
  let written = 0;
  let prepared = false;

  const prepare = (): void => {
    if (prepared) return;
    prepared = true;
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // fall through: the append below fails closed
    }
    try {
      if (maxBytes > 0 && existsSync(path) && statSync(path).size >= maxBytes) {
        renameSync(path, `${path}.1`);
      }
    } catch {
      // A failed rotation must not stop the trail.
    }
  };

  return {
    path,
    enabled,
    written: () => written,
    record: (record: PiEventAuditRecord): void => {
      if (!enabled) return;
      prepare();
      try {
        write(path, formatEventAuditLine(record));
        written += 1;
      } catch {
        // Auditing is best-effort: never break the session for a disk error.
      }
    },
    flush: () => {
      // Synchronous appends: nothing buffered.
    },
  };
}

function defaultWrite(path: string, line: string): void {
  appendFileSync(path, line, 'utf-8');
}
