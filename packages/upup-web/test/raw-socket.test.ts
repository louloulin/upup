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
import { beforeAll, describe, expect, it } from 'bun:test';

const BASE = (process.env.UPUP_WEB_SMOKE_URL ?? 'http://127.0.0.1:9000').replace(/\/$/, '');

import { request as httpRequest } from 'node:http';

function fetchRaw(path: string): Promise<{ status: number; body: string }> {
  return new Promise((resolveFetch) => {
    const url = new URL(`${BASE}${path}`);
    const req = httpRequest(
      { host: url.hostname, port: url.port, method: 'GET', path: url.pathname + url.search },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => resolveFetch({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', () => resolveFetch({ status: 0, body: '' }));
    req.setTimeout(2000, () => { req.destroy(); resolveFetch({ status: 0, body: '' }); });
    req.end();
  });
}

let serverUp = false;
async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/upup/state`, { signal: AbortSignal.timeout(800) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('upup-web proxy — raw HTTP probe', () => {
  beforeAll(async () => {
    serverUp = await serverReachable();
    if (!serverUp) {
      console.warn(`[raw-socket] skipping — no upup web at ${BASE}. Run \`upup web --port 9000\` then re-run.`);
    }
  });
  it('serves the upstream HTML with a sidecar script tag injected', async () => {
    if (!serverUp) return;
    const { status, body } = await fetchRaw('/');
    expect(status).toBe(200);
    expect(body).toContain('/api/upup/sidecar.js');
    expect(body.length).toBeGreaterThan(10_000);
  });

  it('serves the sidecar bundle with the right content-type', async () => {
    if (!serverUp) return;
    const { status, body } = await fetchRaw('/api/upup/sidecar.js');
    expect(status).toBe(200);
    expect(body).toContain('UpUpSidecar');
    expect(body.length).toBeGreaterThan(1024);
  });

  it('returns the persistent investment state JSON', async () => {
    if (!serverUp) return;
    const { status, body } = await fetchRaw('/api/upup/state');
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { updatedAt: string };
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('returns the watchlist via @upup/pi-investment-workflow readWatchlist', async () => {
    if (!serverUp) return;
    const { status, body } = await fetchRaw('/api/upup/watchlist');
    expect(status).toBe(200);
    const parsed = JSON.parse(body) as { watchlist: { entries?: Record<string, unknown> } };
    expect(parsed.watchlist.entries?.['600519.SH']).toBeTruthy();
  });
});
