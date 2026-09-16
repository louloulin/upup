/**
 * Doctor Command Tests
 *
 * Unit tests for health check command.
 * Part of Plan12 P2 implementation.
 */

import { describe, it, expect } from 'bun:test';

describe('Doctor Command', () => {
  it('should export runDoctor function', async () => {
    const module = await import('./doctor');
    expect(typeof module.runDoctor).toBe('function');
  });

  it('should be an async function', async () => {
    const module = await import('./doctor');
    expect(module.runDoctor.constructor.name).toBe('AsyncFunction');
  });
});

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

describe('Doctor exit-code contract', () => {
  const distBinary = join(process.cwd(), 'dist', 'upup');

  it('compiled binary exits 0 regardless of missing keys (read-only diagnostic)', () => {
    if (!existsSync(distBinary)) {
      // The test relies on the dist build; skip if it has not been built yet.
      // `bun run verify:pi7-final` runs `bun run build` first.
      return;
    }
    const result = spawnSync(distBinary, ['doctor'], { encoding: 'utf-8' });
    expect(result.status).toBe(0);
    // Doctor should print a summary line even when keys are missing.
    expect(result.stdout).toMatch(/Summary:/);
  });
});
