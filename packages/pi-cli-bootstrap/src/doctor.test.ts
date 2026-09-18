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

import { checkDefaultModel, checkSessionRecovery } from './doctor';

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

describe('checkDefaultModel', () => {
  /** Point `resolveAgentDir` at a throwaway agent dir and run the check. */
  const withAgentDir = (
    files: { settings?: object; models?: object },
    fn: (results: ReturnType<typeof checkDefaultModel>) => void,
  ) => {
    const dir = mkdtempSync(join(tmpdir(), 'upup-doctor-'));
    const previous = process.env.UPUP_AGENT_DIR;
    process.env.UPUP_AGENT_DIR = dir;
    try {
      if (files.settings !== undefined) {
        writeFileSync(join(dir, 'settings.json'), JSON.stringify(files.settings), 'utf8');
      }
      if (files.models !== undefined) {
        writeFileSync(join(dir, 'models.json'), JSON.stringify(files.models), 'utf8');
      }
      fn(checkDefaultModel());
    } finally {
      if (previous === undefined) delete process.env.UPUP_AGENT_DIR;
      else process.env.UPUP_AGENT_DIR = previous;
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it('fails loudly when the configured default is a leaked test fixture', () => {
    // Regression for the field observation: settings.json carried
    // `defaultProvider: "openai-test"` / `defaultModel: "gpt-test"`, so every
    // session silently ran on Pi's own default instead of the configured model.
    withAgentDir({ settings: { defaultProvider: 'openai-test', defaultModel: 'gpt-test' } }, (results) => {
      const check = results.find((result) => result.name === 'Default Model');
      expect(check?.status).toBe('fail');
      expect(check?.message).toMatch(/silently falls back/);
    });
  });

  it('passes for a catalog-backed default', () => {
    withAgentDir({ settings: { defaultProvider: 'minimax', defaultModel: 'MiniMax-M3' } }, (results) => {
      expect(results.find((result) => result.name === 'Default Model')?.status).toBe('pass');
    });
  });

  it('passes for a models.json-only provider that declares the model', () => {
    withAgentDir(
      {
        settings: { defaultProvider: 'custom_anthropic', defaultModel: 'MiniMax-M3' },
        models: { providers: { custom_anthropic: { models: [{ id: 'MiniMax-M3' }] } } },
      },
      (results) => {
        expect(results.find((result) => result.name === 'Default Model')?.status).toBe('pass');
      },
    );
  });

  it('warns when only half of the default pair is configured', () => {
    withAgentDir({ settings: { defaultModel: 'MiniMax-M3' } }, (results) => {
      const check = results.find((result) => result.name === 'Default Model');
      expect(check?.status).toBe('warn');
      expect(check?.message).toMatch(/incomplete/);
    });
  });

  it('stays silent when no default is configured, matching Pi own default', () => {
    withAgentDir({ settings: { theme: 'upup-dark' } }, (results) => {
      expect(results.find((result) => result.name === 'Default Model')).toBeUndefined();
    });
  });
});
