/**
 * Settings-watcher for `<agentDir>/settings.json` mutation (Phase 0.1c).
 *
 * Two reasons to watch the file:
 *   1. `upup plugin install/uninstall/update` runs through `DefaultPackageManager`,
 *      which persists changes into `<agentDir>/settings.json` (the canonical Pi
 *      packages file). These lifecycle commands already call
 *      `DefaultResourceLoader.reload()` after they finish, so the watcher only
 *      needs to fire when the file is mutated **outside** of those commands
 *      (e.g. the user hand-edits `settings.json`, or a sibling process runs a
 *      `pi` CLI that touches the same file).
 *   2. The user toggles non-package settings (compaction, retry, theme,
 *      defaultProvider, defaultModel, defaultThinkingLevel) in the same file.
 *      Those should reach the running session on the next turn without a
 *      restart, but in this first slice we only fire the callback; the session
 *      decides how to react (refresh system prompt / tools, etc.).
 *
 * The watcher is debounced and never re-entrant: concurrent mutations collapse
 * into one callback. The callback receives the new packages array and the raw
 * settings object so the consumer can decide which signal they care about.
 *
 * The watcher keeps the agentDir / home / cwd / env inputs opaque so it works
 * equally in production (real `process.env`) and tests (test-only env).
 */

import { existsSync, readFileSync, statSync, watch as fsWatch } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';

export interface SettingsWatcherOptions {
  /** Absolute path to the agent directory (`~/.upup/agent` in production). */
  readonly agentDir: string;
  /** Debounce window — collapse writes that land inside it. */
  readonly debounceMs?: number;
  /** Stop the watcher after this many events. Tests use this; production omits. */
  readonly maxEvents?: number;
  /** Polling fallback for environments where `fs.watch` is unreliable. */
  readonly pollMs?: number;
  /** Caller-supplied env (defaults to `process.env` for tests). */
  readonly env?: NodeJS.ProcessEnv;
}

export interface SettingsWatcherEvent {
  /** Absolute path of the settings.json that changed. */
  readonly settingsPath: string;
  /** Parsed `packages` array (best-effort; empty array if parsing failed). */
  readonly packages: readonly unknown[];
  /** Parsed full settings object (best-effort; `{}` if parsing failed). */
  readonly settings: Readonly<Record<string, unknown>>;
}

export interface SettingsWatcherHandle {
  /** Stop emitting events and release OS handles. Idempotent. */
  readonly close: () => void;
  /** Path of the settings file being watched (for tests + diagnostics). */
  readonly settingsPath: string;
}

const DEFAULT_DEBOUNCE_MS = 150;
const DEFAULT_POLL_MS = 750;

function settingsPathFor(agentDir: string): string {
  return join(resolvePath(agentDir), 'settings.json');
}

function readSettings(path: string): SettingsWatcherEvent {
  if (!existsSync(path)) {
    return { settingsPath: path, packages: [], settings: {} };
  }
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { settingsPath: path, packages: [], settings: {} };
  }
  if (raw.trim() === '') {
    return { settingsPath: path, packages: [], settings: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { settingsPath: path, packages: [], settings: {} };
  }
  const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const pkgs = Array.isArray(obj.packages) ? obj.packages : [];
  return { settingsPath: path, packages: pkgs, settings: Object.freeze({ ...obj }) };
}

/**
 * Watch `<agentDir>/settings.json` and emit a `SettingsWatcherEvent` after
 * every mutation. The watcher survives missing files (created later) and
 * dangling files (deleted and re-created). Returns a handle whose `close()`
 * method tears down both the FS watcher and the poll fallback.
 */
export function startAgentDirWatcher(
  options: SettingsWatcherOptions,
  onEvent: (event: SettingsWatcherEvent) => void,
): SettingsWatcherHandle {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const settingsPath = settingsPathFor(options.agentDir);
  let closed = false;
  let pendingTimer: ReturnType<typeof setTimeout> | undefined;
  let eventsEmitted = 0;
  let lastSignature = '';
  const seenSignatures = new Set<string>();
  seenSignatures.add(signatureFor(settingsPath));

  const emit = (): void => {
    if (closed) return;
    const next = readSettings(settingsPath);
    const signature = `${next.packages.length}|${stableStringify(next.settings)}`;
    if (signature === lastSignature) return;
    if (seenSignatures.has(signature)) {
      lastSignature = signature;
      return;
    }
    seenSignatures.add(signature);
    lastSignature = signature;
    eventsEmitted += 1;
    onEvent(next);
    if (options.maxEvents !== undefined && eventsEmitted >= options.maxEvents) {
      // Stop on the configured budget so tests can drive bounded cycles.
      setImmediate(() => handle.close());
    }
  };

  // Prime the watcher: if `settings.json` already exists with content when the
  // watcher starts, emit the initial snapshot so callers don't have to wait for
  // a future mutation to learn the current state. Skipped silently when the
  // file is missing or empty.
  if (existsSync(settingsPath) && readSettings(settingsPath).packages.length > 0) {
    setImmediate(() => {
      if (!closed) emit();
    });
  }

  const scheduleEmit = (): void => {
    if (closed) return;
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = undefined;
      emit();
    }, debounceMs);
  };

  ensureParentDir(settingsPath);

  let fsWatcher: ReturnType<typeof fsWatch> | undefined;
  try {
    fsWatcher = fsWatch(settingsPath, { persistent: false }, () => scheduleEmit());
    fsWatcher.on('error', () => scheduleEmit());
  } catch {
    fsWatcher = undefined;
  }

  // Poll fallback for filesystems where fs.watch is unreliable (some
  // network mounts, some sandboxed environments). Cheap mtime check.
  const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
  let lastMtime = safeMtime(settingsPath);
  const pollTimer = setInterval(() => {
    if (closed) return;
    const nextMtime = safeMtime(settingsPath);
    if (nextMtime !== lastMtime) {
      lastMtime = nextMtime;
      scheduleEmit();
    }
  }, pollMs);
  if (typeof pollTimer.unref === 'function') pollTimer.unref();

  const handle: SettingsWatcherHandle = {
    settingsPath,
    close(): void {
      if (closed) return;
      closed = true;
      if (pendingTimer) {
        clearTimeout(pendingTimer);
        pendingTimer = undefined;
      }
      clearInterval(pollTimer);
      try {
        fsWatcher?.close();
      } catch {
        /* ignore */
      }
    },
  };

  return handle;
}

function ensureParentDir(path: string): void {
  const parent = dirname(path);
  if (!existsSync(parent)) {
    // Do not auto-create agentDir here; resource-reload paths own that.
    // Watchers for non-existent parents just stay quiet until the file appears.
    return;
  }
}

function safeMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Stable signature for deduplication across re-reads of identical content. */
function signatureFor(path: string): string {
  return `${path}|${safeMtime(path)}`;
}
