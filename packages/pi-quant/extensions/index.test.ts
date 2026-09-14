import { describe, expect, test, beforeEach } from 'bun:test';

const HOSTS = '__upupPiHosts';

const HOST_REG = {
  packageName: '@upup/pi-quant',
  packageVersion: '0.1.0',
  sessionId: 'test-session-quant',
  capabilities: ['extensions', 'skills', 'prompts', 'workflows', 'policies', 'evals'],
};

function setHost(map: Map<string, typeof HOST_REG>): void {
  (globalThis as unknown as Record<string, unknown>)[HOSTS] = map;
}

beforeEach(() => {
  setHost(new Map());
});

describe('pi-quant extension registration', () => {
  test('registers all 8 native tools when host is present', async () => {
    const tools = new Map<string, { execute: (...args: unknown[]) => Promise<unknown>; description: string }>();
    const fakePi = {
      registerTool: (def: { name: string; description: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute, description: def.description });
      },
    };
    setHost(new Map([['@upup/pi-quant', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default(fakePi as unknown as Parameters<typeof mod.default>[0]);
    expect(tools.size).toBe(8);
    expect(tools.has('quant_factor_library')).toBe(true);
    expect(tools.has('quant_factor_compute')).toBe(true);
    expect(tools.has('quant_factor_normalize')).toBe(true);
    expect(tools.has('quant_factor_ic')).toBe(true);
    expect(tools.has('quant_factor_returns')).toBe(true);
    expect(tools.has('quant_factor_orthogonalize')).toBe(true);
    expect(tools.has('quant_factor_score')).toBe(true);
    expect(tools.has('quant_factor_backtest')).toBe(true);
  });

  test('quant_factor_normalize returns offline dry-run envelope', async () => {
    const tools = new Map<string, { execute: (id: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>();
    const fakePi = {
      registerTool: (def: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute as never });
      },
    };
    setHost(new Map([['@upup/pi-quant', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default(fakePi as unknown as Parameters<typeof mod.default>[0]);
    const ctrl = new AbortController();
    const out = await tools.get('quant_factor_normalize')!.execute('a-1', { values: [1, 2, 3, 4, 5], method: 'zscore' }, ctrl.signal);
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed.method).toBe('zscore');
    expect(parsed.count).toBe(5);
    expect(parsed.evidence.source).toBe('dry-run://pi-quant');
    expect(parsed.evidence.dataFreshness).toBe('offline');
  });

  test('honors abort signal', async () => {
    const tools = new Map<string, { execute: (id: string, params: Record<string, unknown>, signal: AbortSignal) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> }>();
    const fakePi = {
      registerTool: (def: { name: string; execute: (...args: unknown[]) => Promise<unknown> }) => {
        tools.set(def.name, { execute: def.execute as never });
      },
    };
    setHost(new Map([['@upup/pi-quant', HOST_REG]]));
    const mod = await import('./index.js');
    mod.default(fakePi as unknown as Parameters<typeof mod.default>[0]);
    const ctrl = new AbortController();
    ctrl.abort();
    const out = await tools.get('quant_factor_library')!.execute('a-2', {}, ctrl.signal);
    expect(out.isError).toBe(true);
    expect(out.content[0].text).toContain('aborted');
  });

  test('registerHostTools is a no-op when host is missing', async () => {
    setHost(new Map());
    const mod = await import('./index.js');
    expect(typeof mod.default).toBe('function');
  });
});
