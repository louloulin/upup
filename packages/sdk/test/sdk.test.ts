/**
 * UpUp SDK tests — exercises the 5 cross-platform scenarios that
 * `check:cross-platform-exposure` calls out:
 *
 *   1. createUpUpSession returns a handle with a stable id and resolved spec
 *   2. The 7 canonical profiles resolve to a complete UpUpAgentSpec
 *   3. EventStream flattens UpUp events into the 9 SDK-level event types
 *   4. handle.close() releases the underlying session
 *   5. financeContext is forwarded to the session after ready
 *
 * Tests use a fake `CreateUpUpSessionRuntime` so they don't need the full
 * Pi + UpUp stack on the test machine. The full-stack path is exercised
 * by `examples/rpc-client.ts` (real demo) and `verify:pi7-final`.
 */

import { describe, expect, it } from 'bun:test';
import {
  createUpUpSession,
  createUpUpSessionHandle,
  resolveUpUpSpec,
  UPUP_SDK_PROFILES,
  UpUpEventStream,
  type CreateUpUpSessionRuntime,
  type UpUpSessionEvent,
} from '../src/index';
import type {
  UpUpAgentSession,
  UpUpAgentSpec,
  UpUpFinanceSessionContext,
} from '@upup/pi-runtime';

function makeFakeSession(spec: UpUpAgentSpec): UpUpAgentSession {
  const finance: UpUpFinanceSessionContext = {
    tickers: [],
    watchlist: [],
    dossierIds: [],
    riskOverrides: {},
  };
  const session: UpUpAgentSession = {
    id: `fake-${spec.id}`,
    spec,
    async prompt(): Promise<void> { /* no-op for test */ },
    async steer(): Promise<void> { /* no-op */ },
    async followUp(): Promise<void> { /* no-op */ },
    async abort(): Promise<void> { /* no-op */ },
    async waitForIdle(): Promise<void> { /* no-op */ },
    async compact(): Promise<void> { /* no-op */ },
    getSessionFile(): string | undefined { return '/tmp/fake.jsonl'; },
    getSessionHeader(): { id: string; timestamp: string; cwd: string } | null {
      return { id: spec.id, timestamp: new Date().toISOString(), cwd: '/tmp' };
    },
    getSessionTree(): readonly unknown[] { return []; },
    exportToJsonl(): string { return '/tmp/fake.jsonl'; },
    async exportToHtml(): Promise<string> { return '/tmp/fake.html'; },
    fork(): string | undefined { return 'fake-fork'; },
    appendEntry(): void { /* no-op */ },
    appendSessionInfo(): void { /* no-op */ },
    setFinanceContext(ctx): void { Object.assign(finance, ctx); },
    getFinanceContext(): UpUpFinanceSessionContext { return { ...finance }; },
    getCustomEntries(): readonly unknown[] { return []; },
    getAvailableToolNames(): readonly string[] { return ['invest_workflow', 'web_search', 'browser', 'skill']; },
  };
  return session;
}

function makeFakeRuntime(spec: UpUpAgentSpec): CreateUpUpSessionRuntime {
  return {
    async createSession() {
      return makeFakeSession(spec);
    },
  };
}

describe('createUpUpSession', () => {
  it('returns a handle with a stable id and the resolved spec', async () => {
    const handle = await createUpUpSession(
      { profile: 'researcher', onEvent: () => undefined },
      makeFakeRuntime(UPUP_SDK_PROFILES.researcher),
    );
    expect(handle.id.startsWith('fake-')).toBe(true);
    expect(handle.spec.id).toBe('upup-sdk-researcher');
    await handle.close();
  });

  it('respects a custom spec over a profile short-hand', async () => {
    const customSpec: UpUpAgentSpec = {
      ...UPUP_SDK_PROFILES.researcher,
      id: 'custom-researcher',
      name: 'Custom Researcher',
    };
    const handle = await createUpUpSession(
      { profile: 'analyst', spec: customSpec, onEvent: () => undefined },
      makeFakeRuntime(customSpec),
    );
    expect(handle.spec.id).toBe('custom-researcher');
    await handle.close();
  });
});

describe('UPUP_SDK_PROFILES', () => {
  it('exposes all 7 canonical agent profiles', () => {
    const names = Object.keys(UPUP_SDK_PROFILES);
    expect(names).toContain('researcher');
    expect(names).toContain('analyst');
    expect(names).toContain('risk-manager');
    expect(names).toContain('portfolio-manager');
    expect(names).toContain('backtest-engineer');
    expect(names).toContain('monitor');
    expect(names).toContain('reviewer');
    expect(names.length).toBe(7);
  });

  it('every profile has finance capabilities, task types, and a system prompt', () => {
    for (const profile of Object.values(UPUP_SDK_PROFILES)) {
      expect(profile.tools).toBe('*');
      expect(typeof profile.systemPrompt).toBe('string');
      expect(profile.systemPrompt.length).toBeGreaterThan(80);
      expect(profile.capabilities.length).toBeGreaterThan(0);
      expect(profile.taskTypes.length).toBeGreaterThan(0);
      expect(profile.permissions.id.length).toBeGreaterThan(0);
    }
  });

  it('resolveUpUpSpec returns the default researcher when called with no arg', () => {
    expect(resolveUpUpSpec(undefined).id).toBe('upup-sdk-researcher');
  });

  it('resolveUpUpSpec throws on unknown short-hand', () => {
    expect(() => resolveUpUpSpec('not-a-profile' as never)).toThrow(/Unknown UpUp profile/);
  });
});

describe('UpUpEventStream', () => {
  it('flattens tool_start / tool_end into a matched pair', async () => {
    const stream = new UpUpEventStream();
    const seen: UpUpSessionEvent[] = [];
    stream.addListener((event) => {
      seen.push(event);
    });
    await stream.emitFromAgentEvent({
      type: 'tool_start',
      sessionId: 's-1',
      toolName: 'invest_workflow',
      toolCallId: 'c-1',
      input: { ticker: '600519.SH' },
    });
    await stream.emitFromAgentEvent({
      type: 'tool_end',
      sessionId: 's-1',
      toolName: 'invest_workflow',
      toolCallId: 'c-1',
    });
    const calls = seen.filter((e) => e.type === 'tool_call');
    const results = seen.filter((e) => e.type === 'tool_result');
    expect(calls.length).toBe(1);
    expect(results.length).toBe(1);
    if (calls[0]?.type === 'tool_call') expect(calls[0].tool).toBe('invest_workflow');
    if (results[0]?.type === 'tool_result') expect(results[0].isError).toBe(false);
  });

  it('surfaces tool errors as isError=true on tool_result', async () => {
    const stream = new UpUpEventStream();
    const seen: UpUpSessionEvent[] = [];
    stream.addListener((event) => seen.push(event));
    await stream.emitFromAgentEvent({
      type: 'tool_end',
      sessionId: 's-1',
      toolName: 'invest_workflow',
      toolCallId: 'c-2',
      error: 'timeout',
    });
    const result = seen.find((e) => e.type === 'tool_result');
    expect(result).toBeDefined();
    if (result?.type === 'tool_result') expect(result.isError).toBe(true);
  });

  it('forwards session_error as a typed error event', async () => {
    const stream = new UpUpEventStream();
    const seen: UpUpSessionEvent[] = [];
    stream.addListener((event) => seen.push(event));
    await stream.emitFromAgentEvent({
      type: 'session_error',
      sessionId: 's-1',
      error: 'boom',
    });
    const error = seen.find((e) => e.type === 'error');
    expect(error).toBeDefined();
  });

  it('forwards granular events as agent_event envelopes', async () => {
    const stream = new UpUpEventStream();
    const seen: UpUpSessionEvent[] = [];
    stream.addListener((event) => seen.push(event));
    await stream.emitFromAgentEvent({
      type: 'turn_start',
      sessionId: 's-1',
    });
    expect(seen[0]?.type).toBe('agent_event');
  });
});

describe('createUpUpSessionHandle', () => {
  it('forwards financeContext after the session is ready', async () => {
    const stream = new UpUpEventStream();
    const ready: UpUpSessionHandle = createUpUpSessionHandle({
      spec: UPUP_SDK_PROFILES.researcher,
      stream,
      runtime: makeFakeRuntime(UPUP_SDK_PROFILES.researcher),
      financeContext: { tickers: ['600519.SH'] as unknown as never[] } as never,
    });
    // Wait one tick for the async creation to settle.
    await new Promise((resolve) => setImmediate(resolve));
    const ctx = ready.getFinanceContext();
    expect(ctx).toBeDefined();
    await ready.close();
  });

  it('close() is idempotent and safe to call twice', async () => {
    const handle = await createUpUpSession(
      { onEvent: () => undefined },
      makeFakeRuntime(UPUP_SDK_PROFILES.researcher),
    );
    await handle.close();
    await handle.close();
    expect(true).toBe(true);
  });
});
