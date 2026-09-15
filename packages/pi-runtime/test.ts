import { describe, expect, test } from 'bun:test';
import {
  PI_CAPABILITIES_CONTRACT,
  PI_CAPABILITY_CATALOG,
  PI_EVENTS_CONTRACT,
  createPiCapabilityContext,
  classifyPiSideEffect,
  createPiSideEffectPolicyExtension,
  serializeAgentSpec,
  toCanonicalAgentEvent,
  validateAgentSpec,
  validatePiPackageManifest,
  validatePiCapabilityCatalog,
  type UpUpAgentSpec,
} from './src/index';

const spec: UpUpAgentSpec = {
  id: 'runtime-test', version: '1.0.0', name: 'Runtime test', description: 'Contract test', tools: ['quote'], mode: 'primary', capabilities: ['market-data'], taskTypes: ['research'],
  permissions: { id: 'read-only', allow: ['safe'], requireApproval: [], deny: ['dangerous', 'critical'], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false },
};

describe('pi-runtime contracts', () => {
  test('validates and serializes agent specs', () => {
    validateAgentSpec(spec);
    expect(JSON.parse(serializeAgentSpec(spec)).id).toBe('runtime-test');
    expect(() => validateAgentSpec({ ...spec, id: 'Bad ID' })).toThrow('Invalid agent id');
  });
  test('preserves canonical event contract and event data', () => {
    const event = toCanonicalAgentEvent({ type: 'text_delta', sessionId: 's1', delta: 'hi' });
    expect(event).toEqual({ contract: PI_EVENTS_CONTRACT, type: 'text_delta', sessionId: 's1', delta: 'hi' });
  });
  test('fails closed for missing and mismatched capabilities', async () => {
    let disposed = 0;
    const context = createPiCapabilityContext({ sessionId: 's1', capabilities: { quote: { version: '1.0.0', value: { quote: true }, dispose: () => { disposed += 1; } } } });
    expect(context.contract).toBe(PI_CAPABILITIES_CONTRACT);
    expect(context.get('quote', '1.0.0')).toEqual({ quote: true });
    expect(() => context.get('missing')).toThrow('unavailable');
    expect(() => context.get('quote', '2.0.0')).toThrow('version mismatch');
    await context.dispose();
    expect(disposed).toBe(1);
    expect(() => context.get('quote')).toThrow('disposed');
    expect(context.catalog()).toEqual([]);
  });
  test('validates the serializable capability catalog and lifecycle isolation', async () => {
    validatePiCapabilityCatalog(PI_CAPABILITY_CATALOG);
    const context = createPiCapabilityContext({ sessionId: 'catalog-session', catalog: PI_CAPABILITY_CATALOG });
    expect(context.describe('storage.session')).toMatchObject({ scope: 'session', trust: { mode: 'builtin', filesystem: true }, lifecycle: { scope: 'session' } });
    expect(() => validatePiCapabilityCatalog([{ ...PI_CAPABILITY_CATALOG[0]!, name: 'bad-sandbox', trust: { mode: 'sandboxed', credentials: true } }])).toThrow('credentials');
    expect(() => validatePiCapabilityCatalog([{ ...PI_CAPABILITY_CATALOG[0]!, name: 'bad-scope', lifecycle: { scope: 'runtime' } }])).toThrow('scope mismatch');
    await context.dispose();
    expect(context.describe('storage.session')).toBeUndefined();
  });
  test('validates package manifest resource uniqueness and versions', () => {
    validatePiPackageManifest({ name: '@upup/pi-runtime', version: '0.1.0', source: 'builtin:upup', resources: { extensions: ['./extensions'], skills: ['./skills'], prompts: ['./prompts'], workflows: ['./workflows'], policies: ['./policies'], evals: ['./evals'] } });
    expect(() => validatePiPackageManifest({ name: '@upup/pi-runtime', version: '0.1.0', source: '', resources: { extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] } })).toThrow('source');
  });
  test('validates manifest-owned side-effect declarations', () => {
    const base = { name: '@upup/pi-runtime', version: '0.1.0', source: 'builtin:upup', tools: ['write_file', 'place_trade_order'], resources: { extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] } } as const;
    validatePiPackageManifest({ ...base, sideEffects: [{ tools: ['write_file'], effect: 'filesystem-write', safetyLevel: 'warning' }] });
    expect(() => validatePiPackageManifest({ ...base, sideEffects: [{ tools: ['missing_tool'], effect: 'filesystem-write', safetyLevel: 'warning' }] })).toThrow('must be declared in tools');
    expect(() => validatePiPackageManifest({ ...base, sideEffects: [{ tools: ['write_file', 'write_file'], effect: 'filesystem-write', safetyLevel: 'warning' }] })).toThrow('contain duplicate tools');
  });
  test('requires disposal for process-scoped packages and rejects sandbox credentials', () => {
    const base = { name: '@upup/pi-runtime', version: '0.1.0', source: 'builtin:upup', resources: { extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] } } as const;
    expect(() => validatePiPackageManifest({ ...base, lifecycle: { scope: 'process' } })).toThrow('dispose lifecycle');
    expect(() => validatePiPackageManifest({ ...base, trust: { mode: 'sandboxed', credentials: true } })).toThrow('credentials');
  });
  test('rejects duplicate capabilities and malformed lifecycle entrypoints', () => {
    const base = { name: '@upup/pi-runtime', version: '0.1.0', source: 'builtin:upup', resources: { extensions: [], skills: [], prompts: [], workflows: [], policies: [], evals: [] } } as const;
    expect(() => validatePiPackageManifest({ ...base, capabilities: [{ name: 'quote', version: '1.0.0' }, { name: 'quote', version: '1.0.0' }] })).toThrow('capabilities contain duplicates');
    expect(() => validatePiPackageManifest({ ...base, lifecycle: { scope: 'session', dispose: 'dispose' } })).toThrow('module#export');
  });
  test('classifies side effects and blocks non-interactive execution with a session audit', async () => {
    const declarations = [{ tools: ['place_trade_order'], effect: 'financial-write' as const, safetyLevel: 'critical' as const }];
    expect(classifyPiSideEffect('place_trade_order', declarations)).toEqual(declarations[0]);
    expect(classifyPiSideEffect('read_file', declarations)).toBeUndefined();
    const audits: unknown[] = [];
    const extension = createPiSideEffectPolicyExtension({ spec, sessionId: 'policy-session', declarations });
    if (typeof extension === 'function') throw new Error('expected a named InlineExtension');
    const registered: Array<(event: { toolName: string; toolCallId: string }, context: { hasUI: boolean; sessionManager: { appendCustomEntry: (type: string, data: unknown) => void } }) => Promise<unknown>> = [];
    extension.factory({
      on: (_event: string, handler: (event: never, context: never) => Promise<unknown>) => registered.push(handler as never),
    } as never);
    const blocked = await registered[0]!({ toolName: 'place_trade_order', toolCallId: 'policy-call' }, { hasUI: false, sessionManager: { appendCustomEntry: (_type, data) => audits.push(data) } });
    expect(blocked).toMatchObject({ block: true });
    expect(audits[0]).toMatchObject({ contract: 'upup.pi.side-effect-policy.v1', decision: 'denied' });
  });
});

import {
  emptyFinanceSessionContext,
  mergeFinanceSessionContext,
  serializeFinanceSessionContext,
  FINANCE_CONTEXT_ENTRY_TYPE,
  type UpUpFinanceSessionContext,
} from './src/index';

describe('pi-runtime finance session context', () => {
  test('FINANCE_CONTEXT_ENTRY_TYPE is the canonical custom entry name', () => {
    expect(FINANCE_CONTEXT_ENTRY_TYPE).toBe('upup_finance_context');
  });

  test('emptyFinanceSessionContext returns the canonical empty shape', () => {
    expect(emptyFinanceSessionContext()).toEqual({
      assumptions: {},
      risks: [],
      evidence: [],
      unfinishedPhases: [],
    });
  });

  test('mergeFinanceSessionContext only updates provided fields', () => {
    const base: UpUpFinanceSessionContext = {
      ...emptyFinanceSessionContext(),
      ticker: '600519.SH',
      risks: ['fx-risk'],
    };
    const merged = mergeFinanceSessionContext(base, { market: 'A-share' });
    expect(merged.ticker).toBe('600519.SH');
    expect(merged.market).toBe('A-share');
    expect(merged.risks).toEqual(['fx-risk']);
  });

  test('mergeFinanceSessionContext deduplicates risks and unfinishedPhases', () => {
    const merged = mergeFinanceSessionContext(emptyFinanceSessionContext(), {
      risks: ['r1', 'r2', 'r1'],
      unfinishedPhases: ['detect', 'plan', 'detect'],
    });
    expect(merged.risks).toEqual(['r1', 'r2']);
    expect(merged.unfinishedPhases).toEqual(['detect', 'plan']);
  });

  test('mergeFinanceSessionContext merges assumptions additively', () => {
    const base: UpUpFinanceSessionContext = {
      ...emptyFinanceSessionContext(),
      assumptions: { rate: 0.05, growth: 0.10 },
    };
    const merged = mergeFinanceSessionContext(base, { assumptions: { growth: 0.15, tax: 0.20 } });
    expect(merged.assumptions).toEqual({ rate: 0.05, growth: 0.15, tax: 0.20 });
  });

  test('serializeFinanceSessionContext produces a JSON envelope with schema=1 and finance domain', () => {
    const ctx: UpUpFinanceSessionContext = {
      ...emptyFinanceSessionContext(),
      ticker: '600519.SH',
      market: 'A-share',
      asOf: '2026-09-14',
      risks: ['fx-risk'],
    };
    const json = serializeFinanceSessionContext(ctx, 'token-limit', 'preserve investment context');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.schema).toBe(1);
    expect(parsed.domain).toBe('finance');
    expect(parsed.ticker).toBe('600519.SH');
    expect(parsed.market).toBe('A-share');
    expect(parsed.asOf).toBe('2026-09-14');
    expect(parsed.risks).toEqual(['fx-risk']);
    expect(parsed.compactionReason).toBe('token-limit');
    expect(parsed.customInstructions).toBe('preserve investment context');
  });

  test('serializeFinanceSessionContext handles missing optional fields as null', () => {
    const json = serializeFinanceSessionContext(emptyFinanceSessionContext(), 'manual');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.ticker).toBeNull();
    expect(parsed.market).toBeNull();
    expect(parsed.asOf).toBeNull();
    expect(parsed.customInstructions).toBeNull();
  });
});

import { createFinanceSessionExtension, emptyFinanceSessionContext } from './src/index';
import type { FinanceSessionExtensionContext } from './src/index';

describe('pi-runtime finance session extension', () => {
  test('createFinanceSessionExtension produces a hidden InlineExtension named upup-finance-session-policy', () => {
    const ctx: FinanceSessionExtensionContext = { current: emptyFinanceSessionContext() };
    const ext = createFinanceSessionExtension(ctx);
    expect(ext.name).toBe('upup-finance-session-policy');
    expect(ext.hidden).toBe(true);
    expect(typeof ext.factory).toBe('function');
  });

  test('extension factory wires the session_before_compact handler that serializes the current context', async () => {
    const ctx: FinanceSessionExtensionContext = {
      current: {
        ...emptyFinanceSessionContext(),
        ticker: '600519.SH',
        market: 'A-share',
        asOf: '2026-09-14',
      },
    };
    const ext = createFinanceSessionExtension(ctx);
    const handlers: Array<(event: unknown) => Promise<unknown>> = [];
    const fakePi = {
      on(event: string, handler: (input: unknown) => Promise<unknown>) {
        if (event === 'session_before_compact') handlers.push(handler);
      },
    };
    ext.factory(fakePi as never);
    expect(handlers.length).toBe(1);
    const event = {
      reason: 'token-limit',
      customInstructions: 'preserve investment context',
      preparation: {
        firstKeptEntryId: 'entry-1',
        tokensBefore: 12345,
      },
    };
    const result = await handlers[0]!(event);
    expect(result).toMatchObject({
      compaction: {
        firstKeptEntryId: 'entry-1',
        tokensBefore: 12345,
        details: { domain: 'investment', schema: 1 },
      },
    });
    const summary = (result as { compaction: { summary: string } }).compaction.summary;
    const parsed = JSON.parse(summary) as Record<string, unknown>;
    expect(parsed.ticker).toBe('600519.SH');
    expect(parsed.market).toBe('A-share');
    expect(parsed.compactionReason).toBe('token-limit');
    expect(parsed.customInstructions).toBe('preserve investment context');
  });

  test('extension captures the live context ref (mutations are reflected in subsequent compactions)', async () => {
    const ctx: FinanceSessionExtensionContext = { current: emptyFinanceSessionContext() };
    const ext = createFinanceSessionExtension(ctx);
    const handlers: Array<(event: unknown) => Promise<unknown>> = [];
    ext.factory({ on: (_e: string, h: (input: unknown) => Promise<unknown>) => handlers.push(h) } as never);
    const event = { reason: 'r', preparation: { firstKeptEntryId: 'a', tokensBefore: 1 } };
    await handlers[0]!(event);
    ctx.current.ticker = 'updated';
    const second = await handlers[0]!(event);
    const parsed = JSON.parse((second as { compaction: { summary: string } }).compaction.summary) as Record<string, unknown>;
    expect(parsed.ticker).toBe('updated');
  });
});
