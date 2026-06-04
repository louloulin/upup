/**
 * Verification — real-deliverable checks for Coordinator Phase 4.
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/design.md (D3)
 *      + analysis-comprehensive.md (Sprint 2.1.6)
 *
 * The Coordinator spawns a Worker that returns a deliverable file path
 * (e.g. /reports/600519.SH.md). Verification is a series of independent
 * checks against that file:
 *
 *   1. file-exists      — does the path resolve to a readable file?
 *   2. file-readable    — non-empty UTF-8 content?
 *   3. {md,ts,json}-parse — extension-specific structural sanity
 *   4. tsc-noEmit       — for .ts/.tsx: bun x tsc --noEmit <file>
 *   5. bun-test         — for .ts/.tsx: bun test <sibling.test.ts>
 *                          (only if a sibling test file exists)
 *
 * All I/O is injectable (fileExists / readFile / runner / cwd /
 * resolveTestPath) so tests can run synchronously without touching disk
 * or spawning child processes.
 */

import { access, readFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

export interface VerificationCheck {
  /** Stable name of the check, used for assertions and reporting. */
  name:
    | 'file-exists'
    | 'file-readable'
    | 'md-structure'
    | 'ts-balance'
    | 'json-parse'
    | 'tsc-noEmit'
    | 'test-exists'
    | 'bun-test';
  ok: boolean;
  /** Human-readable notes; failure details on ok=false. */
  notes?: string;
  durationMs: number;
}

export interface VerificationOutcome {
  artifact: string;
  /** True iff every check passed. */
  ok: boolean;
  checks: VerificationCheck[];
  /** One-line summary suitable for task notes / bus payload. */
  notes: string;
  durationMs: number;
}

export interface VerificationRunner {
  /**
   * Spawn a child process and wait for it to exit. The implementation
   * is responsible for applying `timeoutMs` (kill the process on
   * timeout) and for collecting stdout/stderr.
   */
  run(
    cmd: string[],
    opts?: { cwd?: string; timeoutMs?: number },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface VerificationDeps {
  /** Path existence check. Default: node:fs/promises.access. */
  fileExists?: (path: string) => Promise<boolean>;
  /** Read a file as UTF-8. Default: node:fs/promises.readFile. */
  readFile?: (path: string) => Promise<string>;
  /** Subprocess runner. Default: Bun.spawn wrapper. */
  runner?: VerificationRunner;
  /** cwd for subprocesses. Default: process.cwd(). */
  cwd?: string;
  /** Per-check timeout in ms (passed to the runner). Default 10_000. */
  checkTimeoutMs?: number;
  /** Clock. Default: Date.now. */
  now?: () => number;
  /**
   * Test-file path resolver. Given an artifact, return the test file
   * path to run (or null to skip the bun-test step). Default: sibling
   * `<base>.test.ts` for .ts/.tsx, sibling `<base>.test.md` for .md.
   */
  resolveTestPath?: (artifact: string) => string | null;
  /** Run `tsc --noEmit` on .ts/.tsx artifacts. Default true. */
  runTsc?: boolean;
  /** Run `bun test` on a resolved test file. Default true. */
  runBunTest?: boolean;
}

const DEFAULT_CHECK_TIMEOUT_MS = 10_000;

export async function runVerification(
  artifact: string,
  deps: VerificationDeps = {},
): Promise<VerificationOutcome> {
  const now = deps.now ?? Date.now;
  const fileExists = deps.fileExists ?? defaultFileExists;
  const readFile = deps.readFile ?? defaultReadFile;
  const runner = deps.runner ?? defaultRunner();
  const cwd = deps.cwd ?? process.cwd();
  const checkTimeout = deps.checkTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const resolveTestPath = deps.resolveTestPath ?? defaultResolveTestPath;
  const runTsc = deps.runTsc ?? true;
  const runBunTest = deps.runBunTest ?? true;

  const startedAt = now();
  const checks: VerificationCheck[] = [];

  // 1. file-exists
  checks.push(
    await timed('file-exists', async () => {
      const exists = await fileExists(artifact);
      if (!exists) throw new Error(`file not found: ${artifact}`);
      return `path=${artifact}`;
    }, now),
  );
  if (!checks[checks.length - 1]!.ok) {
    return finalize(artifact, checks, startedAt, now);
  }

  // 2. file-readable (non-empty)
  let content = '';
  checks.push(
    await timed('file-readable', async () => {
      content = await readFile(artifact);
      if (content.length === 0) {
        throw new Error('file is empty');
      }
      return `bytes=${content.length}`;
    }, now),
  );
  if (!checks[checks.length - 1]!.ok) {
    return finalize(artifact, checks, startedAt, now);
  }

  // 3. extension-specific structural check
  const ext = extname(artifact).toLowerCase();
  if (ext === '.md' || ext === '.markdown') {
    checks.push(await timed('md-structure', () => checkMdStructure(content), now));
  } else if (ext === '.ts' || ext === '.tsx') {
    checks.push(await timed('ts-balance', () => checkTsBalance(content), now));
  } else if (ext === '.json') {
    checks.push(await timed('json-parse', () => checkJsonParse(content), now));
  }

  // 4. tsc --noEmit (only for .ts/.tsx)
  if ((ext === '.ts' || ext === '.tsx') && runTsc) {
    checks.push(
      await timed('tsc-noEmit', async () => {
        return runTscCheck(artifact, { runner, cwd, timeoutMs: checkTimeout });
      }, now),
    );
  }

  // 5. bun test (if a sibling test file exists)
  if (runBunTest) {
    const testPath = resolveTestPath(artifact);
    if (testPath) {
      checks.push(
        await timed('test-exists', async () => {
          const exists = await fileExists(testPath);
          if (!exists) throw new Error(`test file not found: ${testPath}`);
          return `path=${testPath}`;
        }, now),
      );
      if (checks[checks.length - 1]!.ok) {
        checks.push(
          await timed('bun-test', async () => {
            return runBunTestCheck(testPath, { runner, cwd, timeoutMs: checkTimeout });
          }, now),
        );
      }
    }
  }

  return finalize(artifact, checks, startedAt, now);
}

async function timed(
  name: VerificationCheck['name'],
  fn: () => string | Promise<string>,
  now: () => number,
): Promise<VerificationCheck> {
  const t0 = now();
  try {
    const notes = await fn();
    return { name, ok: true, notes, durationMs: now() - t0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { name, ok: false, notes: message, durationMs: now() - t0 };
  }
}

function finalize(
  artifact: string,
  checks: VerificationCheck[],
  startedAt: number,
  now: () => number,
): VerificationOutcome {
  const ok = checks.every((c) => c.ok);
  const failed = checks.filter((c) => !c.ok);
  const notes = ok
    ? `verification passed (${checks.length} checks)`
    : `verification failed: ${failed.map((c) => `${c.name}: ${c.notes ?? '?'}`).join('; ')}`;
  return {
    artifact,
    ok,
    checks,
    notes,
    durationMs: now() - startedAt,
  };
}

function checkMdStructure(content: string): string {
  const headings = content.match(/^#{1,6}\s+\S/gm) ?? [];
  if (headings.length === 0) {
    throw new Error('no markdown headings found');
  }
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] ?? '<none>';
  return `headings=${headings.length}, title="${title.trim()}"`;
}

function checkTsBalance(content: string): string {
  // Quick sanity: balanced braces/brackets/parens.
  const opens = (content.match(/[({[]/g) ?? []).length;
  const closes = (content.match(/[)}\]]/g) ?? []).length;
  if (opens !== closes) {
    throw new Error(`unbalanced delimiters: ${opens} open vs ${closes} close`);
  }
  return `delimiters balanced (${opens} pairs)`;
}

function checkJsonParse(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).length : 0;
    return `valid JSON, top-level keys=${keys}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`JSON parse error: ${message}`);
  }
}

async function runTscCheck(
  artifact: string,
  opts: { runner: VerificationRunner; cwd: string; timeoutMs: number },
): Promise<string> {
  const r = await opts.runner.run(['bun', 'x', 'tsc', '--noEmit', artifact], {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
  });
  if (r.exitCode === 0) return 'tsc clean';
  const detail = (r.stderr || r.stdout).slice(0, 500);
  throw new Error(`tsc exit=${r.exitCode}: ${detail}`);
}

async function runBunTestCheck(
  testPath: string,
  opts: { runner: VerificationRunner; cwd: string; timeoutMs: number },
): Promise<string> {
  const r = await opts.runner.run(['bun', 'test', testPath], {
    cwd: opts.cwd,
    timeoutMs: opts.timeoutMs,
  });
  if (r.exitCode === 0) return 'bun test passed';
  const detail = (r.stderr || r.stdout).slice(0, 500);
  throw new Error(`bun test exit=${r.exitCode}: ${detail}`);
}

async function defaultFileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

function defaultResolveTestPath(artifact: string): string | null {
  const ext = extname(artifact).toLowerCase();
  if (ext !== '.ts' && ext !== '.tsx' && ext !== '.md' && ext !== '.markdown') {
    return null;
  }
  const dir = dirname(artifact);
  const base = basename(artifact, extname(artifact));
  if (ext === '.ts' || ext === '.tsx') {
    return join(dir, `${base}.test.ts`);
  }
  return join(dir, `${base}.test.md`);
}

function defaultRunner(): VerificationRunner {
  return {
    async run(cmd, opts) {
      const proc = Bun.spawn({
        cmd,
        cwd: opts?.cwd,
        stdout: 'pipe',
        stderr: 'pipe',
      });
      const timeoutMs = opts?.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
      let killed = false;
      const timer = setTimeout(() => {
        killed = true;
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
      }, timeoutMs);
      try {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        if (killed) {
          throw new Error(`runner killed after ${timeoutMs}ms timeout`);
        }
        return { exitCode, stdout, stderr };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
