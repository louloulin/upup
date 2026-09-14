import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, '../../../scripts/lint-web-boundary.sh');

describe('management page boundary', () => {
  test('passes for the Pi management page package', () => {
    const output = execFileSync('bash', [script], {
      encoding: 'utf8',
      env: { ...process.env, WEB_DIR: join(import.meta.dir) },
    });
    expect(output).toContain('边界 OK');
  });

  test('rejects a page importing root business modules', () => {
    const directory = mkdtempSync(join(tmpdir(), 'upup-management-boundary-'));
    try {
      const rootToolsPath = ['../../../', ['src', 'tools'].join('/'), 'legacy.js'].join('');
      writeFileSync(join(directory, 'page.ts'), `import { run } from '${rootToolsPath}';\n`);
      expect(() => execFileSync('bash', [script], { env: { ...process.env, WEB_DIR: directory }, encoding: 'utf8', stdio: 'pipe' })).toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
