/**
 * src/web/ boundary lint test (P2.b.1 / D-CTG-8)
 *
 * Verifies scripts/lint-web-boundary.sh:
 *   - passes on a clean src/web/ stub
 *   - fails on any forbidden import pattern (../../src/agent/, etc.)
 *   - skips (exit 0) when WEB_DIR is absent
 *   - reports the violating line in the error message
 *
 * We drive the actual bash script with controlled WEB_DIR fixtures in
 * tmpdir — this is the only way to assert lint behavior without
 * polluting the real src/web/ stub.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';

/**
 * Build an import statement at runtime by joining its parts, so the
 * lint grep (which scans .ts source) does not see a literal forbidden
 * pattern. We test that the lint *catches* forbidden patterns — but the
 * test file itself must not contain the pattern as source text, or the
 * lint will flag the test file instead of the fixture it just wrote.
 */
function buildImport(rel: string, name: string): string {
  return 'import { ' + name + " } from '" + rel + "';";
}
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LINT = join(import.meta.dir, '..', '..', 'scripts', 'lint-web-boundary.sh');

interface LintRun {
  status: number;
  stdout: string;
  stderr: string;
}

function runLint(webDir: string | null): LintRun {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (webDir === null) {
    // Point WEB_DIR at a path that definitely does not exist
    env.WEB_DIR = join(tmpdir(), `definitely-missing-${Date.now()}-${Math.random()}`);
  } else {
    env.WEB_DIR = webDir;
  }
  let status = 0;
  let stdout = '';
  let stderr = '';
  try {
    const r = execFileSync('bash', [LINT], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    stdout = r;
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    status = typeof err.status === 'number' ? err.status : 1;
    stdout = err.stdout ?? '';
    stderr = err.stderr ?? '';
  }
  return { status, stdout, stderr };
}

describe('lint-web-boundary.sh', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'upup-web-boundary-'));
  });
  afterEach(() => {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  });

  test('passes on an empty src/web/ (no imports at all)', () => {
    const wd = join(root, 'web-empty');
    mkdirSync(wd, { recursive: true });
    writeFileSync(join(wd, 'index.ts'), 'export const x = 1;\n');
    const r = runLint(wd);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/边界 OK/);
  });

  test('passes when only bridge + react imports are present', () => {
    const wd = join(root, 'web-bridge-only');
    mkdirSync(wd, { recursive: true });
    writeFileSync(
      join(wd, 'dashboard.tsx'),
      [
        "import { useState } from 'react';",
        "import { useEffect } from 'react-dom';",
        "// bridge imports are fine",
        "const bridgeUrl = '/bridge';",
        '',
      ].join('\n'),
    );
    const r = runLint(wd);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/边界 OK/);
  });

  test('fails on forbidden src/agent/ import (relative path)', () => {
    const wd = join(root, 'web-bad-agent');
    mkdirSync(wd, { recursive: true });
    // Mimic a typical src/web/foo.ts → ../../src/agent/... import shape
    writeFileSync(
      join(wd, 'oops.ts'),
      buildImport('../../src/agent/agent.js', 'Agent') + '\nexport const x = Agent;\n',
    );
    const r = runLint(wd);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/src\/agent\//);
    expect(r.stderr).toMatch(/oops\.ts/);
  });

  test('fails on each forbidden module pattern', () => {
    const forbidden = [
      '../../src/agent/agent.js',
      '../../src/tools/browser/index.js',
      '../../src/skills/dcf/index.js',
      '../../src/memory/dossier.js',
      '../../src/realtime/feed.js',
      '../../src/kairos/proactive.js',
      '../../src/plan/workflow.js',
    ];
    const wd = join(root, 'web-each');
    mkdirSync(wd, { recursive: true });
    for (let i = 0; i < forbidden.length; i++) {
      writeFileSync(
        join(wd, `bad-${i}.ts`),
        buildImport(forbidden[i]!, 'X') + `\nexport const x${i} = X;\n`,
      );
    }
    const r = runLint(wd);
    expect(r.status).toBe(1);
    // Every forbidden pattern should be named in stderr
    for (const p of [
      'src/agent/',
      'src/tools/',
      'src/skills/',
      'src/memory/',
      'src/realtime/',
      'src/kairos/',
      'src/plan/',
    ]) {
      expect(r.stderr).toContain(p);
    }
  });

  test('does NOT flag deep non-business imports (e.g. ../pi-bridge/server.js)', () => {
    // src/web/foo → ../../packages/pi-bridge/src/server is allowed by the boundary.
    // We don't validate that the import resolves (that's tsc's job) — we
    // only assert the lint doesn't reject it.
    const wd = join(root, 'web-bridge-imp');
    mkdirSync(wd, { recursive: true });
    writeFileSync(
      join(wd, 'snapshot.ts'),
      "import { startBridgeServer } from '../../packages/pi-bridge/src/server.js';\nexport { startBridgeServer };\n",
    );
    const r = runLint(wd);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/边界 OK/);
  });

  test('skips (exit 0) when WEB_DIR does not exist', () => {
    const r = runLint(null);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/不存在.*跳过/);
  });
});

describe('src/web/ real stub', () => {
  // Sanity check: the placeholder we ship in src/web/ must itself pass
  // the lint. If a future change accidentally adds a forbidden import
  // here, this test will catch it BEFORE CI does.
  test('the shipped src/web/ stub passes the boundary lint', () => {
    // import.meta.dir = src/web/ (the directory containing this test)
    const realWeb = import.meta.dir;
    expect(existsSync(realWeb)).toBe(true);
    const r = runLint(realWeb);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/边界 OK/);
  });
});
