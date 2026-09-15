import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GatewayRuntime } from './runtime-port';

interface CapturedRunner { stopCalls: number; created: number; }
interface GatewayHookBag { previous: unknown; }

const capture: CapturedRunner = { stopCalls: 0, created: 0 };
const hooks: GatewayHookBag = { previous: undefined };

function loadStartGateway(): (params: { configPath?: string; runtime: GatewayRuntime }) => Promise<{ stop: () => Promise<void>; snapshot: () => Record<string, unknown> }> {
  return require('./gateway').startGateway as (params?: { configPath?: string }) => Promise<{ stop: () => Promise<void>; snapshot: () => Record<string, unknown> }>;
}

function installHook(): void {
  hooks.previous = (globalThis as { __upupGatewayTestHooks?: unknown }).__upupGatewayTestHooks;
  (globalThis as { __upupGatewayTestHooks?: { createSlaRunner: (options: { trendStore: unknown }) => unknown } }).__upupGatewayTestHooks = {
    createSlaRunner: () => {
      capture.stopCalls = 0;
      capture.created += 1;
      return {
        runDue: async () => [],
        stop: () => { capture.stopCalls += 1; },
      };
    },
  };
}

function uninstallHook(): void {
  (globalThis as { __upupGatewayTestHooks?: unknown }).__upupGatewayTestHooks = hooks.previous;
}

describe('Gateway provider SLA runner integration', () => {
  let rootDir = '';
  let runtime: GatewayRuntime;

  beforeEach(() => {
    const config = {
      getConfiguredModelId: () => 'gateway-fixture-model',
      getConfiguredProvider: () => 'gateway-fixture-provider',
    };
    const cron = {
      ensureHeartbeatCronJob: () => undefined,
      startCronRunner: () => ({ stop: () => undefined }),
    };
    runtime = {
      agent: { isSessionRunning: () => false, runPrompt: async () => '' }, config, cron,
    };
    capture.stopCalls = 0;
    capture.created = 0;
    installHook();
    rootDir = mkdtempSync(join(tmpdir(), 'upup-gateway-sla-'));
    process.env.UPUP_HOME = rootDir;
    process.env.UPUP_PROVIDER_METRICS_PATH = join(rootDir, 'metrics.json');
  });

  afterEach(() => {
    uninstallHook();
    delete process.env.UPUP_HOME;
    delete process.env.UPUP_PROVIDER_METRICS_PATH;
    if (rootDir) { rmSync(rootDir, { recursive: true, force: true }); rootDir = ''; }
    runtime = undefined as never;
  });

  function writeConfig(): string {
    const path = join(rootDir, 'gateway.json');
    writeFileSync(path, JSON.stringify({ gateway: { accountId: 'default', logLevel: 'silent' }, channels: { whatsapp: { enabled: false, accounts: {}, allowFrom: [] } }, bindings: [] }));
    return path;
  }

  test('startGateway creates one SLA runner and stop releases it exactly once', async () => {
    const service = await loadStartGateway()({ configPath: writeConfig(), runtime });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(capture.created).toBe(1);
    expect(capture.stopCalls).toBe(0);
    await service.stop();
    expect(capture.stopCalls).toBe(1);
  });

  test('repeated stop calls do not invoke the SLA runner more than once', async () => {
    const service = await loadStartGateway()({ configPath: writeConfig(), runtime });
    await service.stop();
    const firstStopCalls = capture.stopCalls;
    await service.stop();
    expect(capture.stopCalls).toBe(firstStopCalls);
  });
});
