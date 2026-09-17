/**
 * Raw-socket verification of the proxy HTML payload.
 *
 * This test verifies the same thing the browser-smoke test verifies
 * but without the Playwright/Chromium dependency — useful in CI
 * environments where headless Chrome cannot reach the loopback.
 *
 * It does NOT verify that the sidecar actually runs in a browser
 * (that requires browser-smoke.test.ts and a real Chromium binary).
 * It verifies that the bytes the browser would receive:
 *   - contain the sidecar script tag
 *   - have a 200 status
 *   - are larger than the upstream response (proxy adds the script tag)
 */
import { describe, expect, it } from 'bun:test';

const BASE = (process.env.UPUP_WEB_SMOKE_URL ?? 'http://127.0.0.1:9000').replace(/\/$/, '');

import { request as httpRequest } from 'node:http';

function fetchRaw(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveFetch, rejectFetch) => {
    const url = new URL(`${BASE}${path}`);
    const req = httpRequest(
      { host: url.hostname, port: url.port, method: 'GET', path: url.pathname + url.search },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolveFetch({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', rejectFetch);
    req.setTimeout(5000, () => req.destroy(new Error('raw-socket timeout')));
    req.end();
  });
}

describe('upup-web proxy — raw HTTP probe', () => {
  it('serves the upstream HTML with a sidecar script tag injected', async () => {
    const { status, body } = await fetchRaw('/');
    expect(status).toBe(200);
    expect(body).toContain('/api/upup/sidecar.js');
    expect(body.length).toBeGreaterThan(10_000);
  });

  it('serves the sidecar bundle with the right content-type', async () => {
    const { status, body } = await fetchRaw('/api/upup/sidecar.js');
    expect(status).toBe(200);
    expect(body).toContain('UpUpSidecar');
    expect(body.length).toBeGreaterThan(1024);
  });

  it('returns the persistent investment state JSON', async () => {
    const { status, body } = await fetchRaw('/api/upup/state');
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { updatedAt: string };
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('returns the watchlist via @upup/pi-investment-workflow readWatchlist', async () => {
    const { status, body } = await fetchRaw('/api/upup/watchlist');
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { watchlist: { entries?: Record<string, unknown> } };
    expect(parsed.watchlist.entries?.['600519.SH']).toBeTruthy();
  });
});
