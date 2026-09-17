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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { checkSessionRecovery } from './doctor';

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

describe('checkSessionRecovery', () => {
  // `resolveAgentDir` honours UPUP_AGENT_DIR, so point doctor at a throwaway
  // agent dir instead of the developer's real ~/.upup/agent.
  const withAgentDir = (settings: object | undefined, fn: (results: ReturnType<typeof checkSessionRecovery>) => void) => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-doctor-'));
    const previous = process.env.UPUP_AGENT_DIR;
    process.env.UPUP_AGENT_DIR = dir;
    try {
      if (settings !== undefined) {
        writeFileSync(join(dir, 'settings.json'), JSON.stringify(settings), 'utf8');
      }
      fn(checkSessionRecovery());
    } finally {
      if (previous === undefined) delete process.env.UPUP_AGENT_DIR;
      else process.env.UPUP_AGENT_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('warns when automatic compaction is disabled, because truncation cannot self-heal', () => {
    withAgentDir({ compaction: { enabled: false } }, (results) => {
      const auto = results.find((result) => result.name === 'Auto Compact');
      expect(auto?.status).toBe('warn');
      expect(auto?.message).toMatch(/self-heal/);
    });
  });

  it('passes when automatic compaction is explicitly enabled', () => {
    withAgentDir({ compaction: { enabled: true } }, (results) => {
      expect(results.find((result) => result.name === 'Auto Compact')?.status).toBe('pass');
    });
  });

  it('stays silent when the key is absent, matching Pi default of enabled', () => {
    withAgentDir({ theme: 'upup-dark' }, (results) => {
      expect(results.find((result) => result.name === 'Auto Compact')).toBeUndefined();
    });
  });

  it('stays silent when the agent settings file is missing', () => {
    withAgentDir(undefined, (results) => {
      expect(results.find((result) => result.name === 'Auto Compact')).toBeUndefined();
    });
  });

  it('stays silent instead of throwing when the settings file is malformed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-doctor-'));
    const previous = process.env.UPUP_AGENT_DIR;
    process.env.UPUP_AGENT_DIR = dir;
    try {
      writeFileSync(join(dir, 'settings.json'), '{ not json', 'utf8');
      expect(() => checkSessionRecovery()).not.toThrow();
      expect(checkSessionRecovery()).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env.UPUP_AGENT_DIR;
      else process.env.UPUP_AGENT_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
