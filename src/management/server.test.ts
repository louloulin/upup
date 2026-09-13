import { afterEach, describe, expect, test } from 'bun:test';
import { startManagementServer, type ManagementServer } from './server.js';
import type { ManagementSnapshotProvider } from './snapshot-provider.js';

let server: ManagementServer | undefined;

const provider: ManagementSnapshotProvider = {
  snapshot: async () => ({
    schema: 1,
    sessionId: 'management-test',
    capturedAt: '2026-09-14T00:00:00.000Z',
    runtime: { name: 'pi', contract: 'upup.pi.host.v1', version: '0.84.3' },
    permissions: { policyId: 'readonly', allowFinancialWrites: false, requireApprovalCount: 0, deniedRiskLevels: ['critical'] },
    packages: [{ name: '@upup/pi-management', version: '0.1.0', enabled: true }],
    tools: { available: 4, native: 4, packageOwned: 4 },
    providers: { marketData: { providers: [{ name: 'yahoo', configured: true }, { name: 'tushare', configured: false }], metrics: { requests: 0, cacheHits: 0, successes: 0, failures: 0, rateLimitFailures: 0, successRatePct: 0, sloStatus: 'unknown', recentSamples: [] } } },
    evidence: [{ source: 'upup-pi://management/session', retrievedAt: '2026-09-14T00:00:00.000Z' }],
  }),
  close: () => undefined,
};

afterEach(async () => {
  await server?.stop();
  server = undefined;
});

describe('management server', () => {
  test('serves the management page and protects the Pi snapshot API', async () => {
    server = await startManagementServer({ port: 0, token: 'management-secret', snapshotProvider: provider });
    const root = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(root.status).toBe(200);
    expect(await root.text()).toContain('UpUp Pi 管理中心');
    expect((await fetch(`http://127.0.0.1:${server.port}/manage`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${server.port}/management`)).status).toBe(200);
    expect((await fetch(`http://127.0.0.1:${server.port}/api/management/snapshot`)).status).toBe(401);
    const response = await fetch(`http://127.0.0.1:${server.port}/api/management/snapshot?token=management-secret`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ schema: 1, runtime: { name: 'pi' }, packages: [{ name: '@upup/pi-management' }] });
  });

  test('returns fail-closed status when snapshot provider fails', async () => {
    server = await startManagementServer({ port: 0, token: 'management-secret', snapshotProvider: { snapshot: async () => { throw new Error('provider unavailable'); }, close: () => undefined } });
    const response = await fetch(`http://127.0.0.1:${server.port}/api/management/snapshot?token=management-secret`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: 'management-snapshot-unavailable', policy: 'fail-closed' });
  });
});
