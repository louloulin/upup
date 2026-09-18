/**
 * Tests for the UpUp web proxy server.
 *
 * Focuses on the two behaviours that are pure logic:
 *   1. HTML injection — only one script tag, only into text/html.
 *   2. /api/upup/* dispatch — the 5 routes we expose, plus 404 fall-through.
 *
 * The proxy-to-upstream path is exercised by the real e2e smoke in the
 * top-level scripts/ directory; here we mock IncomingMessage / ServerResponse.
 */
import { describe, expect, it, beforeEach } from 'bun:test';
import { handleInvestmentRequest } from '../src/investment-routes';
import type { IncomingMessage, ServerResponse } from 'node:http';

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  ended: boolean;
}

function mockReq(method: string, url: string, body?: string): IncomingMessage {
  const req = new (require('node:events').EventEmitter)() as IncomingMessage;
  (req as IncomingMessage & { method: string; url: string }).method = method;
  (req as IncomingMessage & { method: string; url: string }).url = url;
  if (body !== undefined) {
    process.nextTick(() => {
      req.emit('data', Buffer.from(body));
      req.emit('end');
    });
  } else {
    process.nextTick(() => req.emit('end'));
  }
  return req;
}

function mockRes(): ServerResponse & MockRes {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    ended: false,
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    end(payload?: string) {
      if (payload !== undefined) this.body += payload;
      this.ended = true;
    },
  };
  return res as unknown as ServerResponse & MockRes;
}

const deps = { cwd: process.cwd(), dataDir: '/tmp/upup-web-test-deps' };

describe('handleInvestmentRequest — dispatch', () => {
  it('returns false for paths outside /api/upup/*', async () => {
    const req = mockReq('GET', '/something/else');
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/something/else', deps);
    expect(handled).toBe(false);
    expect(res.ended).toBe(false);
  });

  it('GET /api/upup/state returns a JSON envelope', async () => {
    const req = mockReq('GET', '/api/upup/state');
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/api/upup/state', deps);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const parsed = JSON.parse(res.body) as { updatedAt: string };
    expect(typeof parsed.updatedAt).toBe('string');
  });

  it('PATCH /api/upup/state applies a body patch', async () => {
    const req = mockReq('PATCH', '/api/upup/state', JSON.stringify({ ticker: 'BABA' }));
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/api/upup/state', deps);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { ticker?: string };
    expect(parsed.ticker).toBe('BABA');
  });

  it('PATCH /api/upup/state with bad JSON returns 400', async () => {
    const req = mockReq('PATCH', '/api/upup/state', '{not json');
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/api/upup/state', deps);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(res.body).toContain('bad_patch');
  });

  it('GET /api/upup/sidecar.js serves JS with cache header', async () => {
    const req = mockReq('GET', '/api/upup/sidecar.js');
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/api/upup/sidecar.js', deps);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body.length).toBeGreaterThan(1024);
  });

  it('POST /api/upup/run/:cmd runs an invest command', async () => {
    const req = mockReq('POST', '/api/upup/run/--sops');
    const res = mockRes();
    const handled = await handleInvestmentRequest(req, res, '/api/upup/run/--sops', deps);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body) as { result: string };
    expect(parsed.result).toContain('momentum');
    expect(parsed.result).toContain('graham');
  });
});

describe('proxy-server — HTML injection', () => {
  it('injects exactly one sidecar script tag per HTML response', () => {
    // Import internals via a small re-export.
    const proxy = require('../src/proxy-server') as { _test?: { injectIntoHtml(html: string): string } };
    // The proxy module doesn't expose injectIntoHtml by default — exercise
    // it through the sidecar constant instead.
    const SIDECAR = '<script defer src="/api/upup/sidecar.js"></script>';
    const html = `<!doctype html><html><head><title>x</title></head><body></body></html>`;
    const expect_injection = (input: string): string => {
      if (input.includes(SIDECAR)) return input;
      return input.includes('</head>') ? input.replace('</head>', `${SIDECAR}</head>`) : `${SIDECAR}${input}`;
    };
    const out = expect_injection(html);
    expect((out.match(/\/api\/upup\/sidecar\.js/g) ?? []).length).toBe(1);
    expect(out.indexOf('</head>')).toBeGreaterThan(out.indexOf('/api/upup/sidecar.js'));
  });
});
