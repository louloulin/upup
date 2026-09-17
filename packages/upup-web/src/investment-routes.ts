/**
 * /api/upup/* routes — all delegate to @upup/pi-investment-workflow so
 * MCP clients, TradingAgents, Claude Code, and Codex see the same
 * dossier / watchlist / run surface the TUI exposes.
 *
 * Endpoints:
 *   GET  /api/upup/sidecar.js         — vanilla JS widget bundle
 *   GET  /api/upup/state             — read investment state JSON
 *   PATCH /api/upup/state            — merge update to investment state
 *   GET  /api/upup/watchlist         — current watchlist
 *   POST /api/upup/run/:cmd          — run an investment CLI command
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWatchlist, runInvest } from '@upup/pi-investment-workflow';
import { getInvestmentState, patchInvestmentState } from './investment-state';

export interface InvestmentRouteDeps {
  readonly cwd: string;
  readonly dataDir: string;
}

const SIDECAR_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'upup-sidecar.js');

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBodyJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return await new Promise<Record<string, unknown>>((resolveBody, rejectBody) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolveBody({});
      try {
        resolveBody(JSON.parse(text) as Record<string, unknown>);
      } catch (err) {
        rejectBody(err instanceof Error ? err : new Error(String(err)));
      }
    });
    req.on('error', rejectBody);
  });
}

export async function handleInvestmentRequest(
  req: IncomingMessage,
  res: ServerResponse,
  url: string,
  deps: InvestmentRouteDeps,
): Promise<boolean> {
  const path = url.split('?')[0] ?? '/';

  if (req.method === 'GET' && path === '/api/upup/sidecar.js') {
    try {
      const body = await readFile(SIDECAR_FILE);
      res.statusCode = 200;
      res.setHeader('content-type', 'application/javascript; charset=utf-8');
      res.setHeader('cache-control', 'public, max-age=300');
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.end(`// sidecar unavailable: ${err instanceof Error ? err.message : String(err)}`);
    }
    return true;
  }

  if (req.method === 'GET' && path === '/api/upup/state') {
    sendJson(res, 200, await getInvestmentState({ dataDir: deps.dataDir }));
    return true;
  }

  if (req.method === 'PATCH' && path === '/api/upup/state') {
    try {
      const patch = await readBodyJson(req);
      const next = await patchInvestmentState({ dataDir: deps.dataDir }, patch);
      sendJson(res, 200, next);
    } catch (err) {
      sendJson(res, 400, { error: 'bad_patch', message: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  if (req.method === 'GET' && path === '/api/upup/watchlist') {
    const watchlist = await readWatchlist();
    sendJson(res, 200, { watchlist });
    return true;
  }

  const runMatch = /^\/api\/upup\/run\/(.+)$/.exec(path);
  if (req.method === 'POST' && runMatch) {
    const cmd = decodeURIComponent(runMatch[1] ?? '');
    try {
      const result = await runInvest(cmd);
      sendJson(res, 200, { result });
    } catch (err) {
      sendJson(res, 500, { error: 'run_failed', message: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
