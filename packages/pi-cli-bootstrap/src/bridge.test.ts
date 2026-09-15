import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { startBridgeServer } from '@upup/pi-bridge';
import type { GatewayRuntime } from '@upup/gateway';
import { runBridgeNotifyReloadCommand } from './bridge';

const hermeticEnv = (): NodeJS.ProcessEnv => ({});

const runtime = {
  agent: { runPrompt: async () => 'ok' },
  config: { getConfiguredModelId: () => 'gpt-5.4', getConfiguredProvider: () => 'openai' },
  cron: { ensureHeartbeatCronJob: async () => undefined, startCronRunner: () => undefined },
} as unknown as GatewayRuntime;

interface StartedBridge { port: number; stop(): Promise<void> }

async function startInMemoryBridge(token: string): Promise<StartedBridge> {
  const auditPath = join(tmpdir(), `upup-bridge-cli-${Date.now()}-${Math.random()}.log`);
  const server = await startBridgeServer({
    port: 0,
    token,
    auditPath,
    runtime,
    onReloadRequest: async () => ({ extensions: 3, skills: 7, prompts: 1, themes: 0, message: 'cli-test' }),
  });
  return { port: server.port, stop: () => server.stop() };
}

const handles: StartedBridge[] = [];
afterEach(async () => {
  while (handles.length) {
    const h = handles.pop();
    if (h) await h.stop();
  }
});

describe('@upup/pi-cli-bootstrap — runBridgeNotifyReloadCommand', () => {
  test('returns exitCode=1 when token is missing', async () => {
    const result = await runBridgeNotifyReloadCommand({ env: hermeticEnv() });
    expect(result.exitCode).toBe(1);
    expect(result.message).toMatch(/missing token/);
  });

  test('returns exitCode=0 when bridge accepts the reload request', async () => {
    const bridge = await startInMemoryBridge('cli-secret');
    handles.push(bridge);
    const result = await runBridgeNotifyReloadCommand({
      token: 'cli-secret',
      port: bridge.port,
      env: hermeticEnv(),
      triggeredBy: 'cli-test',
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain('bridge reload ok');
    expect(result.message).toContain('"extensions":3');
  });

  test('returns exitCode=2 when the bridge returns 401 (wrong token)', async () => {
    const bridge = await startInMemoryBridge('cli-secret');
    handles.push(bridge);
    const result = await runBridgeNotifyReloadCommand({
      token: 'wrong-token',
      port: bridge.port,
      env: hermeticEnv(),
    });
    expect(result.exitCode).toBe(2);
    expect(result.message).toMatch(/unauthorized|HTTP 401/);
  });

  test('returns exitCode=2 when the bridge refuses the reload (501)', async () => {
    // Spin up a bridge without onReloadRequest hook → 501 reload-not-supported
    const auditPath = join(tmpdir(), `upup-bridge-cli-${Date.now()}-${Math.random()}.log`);
    const bridge = await startBridgeServer({
      port: 0,
      token: 'cli-no-hook',
      auditPath,
      runtime,
    });
    handles.push({ port: bridge.port, stop: () => bridge.stop() });
    const result = await runBridgeNotifyReloadCommand({
      token: 'cli-no-hook',
      port: bridge.port,
      env: hermeticEnv(),
    });
    expect(result.exitCode).toBe(2);
    expect(result.message).toContain('reload-not-supported');
  });

  test('returns exitCode=2 on connection refused', async () => {
    // Use a port nothing is bound on (large ephemeral, closed immediately)
    const result = await runBridgeNotifyReloadCommand({
      token: 'cli-secret',
      port: 1,
      env: hermeticEnv(),
      timeoutMs: 500,
    });
    expect(result.exitCode).toBe(2);
    expect(result.message).toMatch(/error|refused|fetch/i);
  });
});
