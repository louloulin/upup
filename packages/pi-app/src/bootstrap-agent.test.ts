import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { bootstrapUpupAgent, bootstrapUpupAgentSync } from './bootstrap-agent';

function freshDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

describe('bootstrapUpupAgent', () => {
  let workDir: string;
  let agentDir: string;

  beforeEach(() => {
    workDir = freshDir('upup-bootstrap-');
    agentDir = resolve(workDir, '.upup', 'agent');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('creates themes/ + sessions/ and installs the UpUp theme on first run', () => {
    const result = bootstrapUpupAgentSync({ agentDir, skipSeed: true });
    expect(result.skipped).toBe(false);
    expect(result.themeWritten).toBe(true);
    expect(result.settingsWritten).toBe(true);
    expect(existsSync(join(agentDir, 'themes', 'upup-dark.json'))).toBe(true);

    const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8')) as { theme: string };
    expect(settings.theme).toBe('upup-dark');

    const theme = JSON.parse(readFileSync(join(agentDir, 'themes', 'upup-dark.json'), 'utf8')) as { name: string };
    expect(theme.name).toBe('upup-dark');
  });

  it('is idempotent: a second run writes nothing new', () => {
    bootstrapUpupAgentSync({ agentDir, skipSeed: true });
    const second = bootstrapUpupAgentSync({ agentDir, skipSeed: true });
    expect(second.skipped).toBe(false);
    expect(second.settingsWritten).toBe(false);
  });

  it('async variant produces the same result on a fresh dir', async () => {
    const other = join(freshDir('upup-bootstrap-async-'), '.upup', 'agent');
    const result = await bootstrapUpupAgent({ agentDir: other, skipSeed: true });
    expect(result.skipped).toBe(false);
    expect(result.themeWritten).toBe(true);
    expect(result.settingsWritten).toBe(true);
  });

  it('seeds a fresh agent dir from a previous Pi home', () => {
    const source = join(workDir, '.pi', 'agent');
    mkdirSync(join(source, 'themes'), { recursive: true });
    mkdirSync(join(source, 'prompts'), { recursive: true });
    mkdirSync(join(source, 'sessions'), { recursive: true });
    writeFileSync(join(source, 'settings.json'), JSON.stringify({ defaultProvider: 'minimax', theme: 'dark' }));
    writeFileSync(join(source, 'models.json'), JSON.stringify({ providers: {} }));
    writeFileSync(join(source, 'auth.json'), JSON.stringify({ minimax: { apiKey: 'secret' } }), { mode: 0o600 });
    writeFileSync(join(source, 'themes', 'custom.json'), JSON.stringify({ name: 'custom' }));
    writeFileSync(join(source, 'prompts', 'brief.md'), '# brief');

    const result = bootstrapUpupAgentSync({ agentDir, seedFrom: source });
    expect(result.seededFrom).toBe(source);
    expect(result.seededPaths).toContain('settings.json');
    expect(result.seededPaths).toContain('models.json');
    expect(result.seededPaths).toContain('auth.json');
    expect(result.seededPaths).toContain(join('themes', 'custom.json'));
    expect(result.seededPaths).toContain(join('prompts', 'brief.md'));
    // Credentials are carried over but tightened to owner-only.
    expect(statSync(join(agentDir, 'auth.json')).mode & 0o777).toBe(0o600);

    const seeded = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8')) as {
      defaultProvider: string;
      theme: string;
    };
    // Provider choice survives; the built-in "dark" theme is rebranded to UpUp.
    expect(seeded.defaultProvider).toBe('minimax');
    expect(seeded.theme).toBe('upup-dark');
    // Sessions and caches are not carried over.
    expect(existsSync(join(agentDir, 'sessions', 'settings.json'))).toBe(false);
    expect(result.seededPaths).not.toContain('sessions');
  });

  it('respects an explicit custom theme from the seeded settings', () => {
    const source = join(workDir, '.pi', 'agent');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'settings.json'), JSON.stringify({ theme: 'solarized' }));
    const result = bootstrapUpupAgentSync({ agentDir, seedFrom: source });
    expect(result.settingsWritten).toBe(false);
    const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8')) as { theme: string };
    expect(settings.theme).toBe('solarized');
  });

  it('never overwrites an existing agent dir on a later run', () => {
    bootstrapUpupAgentSync({ agentDir, skipSeed: true });
    const source = join(workDir, '.pi', 'agent');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'settings.json'), JSON.stringify({ defaultProvider: 'openai' }));
    const result = bootstrapUpupAgentSync({ agentDir, seedFrom: source });
    expect(result.seededPaths).toEqual([]);
    const settings = JSON.parse(readFileSync(join(agentDir, 'settings.json'), 'utf8')) as { defaultProvider?: string };
    expect(settings.defaultProvider).toBeUndefined();
  });

  it('skips seeding when no previous Pi home exists', () => {
    const result = bootstrapUpupAgentSync({ agentDir, seedFrom: join(workDir, 'definitely-missing') });
    expect(result.seededFrom).toBeUndefined();
    expect(result.seededPaths).toEqual([]);
    expect(result.themeWritten).toBe(true);
  });

  it('degrades to skipped when the agent dir cannot be created', () => {
    const result = bootstrapUpupAgentSync({ agentDir: '/this-path-should-not-exist-12345/upup/agent', skipSeed: true });
    expect(result.skipped).toBe(true);
  });

  it('defaults to <home>/.upup/agent and seeds from <home>/.pi/agent', () => {
    const home = join(workDir, 'home');
    const piHome = join(home, '.pi', 'agent');
    mkdirSync(piHome, { recursive: true });
    writeFileSync(join(piHome, 'settings.json'), JSON.stringify({ defaultProvider: 'moonshot' }));

    // `env: {}` keeps the `home` argument authoritative: `resolveAgentDir`
    // deliberately ranks `$UPUP_HOME` / `*_CODING_AGENT_DIR` above `home`
    // (those are explicit relocations of the UpUp root), and `bun test` sets
    // both process-wide to sandbox the run — so without this the preload's
    // temp sandbox would win and `home` would be ignored.
    const result = bootstrapUpupAgentSync({ home, env: {}, skipSeed: false });
    expect(result.agentDir).toBe(join(home, '.upup', 'agent'));
    expect(result.seededFrom).toBe(piHome);
    const settings = JSON.parse(readFileSync(join(result.agentDir, 'settings.json'), 'utf8')) as {
      defaultProvider: string;
    };
    expect(settings.defaultProvider).toBe('moonshot');
  });
});
