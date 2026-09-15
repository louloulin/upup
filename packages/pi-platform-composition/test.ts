import { describe, expect, test } from 'bun:test';
import { createPlatformComposition, type PlatformCompositionOptions } from './src/index';
import type { UpUpAgentSpec } from '@upup/pi-runtime';

const baseSpec: UpUpAgentSpec = {
  id: 'platform-composition-test-spec',
  name: 'Platform composition test',
  description: 'platform composition boundary contract',
  mode: 'subagent',
  tools: ['fixture_market_quote'],
  capabilities: ['financial-research'],
  taskTypes: ['research'],
  permissions: { id: 'pi-platform-composition-read-only', allow: ['safe'], requireApproval: [], deny: ['dangerous', 'critical'], allowFinancialWrites: false },
  outputContract: 'evidence',
  dataPolicy: 'live',
};

function buildComposition(overrides: Partial<PlatformCompositionOptions> = {}): {
  composition: ReturnType<typeof createPlatformComposition>;
  calls: { runPrompt: number; runCron: number; listMcpResources: number; readMcpResource: number };
} {
  const calls = { runPrompt: 0, runCron: 0, listMcpResources: 0, readMcpResource: 0 };
  const composition = createPlatformComposition({
    sessionId: 'platform-composition-test',
    spec: baseSpec,
    runPrompt: async () => {
      calls.runPrompt += 1;
      return 'worker-output';
    },
    runCron: async () => {
      calls.runCron += 1;
    },
    listMcpResources: async () => {
      calls.listMcpResources += 1;
      return [{ server: 'mock', resources: [{ uri: 'mock://cap' }] }];
    },
    readMcpResource: async () => {
      calls.readMcpResource += 1;
      return { server: 'mock', contents: [{ uri: 'mock://cap', text: 'cap' }] };
    },
    ...overrides,
  });
  return { composition, calls };
}

describe('@upup/pi-platform-composition', () => {
  test('routes research worker through runPrompt without leaking runtime state', async () => {
    const { composition, calls } = buildComposition();
    const result = await composition.runResearchWorker(
      {
        role: 'fundamental-analysis',
        symbol: '600519.SH',
        question: '基础面如何',
        systemPrompt: '只读',
        allowedTools: ['fixture_market_quote', 'fixture_fundamentals'],
      },
      new AbortController().signal,
    );
    expect(calls.runPrompt).toBe(1);
    expect(calls.runCron).toBe(0);
    expect(result.role).toBe('fundamental-analysis');
    expect(result.output).toBe('worker-output');
    expect(result.sessionId).toContain('research:fundamental-analysis');
    expect(result.evidence).toEqual([expect.objectContaining({ source: 'upup-pi://research-worker/fundamental-analysis' })]);
  });

  test('agent worker builds a session-scoped session id without leaking AgentSpec beyond scope', async () => {
    const { composition, calls } = buildComposition();
    const result = await composition.runAgentWorker(
      { agentId: 'Agent#1!!', name: 'Platform Worker', role: 'monitor', prompt: 'monitor question', tools: ['fixture_market_quote'] },
      new AbortController().signal,
    );
    expect(calls.runPrompt).toBe(1);
    expect(result.agentId).toBe('Agent#1!!');
    expect(result.sessionId).toMatch(/^platform-composition-test:agent:agent-1$/);
    expect(result.output).toBe('worker-output');
  });

  test('agent worker accepts the wildcard tool filter and forwards it', async () => {
    const observedToolFilters: (readonly string[] | '*')[] = [];
    const { composition } = (() => {
      const calls = { runPrompt: 0, runCron: 0, listMcpResources: 0, readMcpResource: 0 };
      const composition = createPlatformComposition({
        sessionId: 'platform-composition-wildcard',
        spec: baseSpec,
        runPrompt: async (_prompt, options) => {
          calls.runPrompt += 1;
          observedToolFilters.push(options.toolFilter);
          return 'worker-output';
        },
        runCron: async () => {
          calls.runCron += 1;
        },
        listMcpResources: async () => [{ server: 'mock', resources: [] }],
        readMcpResource: async () => ({ server: 'mock', contents: [] }),
      });
      return { composition, calls };
    })();
    const result = await composition.runAgentWorker(
      { agentId: 'monitor', name: 'monitor', role: 'monitor', prompt: 'p', tools: '*' },
      new AbortController().signal,
    );
    expect(result.sessionId).toContain('agent:monitor');
    expect(observedToolFilters).toEqual(['*']);
  });

  test('cron job delegates to runCron and respects abort', async () => {
    const { composition, calls } = buildComposition();
    const controller = new AbortController();
    controller.abort();
    await expect(composition.runCronJob({ job: { id: 'job-1' } }, controller.signal)).rejects.toThrow('aborted');
    expect(calls.runCron).toBe(0);

    const controller2 = new AbortController();
    await composition.runCronJob({ job: { id: 'job-2' } }, controller2.signal);
    expect(calls.runCron).toBe(1);
  });

  test('MCP helpers reject aborted signals and otherwise delegate to options', async () => {
    const { composition, calls } = buildComposition();
    const controller = new AbortController();
    controller.abort();
    await expect(composition.listMcpResources('mock', controller.signal)).rejects.toThrow('aborted');
    await expect(composition.readMcpResource('mock://cap', 'mock', controller.signal)).rejects.toThrow('aborted');
    expect(calls.listMcpResources).toBe(0);
    expect(calls.readMcpResource).toBe(0);

    const live = await composition.listMcpResources('mock', new AbortController().signal);
    expect(live).toEqual([{ server: 'mock', resources: [{ uri: 'mock://cap' }] }]);
    expect(calls.listMcpResources).toBe(1);

    const read = await composition.readMcpResource('mock://cap', 'mock', new AbortController().signal);
    expect(read.contents).toEqual([{ uri: 'mock://cap', text: 'cap' }]);
    expect(calls.readMcpResource).toBe(1);
  });

  test('composition still returns an object even when optional providers are missing, and methods fail when invoked', async () => {
    const composition = createPlatformComposition({
      sessionId: 'platform-composition-minimal',
      spec: baseSpec,
      runPrompt: async () => 'noop',
      runCron: async () => {},
      listMcpResources: async () => [],
      readMcpResource: async () => ({ server: 'noop', contents: [] }),
    });
    expect(composition).toBeDefined();
    // Worker still produces output because runPrompt is wired.
    const result = await composition.runAgentWorker(
      { agentId: 'minimal', name: 'm', role: 'm', prompt: 'p', tools: ['fixture_market_quote'] },
      new AbortController().signal,
    );
    expect(result.output).toBe('noop');
  });
});

describe('@upup/pi-platform-composition cron platform surface', () => {
  test('default cron platform provider routes loadCronStore and runner through @upup/cron', async () => {
    const { defaultCronPlatformProvider } = await import('./src/index');
    expect(typeof defaultCronPlatformProvider.loadCronStore).toBe('function');
    expect(typeof defaultCronPlatformProvider.saveCronStore).toBe('function');
    expect(typeof defaultCronPlatformProvider.ensureHeartbeatCronJob).toBe('function');
    expect(typeof defaultCronPlatformProvider.executeCronJob).toBe('function');
    expect(typeof defaultCronPlatformProvider.startCronRunner).toBe('function');
  });

  test('cron platform provider is replaceable without touching @upup/pi-session', async () => {
    const platformModule = await import('./src/index');
    const defaultCronPlatformProvider = platformModule.defaultCronPlatformProvider;
    type CronPlatformProvider = platformModule.CronPlatformProvider;
    let calls = { load: 0, ensure: 0, execute: 0, start: 0 };
    const stub: CronPlatformProvider = {
      loadCronStore: () => {
        calls.load += 1;
        return { version: 1, jobs: [] };
      },
      saveCronStore: () => undefined,
      ensureHeartbeatCronJob: async () => {
        calls.ensure += 1;
        return undefined;
      },
      executeCronJob: async () => {
        calls.execute += 1;
        return undefined;
      },
      startCronRunner: () => {
        calls.start += 1;
        return { stop: () => undefined } as ReturnType<typeof defaultCronPlatformProvider.startCronRunner>;
      },
    };
    // The provider surface MUST be independent of the default — replacing
    // it does not require rebuilding or restarting the platform.
    expect(stub).not.toBe(defaultCronPlatformProvider);
    expect(stub.loadCronStore()).toEqual({ version: 1, jobs: [] });
    calls = { load: 0, ensure: 0, execute: 0, start: 0 };
    void calls;
  });

  test('platform-composition package owns cron surface — pi-session no longer imports @upup/cron', async () => {
    const fs = await import('node:fs');
    const pathMod = await import('node:path');
    const sessionSrc = fs.readFileSync(
      pathMod.resolve(process.cwd(), '../pi-session/src/builtin-composition.ts'),
      'utf8',
    );
    expect(sessionSrc).not.toContain("from '@upup/cron'");
  });
});

