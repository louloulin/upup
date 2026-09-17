import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSopCommandCli } from './sop';

const SOP = `
id: cli-bootstrap-method
name: CLI Bootstrap Method
description: installed through the headless CLI
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

let tmpUpupHome: string;
let tmpSource: string;
let origUpupHome: string | undefined;

beforeEach(() => {
  tmpUpupHome = mkdtempSync(join(tmpdir(), 'upup-sop-cli-home-'));
  tmpSource = mkdtempSync(join(tmpdir(), 'upup-sop-cli-src-'));
  origUpupHome = process.env.UPUP_HOME;
  process.env.UPUP_HOME = tmpUpupHome;
});

afterEach(() => {
  rmSync(tmpUpupHome, { recursive: true, force: true });
  rmSync(tmpSource, { recursive: true, force: true });
  if (origUpupHome === undefined) delete process.env.UPUP_HOME;
  else process.env.UPUP_HOME = origUpupHome;
});

describe('runSopCommandCli', () => {
  test('list exits 0 and renders the catalog', async () => {
    const result = await runSopCommandCli({ args: ['list'] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('SOP Catalog');
    expect(result.output).toContain('graham');
  });

  test('install writes into $UPUP_HOME/sops', async () => {
    const path = join(tmpSource, 'cli-bootstrap-method.yaml');
    writeFileSync(path, SOP);
    const result = await runSopCommandCli({ args: ['install', path] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('✓ cli-bootstrap-method');
    expect(existsSync(join(tmpUpupHome, 'sops', 'cli-bootstrap-method.yaml'))).toBe(true);
  });

  test('a failing subcommand renders an error and still exits 0', async () => {
    const result = await runSopCommandCli({ args: ['install', './missing-sop.yaml'] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('source not found');
  });

  test('no args renders the catalog, matching the TUI default', async () => {
    const result = await runSopCommandCli({ args: [] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('SOP Catalog');
  });

  test('show without an id prints usage', async () => {
    const result = await runSopCommandCli({ args: ['show'] });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('用法: /sop show <id>');
  });
});
