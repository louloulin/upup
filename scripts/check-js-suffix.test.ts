import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const SCRIPT = join(process.cwd(), 'scripts', 'check-js-suffix.ts');
const FIXTURE = join(process.cwd(), 'scripts', 'check-js-suffix.fixture-script.ts');

function runAudit(): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('bun', ['run', SCRIPT], { encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const result = error as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: result.status ?? 1,
      stdout: typeof result.stdout === 'string' ? result.stdout : result.stdout?.toString('utf8') ?? '',
      stderr: typeof result.stderr === 'string' ? result.stderr : result.stderr?.toString('utf8') ?? '',
    };
  }
}

interface FixtureOptions {
  readonly files: ReadonlyMap<string, string>;
  readonly expectedViolations: number;
  readonly expectedSpecifiers?: readonly string[];
}

function runFixtureAudit(options: FixtureOptions): { caught: boolean; stderr: string; stdout: string } {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'js-suffix-probe-'));
  const probeDir = join(tmpRoot, 'probe');
  mkdirSync(probeDir, { recursive: true });
  for (const [name, content] of options.files) {
    writeFileSync(join(probeDir, name), content);
  }
  copyFileSync(FIXTURE, join(tmpRoot, 'check-js-suffix.ts'));
  let caught = false;
  let stderr = '';
  let stdout = '';
  try {
    stdout = execFileSync('bun', ['run', 'check-js-suffix.ts'], { cwd: tmpRoot, encoding: 'utf8', stdio: 'pipe' });
  } catch (error) {
    caught = true;
    const err = error as { stderr?: Buffer | string; stdout?: Buffer | string };
    stderr = typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '';
    stdout = typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString('utf8') ?? '';
  }
  rmSync(tmpRoot, { recursive: true, force: true });
  if (caught) {
    expect(stderr).toMatch(new RegExp(`FAIL: ${options.expectedViolations}`));
    if (options.expectedSpecifiers) {
      for (const specifier of options.expectedSpecifiers) {
        const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        expect(stderr).toMatch(new RegExp(escaped));
      }
    }
  }
  return { caught, stderr, stdout };
}

describe('Pi7 .js suffix audit', () => {
  test('passes against current clean codebase', () => {
    const result = runAudit();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/\.js suffix audit passed:/);
    expect(result.stdout).toMatch(/0 internal relative-path \.js imports/);
  });

  test('detects a relative-path .js import violation', () => {
    const result = runFixtureAudit({
      files: new Map([
        ['a.ts', "import { foo } from './X.js';\nconst bar = require('./Y.js');\n"],
      ]),
      expectedViolations: 2,
      expectedSpecifiers: ['./X.js', './Y.js'],
    });
    expect(result.caught).toBe(true);
  });

  test('detects dynamic import and re-export violations', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "const m = await import('./Z.js');",
            "export { x } from './W.js';",
            "import('./D.js').then((d) => d);",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 3,
      expectedSpecifiers: ['./Z.js', './W.js', './D.js'],
    });
    expect(result.caught).toBe(true);
  });

  test('does not flag external npm package .js paths', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "import { Client } from '@modelcontextprotocol/sdk/client/index.js';",
            "import Fuse from 'fuse.js';",
            "import { s } from 'some-pkg/dist/x.js';",
            "import { t } from '@scope/lib/file.js';",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 0,
    });
    expect(result.caught).toBe(false);
  });

  test('does not flag type-only relative imports without .js suffix', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "import type { T } from './types';",
            "import { u } from './util';",
            "const v = require('./lib');",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 0,
    });
    expect(result.caught).toBe(false);
  });

  test('does not flag string literals, glob patterns, or negative assertions', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "const path = writeFile(..., 'extensions/index.js', ...);",
            "const pattern = '**/*.js';",
            "const command = 'node script.js';",
            "expect(source).not.toContain('legacy.js');",
            "expect(source).toContain('./skills/executor.js');",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 0,
    });
    expect(result.caught).toBe(false);
  });

  test('flags .mjs and .cjs suffix variants', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "import { foo } from './X.mjs';",
            "const bar = require('./Y.cjs');",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 2,
      expectedSpecifiers: ['./X.mjs', './Y.cjs'],
    });
    expect(result.caught).toBe(true);
  });

  test('flags parent-directory and absolute relative imports', () => {
    const result = runFixtureAudit({
      files: new Map([
        [
          'a.ts',
          [
            "import { foo } from '../shared/X.js';",
            "const bar = require('./sub/Y.js');",
          ].join('\n'),
        ],
      ]),
      expectedViolations: 2,
      expectedSpecifiers: ['../shared/X.js', './sub/Y.js'],
    });
    expect(result.caught).toBe(true);
  });
});
