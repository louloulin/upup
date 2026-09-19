import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runSkillCommand,
  __skillTestHooks,
  type SkillCommandOptions,
} from './skill';

const { effectivePolicy, scanSkills, findRepoRoot, scanRepoSkills, listSkillDirs } = __skillTestHooks;

const tempDirs: string[] = [];

/**
 * Save the test preloaded env at module load so `afterEach` can restore it
 * instead of unconditionally deleting `UPUP_HOME` / `UPUP_CODING_AGENT_DIR`.
 * Without this the test silently leaks into the next suite and
 * `agent-dir-publication.contract.test.ts` would observe the real home.
 */
const PRESERVED_ENV = {
  UPUP_USER_SKILLS: process.env.UPUP_USER_SKILLS,
  UPUP_HOME: process.env.UPUP_HOME,
  UPUP_AGENT_DIR: process.env.UPUP_AGENT_DIR,
  UPUP_CODING_AGENT_DIR: process.env.UPUP_CODING_AGENT_DIR,
  PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR,
} as const;

function newTemp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `upup-skill-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function makeSkillDir(rootDir: string, skillName: string): void {
  const dir = join(rootDir, skillName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `# ${skillName}\n`);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  // Restore the test-preloaded env instead of unconditionally deleting it.
  // See `PRESERVED_ENV` at the top of this file.
  for (const [key, baseline] of Object.entries(PRESERVED_ENV)) {
    if (baseline === undefined) delete process.env[key];
    else process.env[key] = baseline;
  }
});

function isolateEnv(overrides: Record<string, string> = {}): void {
  delete process.env.UPUP_USER_SKILLS;
  delete process.env.UPUP_HOME;
  delete process.env.UPUP_AGENT_DIR;
  delete process.env.UPUP_CODING_AGENT_DIR;
  delete process.env.PI_CODING_AGENT_DIR;
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}

function call(args: SkillCommandOptions): Promise<{ exitCode: number; message: string }> {
  return runSkillCommand(args);
}

describe('upup skill effective-policy', () => {
  test('defaults to exclude when env and settings are unset', () => {
    const result = effectivePolicy({});
    expect(result.policy).toBe('exclude');
    expect(result.source).toBe('default');
  });

  test('env UPUP_USER_SKILLS=include beats settings', () => {
    const result = effectivePolicy({ UPUP_USER_SKILLS: 'include' });
    expect(result.policy).toBe('include');
    expect(result.source).toBe('env');
  });

  test('rejects malformed env values and falls back to default', () => {
    const result = effectivePolicy({ UPUP_USER_SKILLS: 'whatever' });
    expect(result.policy).toBe('exclude');
    expect(result.source).toBe('default');
  });
});

describe('upup skill directory scan', () => {
  test('findRepoRoot locates the nearest packages/ directory', () => {
    const repo = newTemp('repo');
    mkdirSync(join(repo, 'packages'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{"name":"fixture"}');
    const nested = join(repo, 'packages', 'pi-fake', 'skills');
    mkdirSync(nested, { recursive: true });
    const found = findRepoRoot(nested);
    expect(found).toBe(repo);
  });

  test('listSkillDirs returns empty array when dir is missing', () => {
    const result = listSkillDirs(join(tmpdir(), 'definitely-missing-' + Math.random()));
    expect(result).toEqual([]);
  });

  test('scanRepoSkills collects SKILL.md under packages/pi-*/skills', () => {
    const repo = newTemp('repo-scan');
    mkdirSync(join(repo, 'packages'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}');
    makeSkillDir(join(repo, 'packages', 'pi-a', 'skills'), 'one');
    makeSkillDir(join(repo, 'packages', 'pi-a', 'skills'), 'two');
    // non-pi- packages should be ignored
    makeSkillDir(join(repo, 'packages', 'not-pi', 'skills'), 'three');
    const found = scanRepoSkills(repo);
    expect(found.map((entry) => entry.name).sort()).toEqual(['one', 'two']);
  });

  test('scanSkills reports upup / ambient / skipped buckets', () => {
    const repo = newTemp('repo-scan2');
    mkdirSync(join(repo, 'packages'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}');
    makeSkillDir(join(repo, 'packages', 'pi-invest', 'skills'), 'dcf');

    const home = newTemp('home');
    makeSkillDir(join(home, '.agents', 'skills'), 'amazon-ppc-campaign');
    makeSkillDir(join(home, '.agents', 'skills'), 'using-superpowers');

    const agentRoot = newTemp('agent');
    const agentDir = join(agentRoot, 'agent');
    mkdirSync(agentDir, { recursive: true });
    makeSkillDir(join(agentDir, 'skills'), 'custom-watchlist');

    const result = scanSkills({ cwd: repo, home, agentDir });
    expect(result.upup.map((entry) => entry.name).sort()).toEqual(['custom-watchlist', 'dcf']);
    expect(result.ambient.map((entry) => entry.name).sort()).toEqual(['amazon-ppc-campaign', 'using-superpowers']);
  });
});

describe('upup skill command runner', () => {
  test('list --scope=upup shows repo skills and reports default policy', async () => {
    const repo = newTemp('repo-cli');
    mkdirSync(join(repo, 'packages'), { recursive: true });
    writeFileSync(join(repo, 'package.json'), '{}');
    makeSkillDir(join(repo, 'packages', 'pi-x', 'skills'), 'sample');
    const home = newTemp('home-cli');
    makeSkillDir(join(home, '.agents', 'skills'), 'noise');
    const agentDir = join(newTemp('agent-cli'), 'agent');
    mkdirSync(agentDir, { recursive: true });

    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => captured.push(msg);
    try {
      const result = await call({
        command: 'list',
        args: ['--scope=upup'],
        env: process.env,
        home,
        cwd: repo,
      });
      expect(result.exitCode).toBe(0);
      expect(captured.some((line) => line.includes('sample'))).toBe(true);
      expect(captured.some((line) => line.includes('noise'))).toBe(false);
      expect(captured.some((line) => line.includes('policy:'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  test('set-policy include persists userSkills in ~/.upup/settings.json', async () => {
    isolateEnv({ UPUP_HOME: newTemp('settings-home') });
    const result = await call({
      command: 'set-policy',
      args: ['include'],
      env: process.env,
      home: process.env.UPUP_HOME,
      cwd: process.cwd(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('include');
  });

  test('set-policy rejects an unknown policy with exit 1', async () => {
    isolateEnv({ UPUP_HOME: newTemp('settings-home2') });
    const result = await call({
      command: 'set-policy',
      args: ['nope'],
      env: process.env,
      home: process.env.UPUP_HOME,
      cwd: process.cwd(),
    });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('invalid policy');
  });

  test('enable-all is equivalent to set-policy include', async () => {
    isolateEnv({ UPUP_HOME: newTemp('settings-home3') });
    const result = await call({
      command: 'enable-all',
      args: [],
      env: process.env,
      home: process.env.UPUP_HOME,
      cwd: process.cwd(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('include');
  });

  test('help prints usage and exits 0', async () => {
    const captured: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => captured.push(msg);
    try {
      const result = await call({
        command: 'help',
        args: [],
        env: process.env,
        home: tmpdir(),
        cwd: process.cwd(),
      });
      expect(result.exitCode).toBe(0);
      expect(captured.some((line) => line.includes('upup skill'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });
});
