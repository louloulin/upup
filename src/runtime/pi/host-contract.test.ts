import { describe, expect, test } from 'bun:test';
import {
  createPiHostBridge,
  PI_HOST_CAPABILITIES,
  PI_HOST_CONTRACT,
} from './host-contract.js';

describe('generic Pi host contract', () => {
  test('serves only the exact package and session capability request', () => {
    const definitions = [{ name: 'portfolio_host_tool' }] as never[];
    const bridge = createPiHostBridge('session-a', '@upup/pi-portfolio', '0.1.0', () => definitions);

    expect(bridge.contract).toBe(PI_HOST_CONTRACT);
    expect(bridge.capabilities).toEqual(['tool-definitions']);
    expect(bridge.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-portfolio',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toBe(definitions);
    expect(bridge.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-risk',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
  });

  test('does not invoke the provider for stale or malformed requests', () => {
    let calls = 0;
    const bridge = createPiHostBridge('session-a', '@upup/pi-backtest', '0.1.0', () => {
      calls += 1;
      return [];
    });

    expect(bridge.getToolDefinitions({
      contract: 'upup.pi.host.v0' as typeof PI_HOST_CONTRACT,
      packageName: '@upup/pi-backtest',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(bridge.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-backtest',
      packageVersion: '0.1.0',
      sessionId: 'session-b',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(calls).toBe(0);
  });
});
