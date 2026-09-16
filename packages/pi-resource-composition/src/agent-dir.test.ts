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

  test('defaults to <home>/.upup/agent (UpUp canonical home, always)', () => {
    withTempDir((fakeHome) => {
      const result = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      expect(result.agentDir).toBe(join(fakeHome, '.upup', 'agent'));
      expect(result.source).toBe('home-upup-agent');
    });
  });

  test('does not depend on whether the directory already exists', () => {
    withTempDir((fakeHome) => {
      mkdirSync(join(fakeHome, '.upup', 'agent'), { recursive: true });
      const existing = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      const missingHome = join(fakeHome, 'not-created-yet');
      const missing = resolveAgentDir('/anywhere', { env: cleanEnv(), home: missingHome });
      expect(existing.agentDir).toBe(join(fakeHome, '.upup', 'agent'));
      expect(missing.agentDir).toBe(join(missingHome, '.upup', 'agent'));
      expect(existing.source).toBe('home-upup-agent');
      expect(missing.source).toBe('home-upup-agent');
    });
  });

  test('adopts <home>/.pi/agent only when PI_CODING_AGENT_DIR says so', () => {
    withTempDir((fakeHome) => {
      mkdirSync(join(fakeHome, '.pi', 'agent'), { recursive: true });
      const withoutEnv = resolveAgentDir('/anywhere', { env: cleanEnv(), home: fakeHome });
      expect(withoutEnv.agentDir).toBe(join(fakeHome, '.upup', 'agent'));

      const withEnv = resolveAgentDir('/anywhere', {
        env: { PI_CODING_AGENT_DIR: join(fakeHome, '.pi', 'agent') },
        home: fakeHome,
      });
      expect(withEnv.agentDir).toBe(join(fakeHome, '.pi', 'agent'));
      expect(withEnv.source).toBe('pi-agent-dir-env');
    });
  });

  test('cwd never changes the global agent dir', () => {
    withTempDir((dir) => {
      mkdirSync(join(dir, '.upup', 'agent'), { recursive: true });
      const result = resolveAgentDir(dir, { env: cleanEnv(), home: HERMETIC_HOME });
      expect(result.agentDir).toBe(join(HERMETIC_HOME, '.upup', 'agent'));
      expect(result.source).toBe('home-upup-agent');
    });
  });

  test('UPUP_AGENT_DIR beats PI_CODING_AGENT_DIR', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { UPUP_AGENT_DIR: '/a', PI_CODING_AGENT_DIR: '/b' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe('/a');
    expect(result.source).toBe('upup-env');
  });

  test('PI_CODING_AGENT_DIR is honoured when no UPUP_* override is set', () => {
    const result = resolveAgentDir('/somewhere', {
      env: { PI_CODING_AGENT_DIR: '/pi/agent' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe('/pi/agent');
    expect(result.source).toBe('pi-agent-dir-env');
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
      env: { UPUP_AGENT_DIR: '   ', UPUP_CODING_AGENT_DIR: '', PI_CODING_AGENT_DIR: '  ' },
      home: HERMETIC_HOME,
    });
    expect(result.agentDir).toBe(join(HERMETIC_HOME, '.upup', 'agent'));
    expect(result.source).toBe('home-upup-agent');
  });
});
