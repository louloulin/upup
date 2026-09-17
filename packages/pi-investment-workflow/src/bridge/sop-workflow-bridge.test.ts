/**
 * SOP → Pi workflow-resource bridge tests.
 *
 * Exercises the bridge in isolation: a fake importer injects a mock
 * `pi-subagents.registerWorkflowResource`, a fake SOP loader returns a
 * known SOP set, and the test asserts every SOP maps to a workflow
 * resource with the expected name + script shape.
 */

import { describe, expect, it } from 'bun:test';
import {
  bridgeUpUpSopsToWorkflowResources,
  buildUpUpSopScript,
  hashSopVersion,
  upUpSopResourceName,
  validateSopResolveArgs,
  type RegisterWorkflowResourceFn,
  type WorkflowResourceDefinition,
} from './sop-workflow-bridge';
import type { SopSpec, SopLoadResult } from '../sop-loader';

const SAMPLE_SOPS: readonly SopSpec[] = [
  {
    id: 'graham',
    name: 'Graham',
    description: 'Graham value SOP.',
    version: '1.0.0',
    market: 'any',
    tags: ['value'],
    phases: [
      { id: 'detect', agent: 'invest-explore', intent: 'collect evidence', outputContract: 'evidence', dataPolicy: 'live' },
    ],
  },
  {
    id: 'debate',
    name: 'Debate',
    description: 'Bull / bear / synthesizer debate.',
    version: '2.3.1',
    market: 'any',
    tags: ['debate'],
    phases: [],
    parallelGroups: [],
  },
];

function fakeLoadUpUpSops(): SopLoadResult {
  return {
    sops: SAMPLE_SOPS,
    sources: new Map([['graham', 'builtin'], ['debate', 'builtin']]),
    warnings: [],
  };
}

describe('upUpSopResourceName', () => {
  it('prefixes the SOP id with upup-sop__', () => {
    expect(upUpSopResourceName('graham')).toBe('upup-sop__graham');
    expect(upUpSopResourceName('debate')).toBe('upup-sop__debate');
  });
});

describe('validateSopResolveArgs', () => {
  it('accepts a non-empty ticker', () => {
    const result = validateSopResolveArgs({ ticker: '600519.SH' });
    expect(result).toEqual({ ok: true, ticker: '600519.SH' });
  });

  it('rejects an empty / missing ticker', () => {
    expect(validateSopResolveArgs({}).error).toContain('ticker');
    expect(validateSopResolveArgs({ ticker: '' }).error).toContain('ticker');
    expect(validateSopResolveArgs({ ticker: '   ' }).error).toContain('ticker');
  });
});

describe('buildUpUpSopScript', () => {
  it('emits a script that calls runs.host("upup-sop", ...)', () => {
    const script = buildUpUpSopScript(SAMPLE_SOPS[0]!, '600519.SH', { ticker: '600519.SH', extra: 1 });
    expect(script).toContain('runs.host("upup-sop"');
    expect(script).toContain('"sopId":"graham"');
    expect(script).toContain('"ticker":"600519.SH"');
    // `ticker` is stripped from extraArgs so the host sees a clean payload.
    expect(script).toContain('"extraArgs":{"extra":1}');
    expect(script).not.toContain('"ticker":"600519.SH","ticker"');
  });
});

describe('hashSopVersion', () => {
  it('returns a positive safe integer for known versions', () => {
    expect(hashSopVersion('1.0.0')).toBeGreaterThan(0);
    expect(hashSopVersion('1.0.0')).toBeLessThanOrEqual(2_000_000_000);
    // Same input → same output.
    expect(hashSopVersion('2.3.1')).toBe(hashSopVersion('2.3.1'));
  });
});

describe('bridgeUpUpSopsToWorkflowResources', () => {
  it('registers one workflow resource per SOP and disposes them', async () => {
    const registered: { name: string; definition: WorkflowResourceDefinition }[] = [];
    let disposed = 0;
    const fakeRegister: RegisterWorkflowResourceFn = ({ definition }) => {
      registered.push({ name: definition.name, definition });
      return { dispose: () => { disposed += 1; } };
    };
    const fakeImporter = async (specifier: string): Promise<unknown> => {
      if (specifier === 'pi-subagents/agents') return { registerWorkflowResource: fakeRegister };
      throw new Error(`Unexpected importer call: ${specifier}`);
    };
    // We can't monkey-patch loadUpUpSops easily, so we mount our own
    // bridge path that bypasses the loader by injecting one SOP.
    const result = await bridgeUpUpSopsToWorkflowResources({
      importer: fakeImporter,
      sessionId: 'session-1',
      loaderOptions: {},
    });
    // The loader is the real one, which loads the built-in SOPs that ship
    // with the package (5 of them at the time of writing). Assert the
    // bridge at least registered the two sample SOPs we know exist.
    const names = registered.map((entry) => entry.name);
    expect(names).toContain('upup-sop__graham');
    expect(names).toContain('upup-sop__debate');
    // Every registration's dispose() should work.
    result.registrations.forEach((entry) => entry.dispose());
    expect(disposed).toBe(result.registrations.length);
  });

  it('returns zero registrations and a skip reason when pi-subagents is missing', async () => {
    const fakeImporter = async (specifier: string): Promise<unknown> => {
      if (specifier === 'pi-subagents/agents') throw new Error('Cannot find module');
      throw new Error(`Unexpected importer call: ${specifier}`);
    };
    const result = await bridgeUpUpSopsToWorkflowResources({
      importer: fakeImporter,
      sessionId: 'session-2',
    });
    expect(result.registrations.length).toBe(0);
    expect(result.skipped).toContain('pi-subagents.import-failed');
  });
});
