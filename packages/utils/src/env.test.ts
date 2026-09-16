import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  getAuthJsonPath,
  mergeAuthJsonIntoProcessEnv,
} from './env';

describe('mergeAuthJsonIntoProcessEnv', () => {
  let work: string;
  let originalAgentDir: string | undefined;
  let originalHome: string | undefined;
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'upup-env-test-'));
    originalHome = process.env.HOME;
    originalAgentDir = process.env.PI_CODING_AGENT_DIR;
    snapshot = {};
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('MINIMAX_') || key.startsWith('OPENAI_API') || key.startsWith('ANTHROPIC_')) {
        snapshot[key] = process.env[key];
      }
    }
    delete process.env.PI_CODING_AGENT_DIR;
    delete process.env.UPUP_HOME;
    delete process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_CN_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (originalAgentDir !== undefined) process.env.PI_CODING_AGENT_DIR = originalAgentDir;
    else delete process.env.PI_CODING_AGENT_DIR;
    if (originalHome !== undefined) process.env.HOME = originalHome;
    rmSync(work, { recursive: true, force: true });
  });

  function writeAuth(providerEntries: Record<string, unknown>) {
    return join(work, 'auth.json');
  }

  function seedAuth(providerEntries: Record<string, unknown>) {
    writeFileSync(writeAuth(providerEntries), JSON.stringify(providerEntries));
  }

  test('injects api_key credentials via PI_CODING_AGENT_DIR', () => {
    seedAuth({ minimax: { type: 'api_key', key: 'sk-from-auth-1234567890' } });
    process.env.PI_CODING_AGENT_DIR = work;
    const result = mergeAuthJsonIntoProcessEnv(writeAuth({}));
    expect(result.injected).toContain('MINIMAX_API_KEY');
    expect(process.env.MINIMAX_API_KEY).toBe('sk-from-auth-1234567890');
  });

  test('skips OAuth credentials (Pi reads them itself)', () => {
    seedAuth({ 'github-copilot': { type: 'oauth', access: 'tok', refresh: 'rtok', expires: 99999 } });
    process.env.PI_CODING_AGENT_DIR = work;
    const result = mergeAuthJsonIntoProcessEnv(writeAuth({}));
    expect(result.skippedOAuth).toContain('github-copilot');
    expect(result.injected).toHaveLength(0);
  });

  test('does not overwrite an existing env var', () => {
    process.env.MINIMAX_API_KEY = 'sk-from-shell-9999999999';
    seedAuth({ minimax: { type: 'api_key', key: 'sk-from-auth-1234567890' } });
    process.env.PI_CODING_AGENT_DIR = work;
    mergeAuthJsonIntoProcessEnv(writeAuth({}));
    expect(process.env.MINIMAX_API_KEY).toBe('sk-from-shell-9999999999');
  });

  test('is idempotent when called twice', () => {
    seedAuth({ minimax: { type: 'api_key', key: 'sk-from-auth-1234567890' } });
    process.env.PI_CODING_AGENT_DIR = work;
    const first = mergeAuthJsonIntoProcessEnv(writeAuth({}));
    const second = mergeAuthJsonIntoProcessEnv(writeAuth({}));
    expect(first.injected.length).toBeGreaterThan(0);
    expect(second.injected).toHaveLength(0);
    expect(process.env.MINIMAX_API_KEY).toBe('sk-from-auth-1234567890');
  });

  test('reports unknown provider ids without crashing', () => {
    seedAuth({ totally_made_up_provider: { type: 'api_key', key: 'sk-whatever' } });
    process.env.PI_CODING_AGENT_DIR = work;
    const result = mergeAuthJsonIntoProcessEnv(writeAuth({}));
    expect(result.unknownProviders).toContain('totally_made_up_provider');
    expect(result.injected).toHaveLength(0);
  });

  test('handles malformed auth.json without throwing', () => {
    writeFileSync(join(work, 'auth.json'), 'not valid json {{{');
    process.env.PI_CODING_AGENT_DIR = work;
    expect(() => mergeAuthJsonIntoProcessEnv(join(work, 'auth.json'))).not.toThrow();
  });

  test('handles missing auth.json as a no-op', () => {
    process.env.PI_CODING_AGENT_DIR = work;
    const result = mergeAuthJsonIntoProcessEnv(join(work, 'auth.json'));
    expect(result.injected).toHaveLength(0);
    expect(result.skippedOAuth).toHaveLength(0);
  });

  test('getAuthJsonPath respects PI_CODING_AGENT_DIR override', () => {
    process.env.PI_CODING_AGENT_DIR = '/tmp/custom-agent';
    expect(getAuthJsonPath()).toBe('/tmp/custom-agent/auth.json');
  });
});

import { writeAuthJsonEntry } from './env';

describe('writeAuthJsonEntry', () => {
  let work: string;
  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'upup-auth-write-'));
  });
  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  test('creates auth.json with the canonical Pi schema', () => {
    const authPath = join(work, 'auth.json');
    const result = writeAuthJsonEntry('minimax', { type: 'api_key', key: 'sk-1234567890' }, authPath);
    expect(result.path).toBe(authPath);
    expect(result.providerId).toBe('minimax');
    expect(result.credentialType).toBe('api_key');
    const written = JSON.parse(readFileSync(authPath, 'utf-8'));
    expect(written.minimax).toEqual({ type: 'api_key', key: 'sk-1234567890' });
  });

  test('preserves unrelated provider entries when updating one', () => {
    const authPath = join(work, 'auth.json');
    writeFileSync(authPath, JSON.stringify({ openai: { type: 'api_key', key: 'sk-other' } }));
    writeAuthJsonEntry('minimax', { type: 'api_key', key: 'sk-new' }, authPath);
    const written = JSON.parse(readFileSync(authPath, 'utf-8'));
    expect(written.openai).toEqual({ type: 'api_key', key: 'sk-other' });
    expect(written.minimax).toEqual({ type: 'api_key', key: 'sk-new' });
  });

  test('writes with 0600 permissions so secrets are owner-only', () => {
    const authPath = join(work, 'auth.json');
    writeAuthJsonEntry('minimax', { type: 'api_key', key: 'sk-secret' }, authPath);
    const mode = statSync(authPath).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test('refuses to write OAuth credentials (Pi login flow handles those)', () => {
    const authPath = join(work, 'auth.json');
    expect(() =>
      writeAuthJsonEntry('openai-codex', { type: 'oauth', access: 'tok', refresh: 'rtok', expires: 99999 } as never, authPath),
    ).toThrow(/api_key/);
  });

  test('refuses to write an empty key', () => {
    const authPath = join(work, 'auth.json');
    expect(() => writeAuthJsonEntry('minimax', { type: 'api_key', key: '' }, authPath)).toThrow(/empty key/);
  });

  test('creates the parent directory if it does not exist', () => {
    const authPath = join(work, 'nested', 'agent', 'auth.json');
    writeAuthJsonEntry('minimax', { type: 'api_key', key: 'sk-1234' }, authPath);
    expect(existsSync(authPath)).toBe(true);
  });
});
