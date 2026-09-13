/**
 * Skill hot-reload (P1.7 — round 3)
 *
 * Watches all SKILL.md discovery directories and re-registers skills
 * when the underlying files change. The user no longer needs to
 * restart the CLI to pick up edits.
 *
 * Design choices:
 *
 *   1. fs.watch (not chokidar) — zero new dependencies.
 *   2. Debounce per file (200 ms) — editors usually write twice
 *      (truncate + append), so naive watches fire twice.
 *   3. Best-effort: a malformed SKILL.md after edit emits a warning
 *      and keeps the previous version registered. We never throw
 *      out of the watcher callback.
 *   4. Singleton (start/stop): the CLI process owns one watcher set;
 *      tests can spin up additional isolated instances via the
 *      factory `createSkillWatcher`.
 *
 * Reuses:
 *   - reRegisterSkill()  in src/skills/register.ts (does unregister+register)
 *   - extractSkillMetadata() in src/skills/loader.ts (parses frontmatter)
 *   - SKILL_DIRECTORIES   in src/skills/registry.ts (the list of dirs)
 */

import {
  watch,
  type FSWatcher,
  type Dirent,
  existsSync,
  readdirSync,
  statSync,
} from 'fs';
import { isAbsolute, join } from 'path';
import { readFileSync } from 'fs';
import matter from 'gray-matter';
import { info, warn } from '../utils/logging/logger.js';
import { reRegisterSkill, unregisterSkill } from './register.js';
import { getSkillCommandRegistry } from './slash-command.js';
import type { SkillSource, SkillMetadata as LoaderSkillMetadata } from './types.js';
import { getAllBundledSkills } from './registry.js';

// ============================================================================
// Types
// ============================================================================

export interface SkillReloadEvent {
  /** Name of the affected skill. */
  skillName: string;
  /** Path to the SKILL.md that changed. */
  path: string;
  /** What happened. */
  kind: 'reloaded' | 'unregistered' | 'parse-error';
  /** Optional human-readable note (e.g. parse error message). */
  message?: string;
}

export type SkillReloadListener = (e: SkillReloadEvent) => void;

export interface SkillWatcher {
  /** Stop watching and release all FSWatchers. */
  stop(): void;
  /** Subscribe to reload events. */
  onReload(listener: SkillReloadListener): () => void;
  /** True while at least one FSWatcher is active. */
  readonly active: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const DEBOUNCE_MS = 200;
const SKILL_FILENAME = 'SKILL.md';

// ============================================================================
// Implementation
// ============================================================================

/**
 * Parse just the frontmatter `name` from a SKILL.md so we can identify
 * which skill to (un)register without depending on the full loader.
 */
function readSkillName(skillFilePath: string): string | null {
  try {
    const raw = readFileSync(skillFilePath, 'utf-8');
    const parsed = matter(raw);
    const name = parsed.data?.name;
    if (typeof name === 'string' && name.length > 0) return name;
    return null;
  } catch {
    return null;
  }
}

/**
 * Build a SkillMetadata stub from a SKILL.md path using the loader.
 * We import lazily because the loader pulls in the full skill graph.
 */
async function reloadOneSkill(skillFilePath: string): Promise<LoaderSkillMetadata | null> {
  const { extractSkillMetadata, loadSkillFromPath } = await import('./loader.js');

  // Derive source from the path. Use a function to keep the union narrow.
  const source: SkillSource = (() => {
    if (skillFilePath.includes('/.upup/skills/')) return 'project';
    if (skillFilePath.includes('/.claude/skills/')) return 'user';
    if (skillFilePath.includes('/.agents/skills/')) return 'agent';
    return 'builtin';
  })();

  try {
    const meta = extractSkillMetadata(skillFilePath, source);
    const full = loadSkillFromPath(skillFilePath, source);
    // 'file-based' is the right tag for SKILL.md reloads (matches the
    // SkillRegistrationSource union in src/skills/register.ts)
    const regSource: 'builtin' | 'file-based' = source === 'builtin' ? 'builtin' : 'file-based';
    reRegisterSkill(full, regSource);
    // The registry's internal SkillMetadata requires snake_case
    // `user_invocable`; the loader's SkillMetadata is camelCase. Augment.
    return { ...meta, user_invocable: meta.userInvocable !== false } as LoaderSkillMetadata;
  } catch (e) {
    warn('default', `Failed to reload ${skillFilePath}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * Watch a single directory for SKILL.md changes. Returns a teardown
 * function. The watch is recursive so subdirectories are included.
 */
function watchDirectory(
  dir: string,
  reloadListener: SkillReloadListener,
): () => void {
  if (!existsSync(dir)) return () => {};

  // debounce per file
  const pending = new Map<string, NodeJS.Timeout>();

  const onChange = (filename: string | Buffer | null, baseDir = dir) => {
    const nameStr = filename ? filename.toString() : '';
    const fullPath = isAbsolute(nameStr) ? nameStr : join(baseDir, nameStr);
    if (!fullPath.endsWith(SKILL_FILENAME)) return;

    if (!existsSync(fullPath)) {
      // File deleted — try to find and unregister the skill
      const key = pending.get(fullPath);
      if (key) clearTimeout(key);
      pending.set(
        fullPath,
        setTimeout(async () => {
          pending.delete(fullPath);
          const registry = getSkillCommandRegistry();
          // We don't know the skill name without reading the file. Search
          // the registry for any skill whose path lives under our watched dir.
          const all = registry.getAllSkills();
          const match = all.find((s) => s.path === fullPath);
          if (match) {
            unregisterSkill(match.name);
            reloadListener({
              skillName: match.name,
              path: fullPath,
              kind: 'unregistered',
            });
            info('default', `Unregistered skill: ${match.name} (${fullPath})`);
          }
        }, DEBOUNCE_MS),
      );
      return;
    }

    // Debounce: reset the timer on each event
    const existing = pending.get(fullPath);
    if (existing) clearTimeout(existing);
    pending.set(
      fullPath,
      setTimeout(async () => {
        pending.delete(fullPath);
        try {
          const meta = await reloadOneSkill(fullPath);
          if (meta) {
            reloadListener({
              skillName: meta.name,
              path: fullPath,
              kind: 'reloaded',
            });
            info('default', `Reloaded skill: ${meta.name} (${fullPath})`);
          } else {
            const name = readSkillName(fullPath) ?? '?';
            reloadListener({
              skillName: name,
              path: fullPath,
              kind: 'parse-error',
              message: 'extractSkillMetadata returned null',
            });
          }
        } catch (e) {
          const name = readSkillName(fullPath) ?? '?';
          reloadListener({
            skillName: name,
            path: fullPath,
            kind: 'parse-error',
            message: (e as Error).message,
          });
        }
      }, DEBOUNCE_MS),
    );
  };

  const watchers = new Map<string, FSWatcher>();
  let pollTimer: NodeJS.Timeout | undefined;
  const watchOneDirectory = (directory: string): void => {
    if (watchers.has(directory) || !existsSync(directory)) return;
    let directoryWatcher: FSWatcher;
    try {
      directoryWatcher = watch(directory, {}, (_event, filename) => {
        onChange(filename, directory);
        scanDirectories();
      });
      watchers.set(directory, directoryWatcher);
    } catch {
      return;
    }
  };
  const scanDirectories = (): void => {
    watchOneDirectory(dir);
    const pendingDirectories = [dir];
    while (pendingDirectories.length > 0) {
      const current = pendingDirectories.pop()!;
      let entries: Dirent[];
      try {
        entries = readdirSync(current, { withFileTypes: true }) as unknown as Dirent[];
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const child = join(current, entry.name);
          watchOneDirectory(child);
          pendingDirectories.push(child);
        }
      }
    }
  };

  let recursiveWatcher: FSWatcher | undefined;
  const snapshot = new Map<string, string>();
  const collectSkillFiles = (): Map<string, string> => {
    const current = new Map<string, string>();
    const directories = [dir];
    while (directories.length > 0) {
      const currentDirectory = directories.pop()!;
      let entries: Dirent[];
      try {
        entries = readdirSync(currentDirectory, { withFileTypes: true }) as unknown as Dirent[];
      } catch {
        continue;
      }
      for (const entry of entries) {
        const entryPath = join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
          directories.push(entryPath);
        } else if (entry.name === SKILL_FILENAME) {
          try {
            const stats = statSync(entryPath);
            current.set(entryPath, `${stats.mtimeMs}:${stats.size}`);
          } catch {
            // The file may disappear between directory and stat calls.
          }
        }
      }
    }
    return current;
  };

  const pollSkillFiles = (): void => {
    const current = collectSkillFiles();
    for (const [path, signature] of current) {
      if (snapshot.get(path) !== signature) onChange(path);
    }
    for (const path of snapshot.keys()) {
      if (!current.has(path)) onChange(path);
    }
    snapshot.clear();
    for (const [path, signature] of current) snapshot.set(path, signature);
  };

  for (const [path, signature] of collectSkillFiles()) snapshot.set(path, signature);
  pollTimer = setInterval(pollSkillFiles, 100);

  try {
    recursiveWatcher = watch(dir, { recursive: true }, (_event, filename) => onChange(filename));
    watchers.set(dir, recursiveWatcher);
  } catch (e) {
    warn('default', `Recursive watch on ${dir} failed (${(e as Error).message}); using non-recursive fallback.`);
    scanDirectories();
  }

  return () => {
    for (const watcher of watchers.values()) {
      try {
        watcher.close();
      } catch {
        /* noop */
      }
    }
    watchers.clear();
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
    for (const t of pending.values()) clearTimeout(t);
    pending.clear();
  };
}

// ============================================================================
// Factory + Singleton
// ============================================================================

/**
 * Build an isolated SkillWatcher (for tests). The caller is responsible
 * for calling `stop()` when done.
 */
export function createSkillWatcher(opts: {
  dirs?: string[];
  listener?: SkillReloadListener;
} = {}): SkillWatcher {
  const teardowns: Array<() => void> = [];
  const listeners = new Set<SkillReloadListener>();
  if (opts.listener) listeners.add(opts.listener);

  const fire = (e: SkillReloadEvent) => {
    for (const l of listeners) {
      try {
        l(e);
      } catch (err) {
        warn('default', `Listener threw: ${(err as Error).message}`);
      }
    }
  };

  const dirs = opts.dirs ?? defaultWatchDirs();
  for (const d of dirs) {
    teardowns.push(watchDirectory(d, fire));
  }

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      for (const t of teardowns) t();
      listeners.clear();
    },
    onReload(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get active() {
      return !stopped && teardowns.length > 0;
    },
  };
}

/**
 * Default set of directories to watch. Mirrors SKILL_DIRECTORIES from
 * src/skills/registry.ts, but the registry's constants are private to
 * the module. We rebuild the same list here; if the registry's list
 * changes, update this too.
 */
function defaultWatchDirs(): string[] {
  // User's project + home
  return [
    join(process.cwd(), '.claude', 'skills'),
    join(process.cwd(), '.upup', 'skills'),
    join(process.env['HOME'] ?? '', '.agents', 'skills'),
  ];
}

let singleton: SkillWatcher | null = null;

/**
 * Start (or get) the process-wide skill watcher. Idempotent — calling
 * this twice returns the same instance.
 */
export function startSkillWatcher(): SkillWatcher {
  if (singleton) return singleton;
  singleton = createSkillWatcher();
  return singleton;
}

/**
 * Stop the process-wide watcher. Safe to call even if it was never
 * started.
 */
export function stopSkillWatcher(): void {
  if (singleton) {
    singleton.stop();
    singleton = null;
  }
}
