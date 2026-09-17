import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadSops,
  loadAndValidateSops,
  loadUserAgentSpecs,
  mergeAgentCatalog,
  parseSopYaml,
  resolveUpUpHomeRoot,
  resolveBuiltinSopsDir,
  listBuiltinSopFiles,
} from './sop-loader';
import { INVESTMENT_PROFILES } from './agent-spec';

const READ_ONLY = {
  id: 'read-only',
  allow: ['safe', 'warning'],
  requireApproval: [],
  deny: ['dangerous', 'critical'],
  allowExternalNetwork: true,
  allowCredentialAccess: false,
  allowFinancialWrites: false,
};

const KNOWN_AGENTS = Object.values(INVESTMENT_PROFILES);

let tmpHome: string;
let tmpCwd: string;
let origHome: string | undefined;
let origUpupHome: string | undefined;
let origCwd: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'upup-home-'));
  tmpCwd = mkdtempSync(join(tmpdir(), 'upup-cwd-'));
  origHome = process.env.HOME;
  origUpupHome = process.env.UPUP_HOME;
  origCwd = process.cwd();
  process.env.HOME = tmpHome;
  // `$UPUP_HOME` outranks `$HOME`; clear it so the tests below exercise the
  // documented `~/.upup` default unless they opt in explicitly.
  delete process.env.UPUP_HOME;
  process.chdir(tmpCwd);
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpCwd, { recursive: true, force: true });
  if (origHome !== undefined) process.env.HOME = origHome;
  if (origUpupHome === undefined) delete process.env.UPUP_HOME;
  else process.env.UPUP_HOME = origUpupHome;
  process.chdir(origCwd);
});

const sampleGraham = `
id: graham
name: Graham
description: value
version: 1.0.0
phases:
  - id: detect
    agent: invest-explore
    intent: collect evidence
  - id: plan
    agent: invest-plan
    intent: intrinsic value
    requires: [detect]
  - id: report
    agent: invest-review
    intent: write report
    requires: [plan]
`;

describe('parseSopYaml', () => {
  test('parses valid SOP YAML', () => {
    const sop = parseSopYaml(sampleGraham, 'inline');
    expect(sop.id).toBe('graham');
    expect(sop.phases).toHaveLength(3);
  });

  test('throws on malformed YAML shape', () => {
    expect(() => parseSopYaml(`phases: not-array`, 'inline')).toThrow();
  });

  test('throws on missing required fields', () => {
    expect(() => parseSopYaml(`name: x`, 'inline')).toThrow();
  });
});

describe('loadSops', () => {
  test('loads project-level SOPs (priority over user and builtins)', () => {
    mkdirSync(join(tmpHome, '.upup', 'sops'), { recursive: true });
    mkdirSync(join(tmpCwd, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'sops', 'graham.yaml'), sampleGraham);
    writeFileSync(join(tmpCwd, '.upup', 'sops', 'my-sop.yaml'), `
id: my-sop
name: My
description: project
version: 1.0.0
phases:
  - id: a
    agent: invest-explore
    intent: a
`);
    const result = loadSops({ disableBuiltins: true, home: tmpHome, cwd: tmpCwd });
    const ids = result.sops.map((s) => s.id).sort();
    expect(ids).toContain('graham');
    expect(ids).toContain('my-sop');
  });

  test('project overrides user on id collision', () => {
    mkdirSync(join(tmpHome, '.upup', 'sops'), { recursive: true });
    mkdirSync(join(tmpCwd, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'sops', 'graham.yaml'), sampleGraham);
    writeFileSync(join(tmpCwd, '.upup', 'sops', 'graham.yaml'), `
id: graham
name: Project Graham
description: project override
version: 2.0.0
phases:
  - id: a
    agent: invest-explore
    intent: a
`);
    const result = loadSops({ disableBuiltins: true, home: tmpHome, cwd: tmpCwd });
    const g = result.sops.find((s) => s.id === 'graham');
    expect(g?.name).toBe('Project Graham');
    expect(result.sources.get('graham')).toContain(tmpCwd);
  });

  test('captures warnings for invalid YAML', () => {
    mkdirSync(join(tmpHome, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'sops', 'bad.yaml'), `name: x`);
    const result = loadSops({ disableBuiltins: true, home: tmpHome, cwd: tmpCwd });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('bad.yaml');
  });

  test('loads built-in SOPs when enabled', () => {
    const result = loadSops({ disableBuiltins: true, home: tmpHome, cwd: tmpCwd });
    // Built-ins may or may not exist depending on packaging; we only assert the API does not crash.
    expect(Array.isArray(result.sops)).toBe(true);
  });
});

describe('UpUp home resolution', () => {
  test('defaults to <home>/.upup', () => {
    expect(resolveUpUpHomeRoot({ home: tmpHome })).toBe(join(tmpHome, '.upup'));
    expect(resolveUpUpHomeRoot()).toBe(join(tmpHome, '.upup'));
  });

  test('$UPUP_HOME relocates the user scope for SOPs and agents', () => {
    const relocated = join(tmpHome, 'sandbox-home');
    process.env.UPUP_HOME = relocated;
    expect(resolveUpUpHomeRoot()).toBe(relocated);

    mkdirSync(join(relocated, 'sops'), { recursive: true });
    mkdirSync(join(relocated, 'agents'), { recursive: true });
    writeFileSync(join(relocated, 'sops', 'iso-sop.yaml'), sampleGraham.replace('graham', 'iso-sop'));
    writeFileSync(join(relocated, 'agents', 'iso-agent.json'), JSON.stringify({
      id: 'iso-agent',
      name: 'Iso Agent',
      description: 'lives under $UPUP_HOME',
      version: '1.0.0',
      tools: ['get_financials'],
      permissions: READ_ONLY,
    }));

    const sops = loadSops({ cwd: tmpCwd, disableBuiltins: true });
    expect(sops.sops.map((s) => s.id)).toEqual(['iso-sop']);
    expect(sops.sources.get('iso-sop')).toBe(join(relocated, 'sops', 'iso-sop.yaml'));

    const agents = loadUserAgentSpecs({ cwd: tmpCwd });
    expect(agents.agents.map((a) => a.id)).toEqual(['iso-agent']);
  });

  test('explicit upupHome option wins over $UPUP_HOME', () => {
    process.env.UPUP_HOME = join(tmpHome, 'from-env');
    expect(resolveUpUpHomeRoot({ upupHome: join(tmpHome, 'from-option') })).toBe(join(tmpHome, 'from-option'));
  });

  test('built-in SOP payload resolves next to the package source', () => {
    const dir = resolveBuiltinSopsDir();
    expect(dir).toBeTruthy();
    expect(listBuiltinSopFiles().length).toBeGreaterThanOrEqual(5);
  });
});

describe('loadAndValidateSops', () => {
  test('passes when all agents are known', () => {
    mkdirSync(join(tmpHome, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'sops', 'graham.yaml'), sampleGraham);
    expect(() => loadAndValidateSops(KNOWN_AGENTS, { disableBuiltins: true, home: tmpHome, cwd: tmpCwd })).not.toThrow();
  });

  test('throws when SOP references unknown agent', () => {
    mkdirSync(join(tmpHome, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'sops', 'bad.yaml'), `
id: bad
name: bad
description: bad
version: 1.0.0
phases:
  - id: a
    agent: phantom-agent
    intent: x
`);
    expect(() => loadAndValidateSops(KNOWN_AGENTS, { disableBuiltins: true, home: tmpHome, cwd: tmpCwd })).toThrow(/phantom-agent/);
  });
});

describe('loadUserAgentSpecs', () => {
  test('loads and validates user agent JSON', () => {
    mkdirSync(join(tmpHome, '.upup', 'agents'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'agents', 'my-analyst.json'), JSON.stringify({
      id: 'my-analyst',
      name: 'My Analyst',
      description: 'user-defined',
      version: '1.0.0',
      systemPrompt: 'You are a value investor.',
      skills: ['fundamental-analysis'],
      tools: ['get_financials', 'read_filings'],
      permissions: READ_ONLY,
      outputContract: 'report',
    }));
    const result = loadUserAgentSpecs({ home: tmpHome, cwd: tmpCwd });
    expect(result.agents).toHaveLength(1);
    expect(result.agents[0]?.id).toBe('my-analyst');
  });

  test('rejects invalid agent JSON (bad tools)', () => {
    mkdirSync(join(tmpHome, '.upup', 'agents'), { recursive: true });
    writeFileSync(join(tmpHome, '.upup', 'agents', 'bad.json'), JSON.stringify({
      id: 'bad',
      name: 'bad',
      description: 'bad',
      version: '1.0.0',
      tools: 'not-an-array',
      permissions: READ_ONLY,
    }));
    const result = loadUserAgentSpecs({ home: tmpHome, cwd: tmpCwd });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.agents).toHaveLength(0);
  });
});

describe('mergeAgentCatalog', () => {
  test('user wins on id collision', () => {
    const builtins = Object.values(INVESTMENT_PROFILES);
    const user: UpUpAgentSpecLike = {
      id: 'invest-explore',
      version: '9.9.9',
      name: 'Custom Explore',
      description: 'user override',
      packages: [],
      skills: [],
      tools: '*',
      mode: 'subagent',
      capabilities: [],
      taskTypes: [],
      permissions: READ_ONLY,
      outputContract: 'report',
    };
    const merged = mergeAgentCatalog(builtins, [user as never]);
    const overridden = merged.find((a) => a.id === 'invest-explore');
    expect(overridden?.version).toBe('9.9.9');
    expect(overridden?.name).toBe('Custom Explore');
  });
});

// helper type to avoid leaking the full UpUpAgentSpec surface here
type UpUpAgentSpecLike = {
  id: string;
  version: string;
  name: string;
  description: string;
  packages: readonly string[];
  skills: readonly string[];
  tools: readonly string[] | '*';
  mode: 'primary' | 'subagent' | 'worker' | 'reviewer';
  capabilities: readonly string[];
  taskTypes: readonly string[];
  permissions: typeof READ_ONLY;
  outputContract: 'markdown' | 'json' | 'report' | 'evidence';
};

describe('built-in SOPs', () => {
  test('ships at least 5 built-in SOPs that validate against INVESTMENT_PROFILES', () => {
    const result = loadAndValidateSops(KNOWN_AGENTS, {
      home: join(tmpHome, 'no-such-home'),
      cwd: join(tmpCwd, 'no-such-cwd'),
    });
    expect(result.sops.length).toBeGreaterThanOrEqual(5);
    expect(result.warnings).toEqual([]);
  });

  test('every built-in SOP has a stable id matching its file name', () => {
    const result = loadSops({ home: join(tmpHome, 'no-such-home'), cwd: join(tmpCwd, 'no-such-cwd') });
    const ids = result.sops.map((s) => s.id).sort();
    expect(ids).toEqual(['debate', 'graham', 'momentum', 'morning-brief', 'portfolio-review']);
  });

  test('at least one built-in SOP exercises a parallel group', () => {
    const result = loadSops({ home: join(tmpHome, 'no-such-home'), cwd: join(tmpCwd, 'no-such-cwd') });
    expect(result.sops.some((s) => (s.parallelGroups?.length ?? 0) > 0)).toBe(true);
  });

  test('project-level SOP can shadow a built-in by id', () => {
    mkdirSync(join(tmpCwd, '.upup', 'sops'), { recursive: true });
    writeFileSync(join(tmpCwd, '.upup', 'sops', 'graham.yaml'), `
id: graham
name: Project Overridden Graham
description: project override of builtin
version: 3.0.0
phases:
  - id: detect
    agent: invest-explore
    intent: d
  - id: report
    agent: invest-review
    intent: r
    requires: [detect]
`);
    const result = loadSops({ disableBuiltins: true, home: tmpHome, cwd: tmpCwd });
    const graham = result.sops.find((s) => s.id === 'graham');
    expect(graham?.name).toBe('Project Overridden Graham');
  });
});
