import { describe, expect, test } from 'bun:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { publishPiCapabilityHosts } from '@upup/pi-capability-registry';
import managementExtension from './index';

const snapshot = {
  schema: 1 as const,
  sessionId: 'session-tail',
  capturedAt: '2026-09-14T00:00:00.000Z',
  runtime: { name: 'pi' as const, contract: 'upup.pi.host.v1' as const, version: '0.85.1' },
  permissions: { policyId: 'read-only', allowFinancialWrites: false, requireApprovalCount: 1, deniedRiskLevels: ['critical'] },
  packages: [{ name: '@upup/pi-market-data', version: '0.1.0', enabled: true as const }],
  tools: { available: 3, native: 2, packageOwned: 3 },
  providers: { marketData: { providers: [{ name: 'yahoo' as const, configured: true }, { name: 'tushare' as const, configured: false }], metrics: { requests: 2, cacheHits: 1, successes: 1, failures: 1, rateLimitFailures: 0, successRatePct: 50, sloStatus: 'degraded' as const } } },
  evidence: [{ source: 'upup-pi://management/session', retrievedAt: '2026-09-14T00:00:00.000Z' }],
};

describe('pi-management extension', () => {
  test('registers read-only management tools and exposes redacted status', async () => {
    const tools = new Map<string, any>();
    const events = createEventBus();
    const dispose = publishPiCapabilityHosts(events, 'session-tail', new Map([['@upup/pi-management', { contract: 'upup.pi.host.v1', packageName: '@upup/pi-management', packageVersion: '0.1.0', sessionId: 'session-tail', capabilities: ['management-snapshot'], providers: { management: { getManagementSnapshot: () => snapshot } } }]]));
    managementExtension({ events, registerTool: (tool) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['management_system_snapshot', 'management_provider_status', 'management_package_status', 'management_runtime_status']);
    const result = await tools.get('management_provider_status').execute('management-1', { provider: 'tushare' }, new AbortController().signal);
    expect(JSON.parse(result.content[0].text)).toEqual({ providers: [{ name: 'tushare', configured: false }], metrics: snapshot.providers.marketData.metrics, capturedAt: snapshot.capturedAt });
    expect(result.content[0].text).not.toContain('TOKEN');
    dispose();
  });

  test('fails closed when the host capability is missing', async () => {
    const tools = new Map<string, any>();
    managementExtension({ events: createEventBus(), registerTool: (tool) => tools.set(tool.name, tool) } as never);
    const result = await tools.get('management_system_snapshot').execute('management-2', {}, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('fail-closed');
  });
});
