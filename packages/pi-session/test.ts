import { describe, expect, test } from 'bun:test';
import { PiSessionAdapter } from './src/index';
import {
  emptyFinanceSessionContext,
  type PiCapabilityContext,
  type PiPackageContracts,
  type UpUpAgentSpec,
} from '@upup/pi-runtime';
import type { AgentSession } from '@earendil-works/pi-coding-agent';

const spec: UpUpAgentSpec = {
  id: 'session-test',
  version: '1.0.0',
  name: 'Session test',
  description: 'Session adapter contract test',
  tools: '*',
  mode: 'primary',
  capabilities: ['test'],
  taskTypes: ['test'],
  permissions: {
    id: 'read-only',
    allow: ['safe'],
    requireApproval: [],
    deny: ['dangerous', 'critical'],
    allowExternalNetwork: false,
    allowCredentialAccess: false,
    allowFinancialWrites: false,
  },
};

function createFakeSession() {
  let listener: ((event: never) => void) | undefined;
  let disposed = false;
  let abortCalls = 0;
  const entries: Array<{ type: string; customType?: string; data?: unknown }> = [];
  const sessionManager = {
    getSessionId: () => 'session-test-id',
    getSessionFile: () => '/tmp/session-test.jsonl',
    getHeader: () => ({ id: 'session-test-id', timestamp: '2026-09-14T00:00:00.000Z', cwd: '/tmp' }),
    getTree: () => [],
    getLeafId: () => undefined,
    createBranchedSession: () => 'branched-session',
    appendCustomEntry: (customType: string, data?: unknown) => entries.push({ type: 'custom', customType, data }),
    appendSessionInfo: (name: string) => entries.push({ type: 'session_info', data: name }),
    getEntries: () => entries,
    getCwd: () => '/tmp',
  };
  const fake = {
    sessionManager,
    subscribe: (next: (event: never) => void) => {
      listener = next;
      return () => { listener = undefined; };
    },
    prompt: async () => undefined,
    steer: async () => undefined,
    followUp: async () => undefined,
    abort: async () => { abortCalls += 1; },
    waitForIdle: async () => undefined,
    compact: async () => undefined,
    exportToJsonl: () => '/tmp/session-test.jsonl',
    exportToHtml: async () => '/tmp/session-test.html',
    getToolDefinition: () => undefined,
    agent: { state: { tools: [], messages: [] } },
    dispose: () => { disposed = true; },
  } as unknown as AgentSession;
  return {
    fake,
    emit: (event: unknown) => listener?.(event as never),
    entries,
    isDisposed: () => disposed,
    abortCalls: () => abortCalls,
  };
}

function createCapabilityContext(): PiCapabilityContext {
  return {
    contract: 'upup.pi.capabilities.v1',
    sessionId: 'session-test-id',
    signal: new AbortController().signal,
    audit: {},
    get: () => { throw new Error('not implemented'); },
    has: () => false,
    dispose: async () => undefined,
  };
}

function createAdapter() {
  const fake = createFakeSession();
  const packageContracts: PiPackageContracts = { workflows: [], policies: [], evals: [] };
  const adapter = new PiSessionAdapter({
    spec,
    session: fake.fake,
    resourceTrustAudit: [],
    packageResources: [],
    packageContracts,
    financeContext: emptyFinanceSessionContext(),
    capabilityContext: createCapabilityContext(),
    evaluatePackage: ({ name, value }) => ({ ok: true, name, value } as never),
  });
  return { adapter, fake };
}

describe('@upup/pi-session', () => {
  test('exposes session identity and emits the canonical session_start event', () => {
    const { adapter } = createAdapter();
    const events: unknown[] = [];
    const unsubscribe = adapter.subscribe((event) => events.push(event));
    expect(adapter.id).toBe('session-test-id');
    expect(events).toEqual([{ type: 'session_start', sessionId: 'session-test-id', agentId: 'session-test' }]);
    unsubscribe();
    adapter.dispose();
  });

  test('maps upstream AgentSession events through the canonical adapter', () => {
    const { adapter, fake } = createAdapter();
    const events: unknown[] = [];
    adapter.subscribe((event) => events.push(event));
    fake.emit({ type: 'agent_start' });
    fake.emit({ type: 'turn_start' });
    fake.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'hello' } });
    expect(events.slice(1)).toEqual([
      { type: 'agent_start', sessionId: 'session-test-id' },
      { type: 'turn_start', sessionId: 'session-test-id' },
      { type: 'text_delta', sessionId: 'session-test-id', delta: 'hello' },
    ]);
    adapter.dispose();
  });

  test('setFinanceContext persists a canonical custom entry and returns a defensive copy', () => {
    const { adapter, fake } = createAdapter();
    adapter.setFinanceContext({ ticker: '600519.SH', assumptions: { growth: 0.12 }, risks: ['valuation'] });
    const context = adapter.getFinanceContext();
    expect(context.ticker).toBe('600519.SH');
    expect(context.assumptions).toEqual({ growth: 0.12 });
    expect(fake.entries[0]).toMatchObject({ type: 'custom', customType: 'upup_finance_context' });
    context.assumptions.growth = 99;
    expect(adapter.getFinanceContext().assumptions.growth).toBe(0.12);
    adapter.dispose();
  });

  test('session metadata and custom entries are exposed through the public contract', () => {
    const { adapter, fake } = createAdapter();
    adapter.appendSessionInfo('test-session');
    adapter.appendEntry('custom-test', { ok: true });
    expect(adapter.getSessionFile()).toBe('/tmp/session-test.jsonl');
    expect(adapter.getSessionHeader()?.id).toBe('session-test-id');
    expect(adapter.getSessionTree()).toEqual([]);
    expect(adapter.getCustomEntries('custom-test')).toHaveLength(1);
    expect(adapter.getCustomEntries('missing')).toHaveLength(0);
    expect(fake.entries).toHaveLength(2);
    adapter.dispose();
  });

  test('evaluatePackage delegates to the injected package evaluator', () => {
    const { adapter } = createAdapter();
    expect(adapter.evaluatePackage('fixture', { value: 1 })).toEqual({ ok: true, name: 'fixture', value: { value: 1 } });
    adapter.dispose();
  });

  test('dispose tears down the upstream session', () => {
    const { adapter, fake } = createAdapter();
    adapter.dispose();
    expect(fake.isDisposed()).toBe(true);
  });

  test('abort signal cancels the upstream session and dispose is idempotent', async () => {
    const { adapter, fake } = createAdapter();
    const controller = new AbortController();
    const prompt = adapter.prompt('long-running', { signal: controller.signal });
    controller.abort();
    await prompt;
    expect(fake.abortCalls()).toBe(1);
    adapter.dispose();
    adapter.dispose();
    await expect(adapter.waitForIdle()).resolves.toBeUndefined();
    await expect(adapter.prompt('after-dispose')).rejects.toThrow('disposed');
    expect(fake.isDisposed()).toBe(true);
  });
});
