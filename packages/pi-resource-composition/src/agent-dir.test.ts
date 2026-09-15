import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAgentDir } from './agent-dir';

const HERMETIC_HOME = '/__nonexistent__/home';
const cleanEnv = (): NodeJS.ProcessEnv => ({});

function withTempDir<T>(run: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'upup-agent-dir-'));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('@upup/pi-resource-composition — resolveAgentDir', () => {
  test('explicit override wins over every env var and default', () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, '.upup', 'agent'), { recursive: true });
      const result = resolveAgentDir(dir, {
        override: '/custom/agent',
        env: { UPUP_AGENT_DIR: dir },
        home: HERMETIC_HOME,
      });
      expect(result.agentDir).toBe('/custom/agent');
      expect(result.source).toBe('override');
    });
  });

  test('UPUP_AGENT_DIR is used when no override is given', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { UPUP_AGENT_DIR: '/var/lib/upup' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe('/var/lib/upup');
    expect(result.source).toBe('upup-env');
  });

  test('UPUP_CODING_AGENT_DIR (Pi-style name) takes effect when UPUP_AGENT_DIR is unset', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { UPUP_CODING_AGENT_DIR: '/srv/pi-agent' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe('/srv/pi-agent');
    expect(result.source).toBe('pi-canonical-env');
  });

  test('UPUP_AGENT_DIR beats UPUP_CODING_AGENT_DIR', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { UPUP_AGENT_DIR: '/a', UPUP_CODING_AGENT_DIR: '/b' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe('/a');
    expect(result.source).toBe('upup-env');
  });

  test('uses <home>/.upup/agent when it exists (UpUp canonical home)', () => {
    withTempDir((fakeHome) => {
      mkdirSync(join(fakeHome, '.upup', 'agent'), { recursive: true });
      const result = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      expect(result.agentDir).toBe(join(fakeHome, '.upup', 'agent'));
      expect(result.source).toBe('home-upup-agent');
    });
  });

  test('<home>/.upup/agent beats <home>/.pi/agent when both exist', () => {
    withTempDir((fakeHome) => {
      mkdirSync(join(fakeHome, '.upup', 'agent'), { recursive: true });
      mkdirSync(join(fakeHome, '.pi', 'agent'), { recursive: true });
      const result = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      expect(result.agentDir).toBe(join(fakeHome, '.upup', 'agent'));
      expect(result.source).toBe('home-upup-agent');
    });
  });

  test('uses <home>/.pi/agent when it exists but <home>/.upup/agent does not', () => {
    withTempDir((fakeHome) => {
      mkdirSync(join(fakeHome, '.pi', 'agent'), { recursive: true });
      const result = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      expect(result.agentDir).toBe(join(fakeHome, '.pi', 'agent'));
      expect(result.source).toBe('home-pi-agent');
    });
  });

  test('falls back to <cwd>/.upup/agent when present and no env override', () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, '.upup', 'agent'), { recursive: true });
      const result = resolveAgentDir(dir, { env: cleanEnv(), home: HERMETIC_HOME });
      expect(result.agentDir).toBe(join(dir, '.upup', 'agent'));
      expect(result.source).toBe('cwd-upup-agent');
    });
  });

  test('falls back to cwd when nothing else applies', () => {
    withTempDir((dir) => {
      const result = resolveAgentDir(dir, { env: cleanEnv(), home: HERMETIC_HOME });
      expect(result.agentDir).toBe(dir);
      expect(result.source).toBe('cwd-fallback');
    });
  });

  test('expands ~ in override paths', () => {
    const result = resolveAgentDir('/somewhere', {
      override: '~/my-agent',
      env: cleanEnv(),
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).not.toBe('~/my-agent');
    expect(result.agentDir.startsWith('/')).toBe(true);
  });

  test('empty-string env vars are ignored', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { UPUP_AGENT_DIR: '   ', UPUP_CODING_AGENT_DIR: '' },
      home: HERMETIC_HOME,
    });
    expect(result.source).toBe('cwd-fallback');
  });
});
