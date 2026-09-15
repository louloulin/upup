/**
 * JSONL sink for telemetry events.
 *
 * - One file per UTC day: `<dir>/events-YYYY-MM-DD.jsonl`
 * - Append-only with debounced flush (every 500ms or 50 events)
 * - On startup: prune files older than 7 days
 * - On per-file size cap (>100MB): rotate within same day via `.N` suffix
 * - Thread-safe-ish: all writes serialized through a write queue
 *
 * The sink is intentionally fire-and-forget: callers can `write()` without
 * awaiting. The flush happens on a timer + on every Nth event. If the
 * process crashes before the next flush, up to ~500ms of events are lost —
 * acceptable for telemetry.
 */
import { mkdir, readdir, rm, stat, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { TelemetryEvent } from './types';

export interface SinkConfig {
  /** Directory to write JSONL files into. */
  dir: string;
  /** Flush after this many events. */
  flushEveryNEvents?: number;
  /** Flush after this many ms even if buffer not full. */
  flushEveryMs?: number;
  /** Per-file size cap (bytes). 0 = no cap. Default 100MB. */
  maxFileBytes?: number;
  /** Delete files older than this many days. Default 7. */
  retentionDays?: number;
}

const DEFAULT_FLUSH_N = 50;
const DEFAULT_FLUSH_MS = 500;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_RETENTION_DAYS = 7;

function dateStamp(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class TelemetrySink {
  private readonly dir: string;
  private readonly flushEveryNEvents: number;
  private readonly flushEveryMs: number;
  private readonly maxFileBytes: number;
  private readonly retentionDays: number;

  private buffer: string[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private writesSinceFlush = 0;
  private currentDayStamp: string | null = null;
  private currentSuffix = 0;
  private currentFileSize = 0;
  private initialized = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(config: SinkConfig) {
    this.dir = config.dir;
    this.flushEveryNEvents = config.flushEveryNEvents ?? DEFAULT_FLUSH_N;
    this.flushEveryMs = config.flushEveryMs ?? DEFAULT_FLUSH_MS;
    this.maxFileBytes = config.maxFileBytes ?? DEFAULT_MAX_BYTES;
    this.retentionDays = config.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  /** Write an event to the buffer; flush triggers on N/timer. */
  write(event: TelemetryEvent): void {
    this.buffer.push(JSON.stringify(event));
    this.writesSinceFlush++;
    if (this.writesSinceFlush >= this.flushEveryNEvents) {
      void this.flush();
    } else if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, this.flushEveryMs);
    }
  }

  /** Force flush all buffered events. */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.buffer.length > 0) {
      const chunk = this.buffer.join('\n') + '\n';
      this.buffer = [];
      this.writesSinceFlush = 0;
      // Chain writes to avoid interleaving across days / size rotations.
      this.writeQueue = this.writeQueue.then(() => this.doWrite(chunk));
    }
    // Always await the queue — even if buffer is empty, an earlier
    // write() may have already kicked off a flush that is still in
    // flight (e.g. when the write was triggered by the N-events
    // threshold rather than this explicit call).
    await this.writeQueue;
  }

  /** Prune files older than retentionDays. */
  async prune(): Promise<number> {
    if (!existsSync(this.dir)) return 0;
    const files = await readdir(this.dir).catch(() => [] as string[]);
    let removed = 0;
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    for (const f of files) {
      if (!f.startsWith('events-') || !f.endsWith('.jsonl')) continue;
      const p = join(this.dir, f);
      // retentionDays <= 0 means "no retention" — remove every event file.
      if (this.retentionDays <= 0) {
        try {
          await rm(p);
          removed++;
        } catch {
          // ignore — file may have been removed concurrently
        }
        continue;
      }
      try {
        const s = await stat(p);
        if (s.mtimeMs < cutoff) {
          await rm(p);
          removed++;
        }
      } catch {
        // ignore — file may have been removed concurrently
      }
    }
    return removed;
  }

  /** Initialize the directory and run an initial prune. */
  async init(): Promise<void> {
    if (this.initialized) return;
    await mkdir(this.dir, { recursive: true });
    await this.prune();
    this.initialized = true;
  }

  /** Test/inspection helper: current file path for the given day stamp. */
  currentFilePath(day: string, suffix = 0): string {
    if (suffix === 0) return join(this.dir, `events-${day}.jsonl`);
    return join(this.dir, `events-${day}.${suffix}.jsonl`);
  }

  private async doWrite(chunk: string): Promise<void> {
    if (!this.initialized) await this.init();
    const stamp = dateStamp(Date.now());
    if (this.currentDayStamp !== stamp) {
      this.currentDayStamp = stamp;
      this.currentSuffix = 0;
      this.currentFileSize = await this.safeSize(this.currentFilePath(stamp));
    }
    let path = this.currentFilePath(stamp, this.currentSuffix);
    if (this.maxFileBytes > 0 && this.currentFileSize + chunk.length > this.maxFileBytes) {
      this.currentSuffix++;
      this.currentFileSize = 0;
      path = this.currentFilePath(stamp, this.currentSuffix);
    }
    try {
      await appendFile(path, chunk, 'utf8');
      this.currentFileSize += chunk.length;
    } catch {
      // If write fails (disk full / permission), drop the chunk silently.
      // Telemetry should never crash the host app.
    }
  }

  private async safeSize(path: string): Promise<number> {
    try {
      return (await stat(path)).size;
    } catch {
      return 0;
    }
  }
}
