import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  displaySopPath,
  installSops,
  installedSopPath,
  readSopSource,
  scaffoldSop,
  sopInstallTargets,
  uninstallSop,
} from './sop-install';
import { loadSops, loadAndValidateSops, resolveUpUpHomeRoot } from './sop-loader';
import { INVESTMENT_PROFILES } from './agent-spec';

const VALID_SOP = `
id: my-method
name: My Method
description: a user methodology
version: 1.0.0
phases:
  - id: detect
    agent: invest-explore
    intent: gather evidence
  - id: report
    agent: invest-review
    intent: report
    requires: [detect]
`;

let tmpHome: string;
let tmpCwd: string;
let tmpSource: string;
let origHome: string | undefined;
let origUpupHome: string | undefined;
let origCwd: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'upup-install-home-'));
  tmpCwd = mkdtempSync(join(tmpdir(), 'upup-install-cwd-'));
  tmpSource = mkdtempSync(join(tmpdir(), 'upup-install-src-'));
  origHome = process.env.HOME;
  origUpupHome = process.env.UPUP_HOME;
  origCwd = process.cwd();
  process.env.HOME = tmpHome;
  delete process.env.UPUP_HOME;
  process.chdir(tmpCwd);
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpCwd, { recursive: true, force: true });
  rmSync(tmpSource, { recursive: true, force: true });
  if (origHome !== undefined) process.env.HOME = origHome;
  if (origUpupHome === undefined) delete process.env.UPUP_HOME;
  else process.env.UPUP_HOME = origUpupHome;
  process.chdir(origCwd);
});

function writeSource(name: string, content: string): string {
  const path = join(tmpSource, name);
  writeFileSync(path, content);
  return path;
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status });
}

describe('sopInstallTargets', () => {
  test('defaults to <home>/.upup/sops and <cwd>/.upup/sops', () => {
    const targets = sopInstallTargets({ home: tmpHome, cwd: tmpCwd });
    expect(targets.userDir).toBe(join(tmpHome, '.upup', 'sops'));
    expect(targets.projectDir).toBe(join(tmpCwd, '.upup', 'sops'));
    expect(targets.builtinDir).toBeTruthy();
  });

  test('$UPUP_HOME relocates the user install root', () => {
    process.env.UPUP_HOME = join(tmpHome, 'relocated');
    expect(resolveUpUpHomeRoot()).toBe(join(tmpHome, 'relocated'));
    expect(sopInstallTargets({ cwd: tmpCwd }).userDir).toBe(join(tmpHome, 'relocated', 'sops'));
  });
});

describe('installSops', () => {
  test('installs a local YAML into ~/.upup/sops', async () => {
    const result = await installSops(writeSource('my-method.yaml', VALID_SOP), { home: tmpHome, cwd: tmpCwd });
    const dest = join(tmpHome, '.upup', 'sops', 'my-method.yaml');
    expect(result.installed.map((r) => r.id)).toEqual(['my-method']);
    expect(result.targetDir).toBe(join(tmpHome, '.upup', 'sops'));
    expect(existsSync(dest)).toBe(true);
    expect(readFileSync(dest, 'utf-8')).toBe(VALID_SOP);
  });

  test('honours $UPUP_HOME without an explicit home option', async () => {
    const relocated = join(tmpHome, 'iso');
    process.env.UPUP_HOME = relocated;
    const result = await installSops(writeSource('my-method.yaml', VALID_SOP), { cwd: tmpCwd });
    expect(result.targetDir).toBe(join(relocated, 'sops'));
    expect(existsSync(join(relocated, 'sops', 'my-method.yaml'))).toBe(true);
    // The default ~/.upup must stay untouched when UPUP_HOME is set.
    expect(existsSync(join(tmpHome, '.upup', 'sops'))).toBe(false);
  });

  test('project scope writes into <cwd>/.upup/sops', async () => {
    const result = await installSops(writeSource('my-method.yaml', VALID_SOP), {
      home: tmpHome,
      cwd: tmpCwd,
      scope: 'project',
    });
    expect(result.targetDir).toBe(join(tmpCwd, '.upup', 'sops'));
    expect(existsSync(join(tmpCwd, '.upup', 'sops', 'my-method.yaml'))).toBe(true);
    expect(existsSync(join(tmpHome, '.upup', 'sops', 'my-method.yaml'))).toBe(false);
  });

  test('installs every YAML in a directory', async () => {
    writeSource('a.yaml', VALID_SOP);
    writeSource('b.yaml', VALID_SOP.replace('my-method', 'second-method'));
    writeSource('notes.md', 'ignored');
    const result = await installSops(tmpSource, { home: tmpHome, cwd: tmpCwd });
    expect(result.installed.map((r) => r.id).sort()).toEqual(['my-method', 'second-method']);
    expect(existsSync(join(tmpHome, '.upup', 'sops', 'notes.md'))).toBe(false);
  });

  test('copies a built-in SOP so the user can edit it', async () => {
    const result = await installSops('builtin:graham', { home: tmpHome, cwd: tmpCwd });
    expect(result.installed[0]?.id).toBe('graham');
    expect(result.installed[0]?.source).toBe('builtin:graham');
    expect(existsSync(join(tmpHome, '.upup', 'sops', 'graham.yaml'))).toBe(true);
  });

  test('accepts a bare built-in id shorthand', async () => {
    const result = await installSops('momentum', { home: tmpHome, cwd: tmpCwd });
    expect(result.installed[0]?.id).toBe('momentum');
  });

  test('downloads a remote SOP through fetch', async () => {
    let requested: string | undefined;
    const result = await installSops('https://example.com/sops/remote.yaml', {
      home: tmpHome,
      cwd: tmpCwd,
      fetchImpl: async (input) => {
        requested = String(input);
        return jsonResponse(VALID_SOP);
      },
    });
    expect(requested).toBe('https://example.com/sops/remote.yaml');
    expect(result.installed[0]?.id).toBe('my-method');
    expect(existsSync(join(tmpHome, '.upup', 'sops', 'my-method.yaml'))).toBe(true);
  });

  test('fails closed when the download fails', async () => {
    await expect(
      installSops('https://example.com/missing.yaml', {
        home: tmpHome,
        cwd: tmpCwd,
        fetchImpl: async () => jsonResponse('nope', 404),
      }),
    ).rejects.toThrow(/HTTP 404/);
    expect(existsSync(join(tmpHome, '.upup', 'sops'))).toBe(false);
  });

  test('rejects an invalid SOP before writing anything', async () => {
    const bad = writeSource('bad.yaml', `
id: bad
name: bad
description: references an unknown agent
version: 1.0.0
phases:
  - id: a
    agent: phantom-agent
    intent: x
`);
    await expect(installSops(bad, { home: tmpHome, cwd: tmpCwd })).rejects.toThrow(/phantom-agent/);
    expect(existsSync(join(tmpHome, '.upup', 'sops'))).toBe(false);
  });

  test('skips existing files unless force is set', async () => {
    const path = writeSource('my-method.yaml', VALID_SOP);
    await installSops(path, { home: tmpHome, cwd: tmpCwd });
    const second = await installSops(path, { home: tmpHome, cwd: tmpCwd });
    expect(second.installed).toHaveLength(0);
    expect(second.skipped).toEqual(['my-method']);

    writeSource('my-method.yaml', VALID_SOP.replace('My Method', 'Renamed Method'));
    const forced = await installSops(path, { home: tmpHome, cwd: tmpCwd, force: true });
    expect(forced.installed).toHaveLength(1);
    expect(readFileSync(join(tmpHome, '.upup', 'sops', 'my-method.yaml'), 'utf-8')).toContain('Renamed Method');
  });

  test('installs into a directory discoverable by loadSops', async () => {
    await installSops(writeSource('my-method.yaml', VALID_SOP), { home: tmpHome, cwd: tmpCwd });
    const loaded = loadSops({ home: tmpHome, cwd: tmpCwd, disableBuiltins: true });
    expect(loaded.sops.map((s) => s.id)).toEqual(['my-method']);
    expect(loaded.sources.get('my-method')).toContain(join(tmpHome, '.upup', 'sops'));
    expect(() => loadAndValidateSops(Object.values(INVESTMENT_PROFILES), { home: tmpHome, cwd: tmpCwd, disableBuiltins: true })).not.toThrow();
  });
});

describe('scaffoldSop', () => {
  test('writes a template that validates and loads', () => {
    const result = scaffoldSop('my-methodology', { home: tmpHome, cwd: tmpCwd });
    expect(result.installed[0]?.id).toBe('my-methodology');
    expect(() => loadAndValidateSops(Object.values(INVESTMENT_PROFILES), {
      home: tmpHome,
      cwd: tmpCwd,
      disableBuiltins: true,
    })).not.toThrow();
    expect(installedSopPath('my-methodology', { home: tmpHome, cwd: tmpCwd })).toBe(
      join(tmpHome, '.upup', 'sops', 'my-methodology.yaml'),
    );
  });

  test('rejects an invalid id', () => {
    expect(() => scaffoldSop('../escape', { home: tmpHome, cwd: tmpCwd })).toThrow(/Invalid SOP id/);
  });
});

describe('uninstallSop', () => {
  test('removes an installed SOP and reports not-found afterwards', async () => {
    await installSops(writeSource('my-method.yaml', VALID_SOP), { home: tmpHome, cwd: tmpCwd });
    const removed = uninstallSop('my-method', { home: tmpHome, cwd: tmpCwd });
    expect(removed.removed).toBe(true);
    expect(existsSync(removed.path)).toBe(false);
    const again = uninstallSop('my-method', { home: tmpHome, cwd: tmpCwd });
    expect(again.removed).toBe(false);
    expect(again.reason).toBe('not-found');
  });

  test('never removes built-in payloads', () => {
    const result = uninstallSop('graham', {
      home: join(tmpHome, 'no-such-home'),
      cwd: join(tmpCwd, 'no-such-cwd'),
    });
    expect(result.removed).toBe(false);
    expect(readFileSync(join(sopInstallTargets({ home: tmpHome, cwd: tmpCwd }).builtinDir ?? '', 'graham.yaml'), 'utf-8')).toContain('id: graham');
  });

  test('rejects a traversal id', () => {
    const result = uninstallSop('../../etc/passwd', { home: tmpHome, cwd: tmpCwd });
    expect(result.reason).toBe('invalid-id');
  });
});

describe('readSopSource', () => {
  test('throws when the source is missing', async () => {
    await expect(readSopSource('./nope.yaml', { cwd: tmpCwd })).rejects.toThrow(/source not found/);
  });

  test('throws when a directory has no YAML', async () => {
    mkdirSync(join(tmpSource, 'nested'));
    await expect(readSopSource(join(tmpSource, 'nested'), { cwd: tmpCwd })).rejects.toThrow(/No SOP YAML/);
  });

  test('rejects a non-YAML file', async () => {
    const path = writeSource('readme.md', '# nope');
    await expect(readSopSource(path, { cwd: tmpCwd })).rejects.toThrow(/must be a \.yaml\/\.yml file/);
  });
});

describe('displaySopPath', () => {
  test('renders user-scope paths relative to the UpUp home root', () => {
    expect(displaySopPath(join(tmpHome, '.upup', 'sops', 'x.yaml'), { home: tmpHome })).toBe('~/.upup/sops/x.yaml');
    expect(displaySopPath('/elsewhere/x.yaml', { home: tmpHome })).toBe('/elsewhere/x.yaml');
  });
});
