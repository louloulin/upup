import { describe, expect, test, beforeEach } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { publishPiCapabilityHosts } from '@upup/pi-capability-registry';

const HOST_REG = {
  packageName: '@upup/pi-corporate-actions',
  packageVersion: '0.1.0',
  sessionId: 'test-session-corporate-actions',
  capabilities: ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals'],
};

function setHost(map: Map<string, typeof HOST_REG>) {
  const events = createEventBus();
  const dispose = publishPiCapabilityHosts(events, HOST_REG.sessionId, map);
  return { events, dispose };
}

beforeEach(() => {
});

describe('pi-corporate-actions extension registration', () => {
  test('registers all 8 native tools when host is present', async () => {
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown>; description: string }>();
    const fakePi = {
      registerTool: (def: { name: string; description: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute, description: def.description });
      },
    };
    const { events, dispose } = setHost(new Map([['@upup/pi-corporate-actions', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default({ ...fakePi, events } as unknown as Parameters<typeof mod.default>[0]);
    dispose();
    expect(tools.size).toBe(8);
    expect(tools.has('corporate_actions_dividends')).toBe(true);
    expect(tools.has('corporate_actions_splits')).toBe(true);
    expect(tools.has('corporate_actions_rights')).toBe(true);
    expect(tools.has('corporate_actions_list_all')).toBe(true);
    expect(tools.has('corporate_actions_adjust_prices')).toBe(true);
    expect(tools.has('corporate_actions_total_return')).toBe(true);
    expect(tools.has('corporate_actions_dividend_yield')).toBe(true);
    expect(tools.has('corporate_actions_ex_price')).toBe(true);
  });

  test('registerHostTools is a no-op when host is missing', async () => {
    const { events, dispose } = setHost(new Map());
    const mod = await import('./index.js');
    expect(typeof mod.default).toBe('function');
    mod.default({ registerTool: () => undefined, events } as unknown as Parameters<typeof mod.default>[0]);
    dispose();
  });

  test('corporate_actions_dividends returns dry-run evidence for 600519.SH', async () => {
    const tools = new Map<string, { execute: (id: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>();
    const fakePi = {
      registerTool: (def: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute as never });
      },
    };
    const { events, dispose } = setHost(new Map([['@upup/pi-corporate-actions', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default({ ...fakePi, events } as unknown as Parameters<typeof mod.default>[0]);
    const tool = tools.get('corporate_actions_dividends');
    expect(tool).toBeDefined();
    const ctrl = new AbortController();
    const out = await tool!.execute('audit-1', { symbol: '600519.SH' }, ctrl.signal);
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed.symbol).toBe('600519.SH');
    expect(parsed.count).toBe(2);
    expect(parsed.evidence.source).toBe('dry-run://pi-corporate-actions');
    expect(parsed.evidence.dataFreshness).toBe('offline');
  });

  test('honors abort signal', async () => {
    const tools = new Map<string, { execute: (id: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>();
    const fakePi = {
      registerTool: (def: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute as never });
      },
    };
    const { events, dispose } = setHost(new Map([['@upup/pi-corporate-actions', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default({ ...fakePi, events } as unknown as Parameters<typeof mod.default>[0]);
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await tools.get('corporate_actions_splits')!.execute('audit-2', { symbol: 'AAPL' }, ctrl.signal);
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain('aborted');
    dispose();
  });
});
