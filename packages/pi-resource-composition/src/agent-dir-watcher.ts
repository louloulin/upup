/**
 * High-level watcher: combines `resolveAgentDir` + `startAgentDirWatcher` into
 * one call so long-running surfaces (TUI / CLI / daemon) don't have to repeat
 * the resolution and re-implement the watcher lifecycle.
 *
 * On every settings.json mutation the callback receives a reload trigger
 * `{ agentDir, source: 'agentDir-watcher' }`. The callback decides what to do
 * (refresh UI, call host.reload, etc.). Returns a handle whose `close()`
 * tears down the FS watcher and the poll fallback.
 *
 * `agentDir` always matches `resolveAgentDir(cwd)` when `home` is omitted, so
 * the watched file is the same one the running Pi session reads.
 */

import { startAgentDirWatcher, type SettingsWatcherHandle } from './package-reloader';
import { resolveAgentDir } from './agent-dir';

export interface WatchAgentDirOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  home?: string;
  debounceMs?: number;
  pollMs?: number;
}

export interface AgentDirReloadTrigger {
  agentDir: string;
  source: 'agentDir-watcher';
}

export type AgentDirReloadCallback = (trigger: AgentDirReloadTrigger) => void | Promise<void>;

export interface WatchAgentDirHandle {
  agentDir: string;
  close(): void;
}

export function watchAgentDirForChanges(
  options: WatchAgentDirOptions,
  onChange: AgentDirReloadCallback,
): WatchAgentDirHandle {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  // An omitted (or blank) `home` must fall through to the same resolution the
  // session factory uses. Defaulting to `''` silently disabled home lookup —
  // `resolveAgentDir`'s `options.home ?? osHomedir()` treats `''` as a value —
  // so the watcher ended up watching `<cwd>/settings.json` while the running
  // session read `~/.pi/agent/settings.json`: `upup plugin install` never
  // surfaced its reload hint, and an unrelated repo-root settings.json did.
  const home = options.home?.trim() ? options.home : undefined;
  const resolved = resolveAgentDir(cwd, home ? { env, home } : { env });
  const handle = startAgentDirWatcher(
    {
      agentDir: resolved.agentDir,
      ...(options.debounceMs !== undefined ? { debounceMs: options.debounceMs } : {}),
      ...(options.pollMs !== undefined ? { pollMs: options.pollMs } : {}),
    },
    async () => {
      try {
        await onChange({ agentDir: resolved.agentDir, source: 'agentDir-watcher' });
      } catch {
        // Watcher callbacks must never throw — the watcher loop would break.
        // We intentionally swallow here; the caller should surface failures
        // through their own UI / log channel.
      }
    },
  );
  return {
    agentDir: resolved.agentDir,
    close: () => handle.close(),
  };
}
