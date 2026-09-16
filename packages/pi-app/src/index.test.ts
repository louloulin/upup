import { describe, expect, test } from 'bun:test';
import { disposePiBackgroundService, disposePiSessionService, getPiSessionService } from '@upup/pi-session';
import { createPiApp } from './index';

function createFixture() {
  const runtime = { createSession: async () => { throw new Error('fixture runtime is not executable'); } };
  const runner = async () => 'fixture';
  const promptPort = { runPrompt: runner };
  const agent = { isSessionRunning: () => false, runPrompt: runner };
  const config = { getConfiguredModelId: () => 'fixture-model', getConfiguredProvider: () => 'fixture-provider' };
  const cron = { ensureHeartbeatCronJob: async () => undefined, startCronRunner: () => ({ stop: () => undefined }) };
  const background = { start: async () => 'background-fixture-id' };
  const eventStream = { stream: async function* () {} };
  return { runtime, runner, promptPort, agent, config, cron, background, eventStream };
}

describe('@upup/pi-app', () => {
  test('initializes the explicit Pi ports exactly once and exposes the gateway contract', async () => {
    const fixture = createFixture();
    let runtimeFactoryCalls = 0;
    const app = createPiApp({
      sessionRuntimeFactory: () => {
        runtimeFactoryCalls += 1;
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      backgroundRuntimeFactory: () => fixture.background,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      investCommandHandler: async () => 'invest-fixture',
    });

    expect(app.initialized).toBe(false);
    app.initialize();
    app.initialize();
    expect(app.initialized).toBe(true);
    expect(runtimeFactoryCalls).toBe(0);
    expect(app.getGatewayRuntime()).toEqual({ agent: fixture.agent, config: fixture.config, cron: fixture.cron });
    expect(app.getSessionFactory()).toBe(fixture.runtime);
    expect(runtimeFactoryCalls).toBe(1);
    expect(app.getSessionFactory()).toBe(app.getSessionFactory());
    expect(app.getBackgroundRuntime()).toBe(fixture.background);
    expect(app.getEventStream()).toBe(fixture.eventStream);
    expect(getPiSessionService()).toBeDefined();

    await app.dispose();
    expect(app.initialized).toBe(false);
    expect(() => getPiSessionService()).toThrow('not configured');
    app.initialize();
    expect(app.getSessionFactory()).toBe(fixture.runtime);
    expect(runtimeFactoryCalls).toBe(2);
    await app.dispose();
  });

  test('rejects an incomplete composition before mutating runtime ports', () => {
    expect(() => createPiApp({} as never)).toThrow('sessionRuntimeFactory');
  });

  test('does not expose any runtime port before initialization', () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
    });

    expect(() => app.getEventStream()).toThrow('initialized');
    expect(() => app.getSessionFactory()).toThrow('initialized');
  });

  test('disposes the single composition before reinitializing the session service', async () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
    });
    app.initialize();
    expect(() => app.getEventStream()).not.toThrow();
    await app.dispose();
    app.initialize();
    expect(app.getSessionFactory()).toBe(fixture.runtime);
    await app.dispose();
  });

  test('repairs the composition after an external Pi service dispose', async () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
    });
    app.initialize();
    getPiSessionService();
    disposePiBackgroundService();
    await disposePiSessionService();
    expect(app.initialized).toBe(true);
    expect(() => app.getEventStream()).not.toThrow();
    app.initialize();
    expect(() => getPiSessionService()).not.toThrow();
    await app.dispose();
  });
});

import { builtinSessionComposition, type PiSessionCompositionProviders } from '@upup/pi-session';

function createCompositionFixture(): PiSessionCompositionProviders & {
  readonly calls: {
    createFinanceComposition: number;
    createPlatformComposition: number;
    JsonFileMarketQuoteTrendStore: number;
    loadProviderSlaStore: number;
  };
} {
  const calls = { createFinanceComposition: 0, createPlatformComposition: 0, JsonFileMarketQuoteTrendStore: 0, loadProviderSlaStore: 0 };
  return {
    calls,
    createFinanceComposition: (() => {
      calls.createFinanceComposition += 1;
      return builtinSessionComposition.createFinanceComposition;
    }) as PiSessionCompositionProviders['createFinanceComposition'],
    createPlatformComposition: ((options) => {
      calls.createPlatformComposition += 1;
      return builtinSessionComposition.createPlatformComposition(options);
    }) as PiSessionCompositionProviders['createPlatformComposition'],
    JsonFileMarketQuoteTrendStore: (((...args: unknown[]) => {
      calls.JsonFileMarketQuoteTrendStore += 1;
      return new (builtinSessionComposition.JsonFileMarketQuoteTrendStore as unknown as new (...a: unknown[]) => unknown)(...args);
    }) as unknown) as PiSessionCompositionProviders['JsonFileMarketQuoteTrendStore'],
    loadProviderSlaStore: (() => {
      calls.loadProviderSlaStore += 1;
      return builtinSessionComposition.loadProviderSlaStore();
    }) as PiSessionCompositionProviders['loadProviderSlaStore'],
    ensureHeartbeatCronJob: builtinSessionComposition.ensureHeartbeatCronJob,
    executeCronJob: builtinSessionComposition.executeCronJob,
    loadCronStore: builtinSessionComposition.loadCronStore,
    startCronRunner: builtinSessionComposition.startCronRunner,
    getConfiguredModelId: builtinSessionComposition.getConfiguredModelId,
    getConfiguredProvider: builtinSessionComposition.getConfiguredProvider,
    globalUpupPath: builtinSessionComposition.globalUpupPath,
  };
}

describe('@upup/pi-app composition replacement contract', () => {
  test('default composition provider is exposed via getSessionCompositionProvider when none is supplied', () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
    });
    expect(app.getSessionCompositionProvider()).toBeUndefined();
    app.initialize();
    const resolvedAfterInit = app.getSessionCompositionProvider();
    expect(resolvedAfterInit).toBeDefined();
    expect(resolvedAfterInit!.getConfiguredModelId).toBe(builtinSessionComposition.getConfiguredModelId);
    expect(resolvedAfterInit!.createPlatformComposition).toBe(builtinSessionComposition.createPlatformComposition);
    app.getSessionFactory();
    const resolvedAfterFactory = app.getSessionCompositionProvider();
    expect(resolvedAfterFactory).not.toBe(resolvedAfterInit);
    expect(resolvedAfterFactory!.getConfiguredModelId).toBe(builtinSessionComposition.getConfiguredModelId);
    expect(resolvedAfterFactory!.createPlatformComposition).toBe(builtinSessionComposition.createPlatformComposition);
    return app.dispose();
  });

  test('injected composition provider is observable at the app boundary and routed into the session runtime factory', async () => {
    const fixture = createFixture();
    const composition = createCompositionFixture();
    let capturedComposition: PiSessionCompositionProviders | undefined;
    const app = createPiApp({
      sessionRuntimeFactory: (injected) => {
        capturedComposition = injected;
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      sessionCompositionProvider: composition,
    });
    expect(app.getSessionCompositionProvider()).toBeUndefined();
    app.initialize();
    expect(app.getSessionCompositionProvider()).toBe(composition);
    expect(capturedComposition).toBeUndefined();
    const runtime = app.getSessionFactory();
    expect(runtime).toBe(fixture.runtime);
    expect(capturedComposition).toBe(composition);
    await app.dispose();
    expect(app.getSessionCompositionProvider()).toBeUndefined();
  });

  test('subsequent initialize/dispose cycles re-resolve composition through the same provider', async () => {
    const fixture = createFixture();
    const composition = createCompositionFixture();
    const observed: Array<PiSessionCompositionProviders | undefined> = [];
    const app = createPiApp({
      sessionRuntimeFactory: (injected) => {
        observed.push(injected);
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      sessionCompositionProvider: composition,
    });
    app.initialize();
    app.getSessionFactory();
    await app.dispose();
    expect(app.getSessionCompositionProvider()).toBeUndefined();
    expect(observed).toEqual([composition]);

    app.initialize();
    expect(app.getSessionCompositionProvider()).toBe(composition);
    app.getSessionFactory();
    await app.dispose();
    expect(observed).toEqual([composition, composition]);
    expect(app.getSessionCompositionProvider()).toBeUndefined();
  });

  test('replacing the composition provider records the boundary swap at runtime resolution', () => {
    const fixture = createFixture();
    const compositionA = createCompositionFixture();
    const compositionB = createCompositionFixture();
    const observed: Array<PiSessionCompositionProviders | undefined> = [];
    const makeApp = (composition: PiSessionCompositionProviders) =>
      createPiApp({
        sessionRuntimeFactory: (injected) => {
          observed.push(injected);
          return fixture.runtime;
        },
        backgroundPromptRunner: () => fixture.runner,
        promptPort: fixture.promptPort,
        gatewayAgentRuntime: fixture.agent,
        gatewayConfigRuntime: fixture.config,
        gatewayCronRuntime: fixture.cron,
        eventStreamFactory: () => fixture.eventStream,
        sessionCompositionProvider: composition,
      });
    const appA = makeApp(compositionA);
    appA.initialize();
    appA.getSessionFactory();
    expect(observed.at(-1)).toBe(compositionA);

    const appB = makeApp(compositionB);
    appB.initialize();
    appB.getSessionFactory();
    expect(observed.at(-1)).toBe(compositionB);
    expect(observed).toContain(compositionA);
    expect(observed).toContain(compositionB);

    return Promise.all([appA.dispose(), appB.dispose()]);
  });
});

import { builtinSessionFinanceComposition, builtinSessionPlatformComposition, type PiSessionFinanceProviders, type PiSessionPlatformProviders } from '@upup/pi-session';

describe('@upup/pi-app split sub-boundary contract', () => {
  test('finance-only override keeps the platform half on the builtin default', () => {
    const fixture = createFixture();
    let observedComposition: { finance: PiSessionFinanceProviders; platform: PiSessionPlatformProviders } | undefined;
    const financeOverride: PiSessionFinanceProviders = {
      ...builtinSessionFinanceComposition,
      getConfiguredModelId: () => 'finance-only-override-model',
    };
    const app = createPiApp({
      sessionRuntimeFactory: (composition) => {
        observedComposition = {
          finance: {
            createFinanceComposition: composition.createFinanceComposition,
            JsonFileMarketQuoteTrendStore: composition.JsonFileMarketQuoteTrendStore,
            loadProviderSlaStore: composition.loadProviderSlaStore,
            getConfiguredModelId: composition.getConfiguredModelId,
            getConfiguredProvider: composition.getConfiguredProvider,
            globalUpupPath: composition.globalUpupPath,
          },
          platform: {
            createPlatformComposition: composition.createPlatformComposition,
            ensureHeartbeatCronJob: composition.ensureHeartbeatCronJob,
            executeCronJob: composition.executeCronJob,
            loadCronStore: composition.loadCronStore,
            startCronRunner: composition.startCronRunner,
          },
        };
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      sessionFinanceProvider: financeOverride,
    });
    app.initialize();
    const resolvedFinance = app.getSessionCompositionProvider();
    expect(resolvedFinance).toBeDefined();
    expect(resolvedFinance!.getConfiguredModelId()).toBe('finance-only-override-model');
    expect(resolvedFinance!.ensureHeartbeatCronJob).toBe(builtinSessionComposition.ensureHeartbeatCronJob);
    expect(resolvedFinance!.createPlatformComposition).toBe(builtinSessionComposition.createPlatformComposition);
    app.getSessionFactory();
    expect(observedComposition).toBeDefined();
    expect(observedComposition!.finance.getConfiguredModelId()).toBe('finance-only-override-model');
    expect(observedComposition!.platform.ensureHeartbeatCronJob).toBe(builtinSessionPlatformComposition.ensureHeartbeatCronJob);
    return app.dispose();
  });

  test('platform-only override keeps the finance half on the builtin default', () => {
    const fixture = createFixture();
    let observedPlatform: PiSessionPlatformProviders | undefined;
    const platformOverride: PiSessionPlatformProviders = {
      ...builtinSessionPlatformComposition,
      loadCronStore: () => {
        observedPlatform = { ...builtinSessionPlatformComposition, loadCronStore: builtinSessionPlatformComposition.loadCronStore };
        return { version: 1, jobs: [] };
      },
    };
    const app = createPiApp({
      sessionRuntimeFactory: (composition) => {
        observedPlatform = {
          createPlatformComposition: composition.createPlatformComposition,
          ensureHeartbeatCronJob: composition.ensureHeartbeatCronJob,
          executeCronJob: composition.executeCronJob,
          loadCronStore: composition.loadCronStore,
          startCronRunner: composition.startCronRunner,
        };
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      sessionPlatformProvider: platformOverride,
    });
    app.initialize();
    const resolvedPlatform = app.getSessionCompositionProvider();
    expect(resolvedPlatform).toBeDefined();
    expect(resolvedPlatform!.getConfiguredModelId).toBe(builtinSessionComposition.getConfiguredModelId);
    expect(resolvedPlatform!.createPlatformComposition).toBe(builtinSessionComposition.createPlatformComposition);
    app.getSessionFactory();
    expect(observedPlatform).toBeDefined();
    expect(observedPlatform!.createPlatformComposition).toBe(builtinSessionPlatformComposition.createPlatformComposition);
    expect(typeof observedPlatform!.loadCronStore).toBe('function');
    return app.dispose();
  });

  test('combined provider takes precedence over split overrides', () => {
    const fixture = createFixture();
    let observedCombinedId = '';
    const combined = {
      ...builtinSessionFinanceComposition,
      ...builtinSessionPlatformComposition,
      getConfiguredModelId: () => 'combined-wins-model',
    };
    const app = createPiApp({
      sessionRuntimeFactory: (composition) => {
        observedCombinedId = composition.getConfiguredModelId();
        return fixture.runtime;
      },
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      eventStreamFactory: () => fixture.eventStream,
      sessionCompositionProvider: combined,
      sessionFinanceProvider: {
        ...builtinSessionFinanceComposition,
        getConfiguredModelId: () => 'split-finance-loses',
      },
      sessionPlatformProvider: {
        ...builtinSessionPlatformComposition,
        ensureHeartbeatCronJob: (() => undefined) as PiSessionPlatformProviders['ensureHeartbeatCronJob'],
      },
    });
    app.initialize();
    app.getSessionFactory();
    expect(observedCombinedId).toBe('combined-wins-model');
    return app.dispose();
  });
});
