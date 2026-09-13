import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createLogger } from './logger.js';

describe('logger file lifecycle', () => {
  test('recreates a log directory removed after logger initialization', () => {
    const root = mkdtempSync(join(tmpdir(), 'upup-logger-'));
    const logDir = join(root, 'logs');
    const logger = createLogger({ logDir, enableConsole: false });
    rmSync(logDir, { recursive: true, force: true });

    logger.info('system', 'directory recovery');

    const files = Bun.file(join(logDir, `upup-${new Date().toISOString().slice(0, 10)}.log`));
    expect(existsSync(logDir)).toBe(true);
    expect(files.size).toBeGreaterThan(0);
    expect(readFileSync(join(logDir, `upup-${new Date().toISOString().slice(0, 10)}.log`), 'utf8')).toContain('directory recovery');
    rmSync(root, { recursive: true, force: true });
  });
});
