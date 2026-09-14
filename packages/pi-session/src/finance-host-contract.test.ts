import { describe, expect, test } from 'bun:test';
import {
  createPiFinanceHostBridge,
  PI_FINANCE_HOST_CONTRACT,
  PI_FINANCE_PACKAGE_NAME,
  PI_FINANCE_PACKAGE_VERSION,
} from './finance-host-contract.js';

describe('Pi finance host contract', () => {
  test('exposes only the declared v1 capability for the owning session', () => {
    const definitions = [{ name: 'host_quote' }] as never[];
    const bridge = createPiFinanceHostBridge('session-a', () => definitions);

    expect(bridge.contract).toBe(PI_FINANCE_HOST_CONTRACT);
    expect(bridge.packageName).toBe(PI_FINANCE_PACKAGE_NAME);
    expect(bridge.packageVersion).toBe(PI_FINANCE_PACKAGE_VERSION);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toBe(definitions);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-b',
      capability: 'tool-definitions',
    })).toEqual([]);
  });

  test('rejects unknown contract and capability requests without invoking the provider', () => {
    let calls = 0;
    const bridge = createPiFinanceHostBridge('session-a', () => {
      calls += 1;
      return [];
    });
    expect(bridge.providers.tools.getToolDefinitions({
      contract: 'upup.pi.finance.host.v0' as typeof PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-a',
      capability: 'unknown' as 'tool-definitions',
    })).toEqual([]);
    expect(calls).toBe(0);
  });

  test('rejects a package identity mismatch without invoking the provider', () => {
    let calls = 0;
    const bridge = createPiFinanceHostBridge('session-a', () => {
      calls += 1;
      return [];
    });
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: '@upup/other-finance-package' as typeof PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(bridge.providers.tools.getToolDefinitions({
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: '0.2.0' as typeof PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'session-a',
      capability: 'tool-definitions',
    })).toEqual([]);
    expect(calls).toBe(0);
  });
});
