import { describe, expect, test } from 'bun:test';
import { disposePiBackgroundService, disposePiSessionService, getPiSessionService } from '@upup/pi-session';
import { createPiApp } from './index.js';

function createFixture() {
  const runtime = { createSession: async () => { throw new Error('fixture runtime is not executable'); } };
  const runner = async () => 'fixture';
  const promptPort = { runPrompt: runner };
  const agent = { isSessionRunning: () => false, runPrompt: runner };
  const config = { getConfiguredModelId: () => 'fixture-model', getConfiguredProvider: () => 'fixture-provider' };
  const cron = { ensureHeartbeatCronJob: async () => undefined, startCronRunner: () => ({ stop: () => undefined }) };
  const background = { start: async () => 'background-fixture-id' };
  const stdio = { streamPiEvents: async function* () {}, sessionService: {} as never };
  const eventStream = { stream: async function* () {} };
  const tuiEventStream = { stream: async function* () {} };
  return { runtime, runner, promptPort, agent, config, cron, background, stdio, eventStream, tuiEventStream };
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
      stdioRuntimeFactory: () => fixture.stdio,
      eventStreamFactory: () => fixture.eventStream,
      tuiEventStreamFactory: () => fixture.tuiEventStream,
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
    expect(app.getStdioRuntime()).toBe(fixture.stdio);
    expect(app.getEventStream()).toBe(fixture.eventStream);
    expect(app.getTuiEventStream()).toBe(fixture.tuiEventStream);
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

  test('does not expose stdio runtime before initialization', () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      stdioRuntimeFactory: () => fixture.stdio,
      eventStreamFactory: () => fixture.eventStream,
      tuiEventStreamFactory: () => fixture.tuiEventStream,
    });

    expect(() => app.getStdioRuntime()).toThrow('initialized');
    expect(() => app.getEventStream()).toThrow('initialized');
    expect(() => app.getSessionFactory()).toThrow('initialized');
  });

  test('disposes the single composition before reinitializing stdio and session services', async () => {
    const fixture = createFixture();
    const app = createPiApp({
      sessionRuntimeFactory: () => fixture.runtime,
      backgroundPromptRunner: () => fixture.runner,
      promptPort: fixture.promptPort,
      gatewayAgentRuntime: fixture.agent,
      gatewayConfigRuntime: fixture.config,
      gatewayCronRuntime: fixture.cron,
      stdioRuntimeFactory: () => fixture.stdio,
      eventStreamFactory: () => fixture.eventStream,
      tuiEventStreamFactory: () => fixture.tuiEventStream,
    });
    app.initialize();
    expect(app.getStdioRuntime()).toBe(fixture.stdio);
    await app.dispose();
    app.initialize();
    expect(app.getStdioRuntime()).toBe(fixture.stdio);
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
      stdioRuntimeFactory: () => fixture.stdio,
      eventStreamFactory: () => fixture.eventStream,
      tuiEventStreamFactory: () => fixture.tuiEventStream,
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
