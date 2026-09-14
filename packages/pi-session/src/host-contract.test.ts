import { describe, expect, test } from 'bun:test';
import {
  createPiHostBridge,
  PI_HOST_CAPABILITIES,
  PI_HOST_CONTRACT,
  negotiatePiProviderContract,
} from './host-contract.js';

describe('generic Pi host contract', () => {
  test('serves only the exact package and session capability request', () => {
    const definitions = [{ name: 'portfolio_host_tool' }] as never[];
    const bridge = createPiHostBridge({ sessionId: 'session-a', packageName: '@upup/pi-portfolio', packageVersion: '0.1.0', providers: { tools: { getToolDefinitions: () => definitions, getToolMetadata: () => [] } } });

    expect(bridge.contract).toBe(PI_HOST_CONTRACT);
    expect(bridge.capabilities).toEqual(['tool-definitions']);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-portfolio',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toBe(definitions);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-risk',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
  });

  test('does not invoke the provider for stale or malformed requests', () => {
    let calls = 0;
    const bridge = createPiHostBridge({ sessionId: 'session-a', packageName: '@upup/pi-backtest', packageVersion: '0.1.0', providers: { tools: { getToolDefinitions: () => {
      calls += 1;
      return [];
    }, getToolMetadata: () => [] } } });

    expect(bridge.providers.tools.getToolDefinitions({
      contract: 'upup.pi.host.v0' as typeof PI_HOST_CONTRACT,
      packageName: '@upup/pi-backtest',
      packageVersion: '0.1.0',
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-backtest',
      packageVersion: '0.1.0',
      sessionId: 'session-b',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(calls).toBe(0);
  });

  test('keeps capability providers isolated by contract group', () => {
    const bridge = createPiHostBridge({
      sessionId: 'session-isolated',
      packageName: '@upup/pi-market-data',
      packageVersion: '0.1.0',
      providers: {
        tools: { getToolDefinitions: () => [], getToolMetadata: () => [] },
        marketData: { getMarketQuoteFetcher: () => fetch },
      },
    });
    expect(bridge.providers.tools).not.toHaveProperty('getMarketQuoteFetcher');
    expect(bridge.providers.marketData?.getMarketQuoteFetcher).toBeDefined();
    expect(bridge.capabilities).toEqual(['tool-definitions', 'market-data-transport']);
  });

  test('negotiates provider versions and fails closed after dispose', async () => {
    let calls = 0;
    const bridge = createPiHostBridge({
      sessionId: 'session-lifecycle',
      packageName: '@upup/pi-risk',
      packageVersion: '0.1.0',
      providers: { tools: { getToolDefinitions: () => { calls += 1; return []; }, getToolMetadata: () => [] } },
    });
    negotiatePiProviderContract(bridge.providerContract, '1.0.0');
    expect(bridge.providerContract.state).toBe('active');
    await bridge.providerContract.reload();
    expect(bridge.providerContract.state).toBe('active');
    await bridge.providerContract.dispose();
    expect(bridge.providerContract.state).toBe('disposed');
    expect(() => bridge.providers.tools.getToolDefinitions({
      contract: PI_HOST_CONTRACT,
      packageName: '@upup/pi-risk',
      packageVersion: '0.1.0',
      sessionId: 'session-lifecycle',
      capability: 'tool-definitions',
    })).toThrow('disposed');
    expect(calls).toBe(0);
    expect(() => negotiatePiProviderContract(bridge.providerContract, '1.0.0')).toThrow('active');
  });
});
