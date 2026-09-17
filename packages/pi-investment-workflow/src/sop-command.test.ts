import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSopCommand } from './sop-command';

describe('runSopCommand', () => {
  test('defaults to list', async () => {
    const out = await runSopCommand('');
    expect(out).toContain('SOP Catalog');
    expect(out).toContain('graham');
  });

  test('list shows every built-in SOP with validation status', async () => {
    const out = await runSopCommand('list');
    for (const id of ['graham', 'momentum', 'debate', 'morning-brief', 'portfolio-review']) {
      expect(out).toContain(id);
    }
    expect(out).toContain('✓');
  });

  test('show renders the phase graph and parallel groups', async () => {
    const out = await runSopCommand('show debate');
    expect(out).toContain('多空辩论法');
    expect(out).toContain('Parallel groups:');
    expect(out).toContain('llm-arbiter');
    expect(out).toContain('/invest --sop debate');
  });

  test('show with unknown id lists the available ids', async () => {
    const out = await runSopCommand('show nope');
    expect(out).toContain('未知 SOP: nope');
    expect(out).toContain('graham');
  });

  test('show without an id prints usage', async () => {
    const out = await runSopCommand('show');
    expect(out).toContain('用法: /sop show <id>');
  });

  test('sources lists each SOP with its origin', async () => {
    const out = await runSopCommand('sources');
    expect(out).toContain('SOP sources');
    expect(out).toContain('builtin');
  });

  test('check validates every SOP', async () => {
    const out = await runSopCommand('check');
    expect(out).toContain('SOP check');
    expect(out).toContain('all SOPs validate');
  });

  test('agents lists builtin agent profiles', async () => {
    const out = await runSopCommand('agents');
    expect(out).toContain('[builtin] invest-explore');
    expect(out).toContain('[builtin] invest-risk');
  });

  test('unknown subcommand prints help', async () => {
    const out = await runSopCommand('bogus');
    expect(out).toContain('/sop — SOP 方法论浏览器');
  });

  test('help documents install/uninstall/new', async () => {
    const out = await runSopCommand('help');
    expect(out).toContain('/sop install <source>');
    expect(out).toContain('/sop uninstall <id>');
    expect(out).toContain('/sop new <id>');
    expect(out).toContain('$UPUP_HOME/sops');
  });
});

describe('runSopCommand install/uninstall/new', () => {
  let tmpUpupHome: string;
  let tmpSource: string;
  let origUpupHome: string | undefined;

  const SOP = `
id: cli-method
name: CLI Method
description: installed from the /sop command
version: 1.0.0
phases:
  - id: detect
    agent: invest-explore
    intent: gather
  - id: report
    agent: invest-review
    intent: report
    requires: [detect]
`;

  beforeEach(() => {
    tmpUpupHome = mkdtempSync(join(tmpdir(), 'upup-sop-cmd-home-'));
    tmpSource = mkdtempSync(join(tmpdir(), 'upup-sop-cmd-src-'));
    origUpupHome = process.env.UPUP_HOME;
    process.env.UPUP_HOME = tmpUpupHome;
  });

  afterEach(() => {
    rmSync(tmpUpupHome, { recursive: true, force: true });
    rmSync(tmpSource, { recursive: true, force: true });
    if (origUpupHome === undefined) delete process.env.UPUP_HOME;
    else process.env.UPUP_HOME = origUpupHome;
  });

  test('install copies a local YAML into $UPUP_HOME/sops and reports the target', async () => {
    const path = join(tmpSource, 'cli-method.yaml');
    writeFileSync(path, SOP);
    const out = await runSopCommand(`install ${path}`);
    expect(out).toContain('✓ cli-method');
    expect(out).toContain('~/.upup/sops');
    expect(existsSync(join(tmpUpupHome, 'sops', 'cli-method.yaml'))).toBe(true);
  });

  test('install without a source prints usage', async () => {
    const out = await runSopCommand('install');
    expect(out).toContain('用法: /sop install <source>');
    expect(out).toContain('builtin:graham');
  });

  test('install reports skipped ids unless --force', async () => {
    const path = join(tmpSource, 'cli-method.yaml');
    writeFileSync(path, SOP);
    await runSopCommand(`install ${path}`);
    const second = await runSopCommand(`install ${path}`);
    expect(second).toContain('已存在');
    const forced = await runSopCommand(`install ${path} --force`);
    expect(forced).toContain('✓ cli-method');
  });

  test('install --project targets <cwd>/.upup/sops', async () => {
    const path = join(tmpSource, 'cli-method.yaml');
    writeFileSync(path, SOP);
    const out = await runSopCommand(`install ${path} --project`);
    expect(out).toContain(join(process.cwd(), '.upup', 'sops'));
    expect(existsSync(join(process.cwd(), '.upup', 'sops', 'cli-method.yaml'))).toBe(true);
    rmSync(join(process.cwd(), '.upup'), { recursive: true, force: true });
  });

  test('new scaffolds a template then uninstall removes it', async () => {
    const created = await runSopCommand('new my-methodology');
    expect(created).toContain('✓ 已生成模板 my-methodology');
    const installed = join(tmpUpupHome, 'sops', 'my-methodology.yaml');
    expect(existsSync(installed)).toBe(true);

    const removed = await runSopCommand('uninstall my-methodology');
    expect(removed).toContain('✓ 已删除 my-methodology');
    expect(existsSync(installed)).toBe(false);

    const missing = await runSopCommand('uninstall my-methodology');
    expect(missing).toContain('未安装');
  });

  test('new renders an error instead of throwing for an invalid id', async () => {
    const out = await runSopCommand('new Bad/Id');
    expect(out).toContain('✗');
    expect(out).toContain('Invalid SOP id');
  });

  test('install renders an error instead of throwing for a missing source', async () => {
    const out = await runSopCommand('install ./definitely-missing.yaml');
    expect(out).toContain('✗');
    expect(out).toContain('source not found');
  });
});
