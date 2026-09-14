import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { migrateLegacyMemories } from './migration.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('migrateLegacyMemories', () => {
  test('migrates root markdown files into typed directories and rebuilds index', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'upup-memory-migrate-'));
    tempDirs.push(baseDir);
    const memoryDir = join(baseDir, 'memory');
    mkdirSync(memoryDir, { recursive: true });

    writeFileSync(join(memoryDir, 'preferences.md'), 'Prefers TypeScript and Bun for CLI work.');
    writeFileSync(join(memoryDir, 'coding-style.md'), 'Please avoid long summaries and keep responses terse.');
    writeFileSync(join(memoryDir, 'portfolio-rebalance.md'), 'Quarterly rebalance plan for the taxable portfolio.');
    writeFileSync(join(memoryDir, 'linear-links.md'), 'Linear board: https://linear.app/example/project');

    const result = await migrateLegacyMemories({ baseDir });

    expect(result.migrated).toHaveLength(4);
    expect(existsSync(join(memoryDir, 'user', 'preferences.md'))).toBe(true);
    expect(existsSync(join(memoryDir, 'feedback', 'coding-style.md'))).toBe(true);
    expect(existsSync(join(memoryDir, 'project', 'portfolio-rebalance.md'))).toBe(true);
    expect(existsSync(join(memoryDir, 'reference', 'linear-links.md'))).toBe(true);
    expect(existsSync(join(memoryDir, 'legacy', 'preferences.md'))).toBe(true);

    const index = readFileSync(join(memoryDir, 'MEMORY.md'), 'utf-8');
    expect(index).toContain('# UpUp Memory Index');
    expect(index).toContain('## user/');
    expect(index).toContain('## feedback/');
    expect(index).toContain('## project/');
    expect(index).toContain('## reference/');
  });

  test('skips an existing typed memory index file', async () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'upup-memory-index-'));
    tempDirs.push(baseDir);
    const memoryDir = join(baseDir, 'memory');
    mkdirSync(memoryDir, { recursive: true });
    writeFileSync(join(memoryDir, 'MEMORY.md'), '# UpUp Memory Index\n\n## Summary\n');

    const result = await migrateLegacyMemories({ baseDir, dryRun: true });
    expect(result.skipped[0]?.reason).toContain('Already a typed memory index');
  });
});
