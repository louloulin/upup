/**
 * UpUp web HTTP proxy.
 *
 * Sits between the browser and the npm-installed @agegr/pi-web dev
 * server. Owns every `/api/upup/*` request; forwards everything else
 * upstream. For `text/html` responses, injects one <script> tag so the
 * vanilla JS sidecar runs inside the upstream React tree, and rewrites
 * <title> / meta tags / favicon links to the UpUp brand.
 *
 * Sprint I fail-closed: probe `web/upup-sidecar.js` at startup. When the
 * bundle is missing the proxy still serves the page, but skips the
 * `<script>` injection so the browser never loads a 500 stub. The same
 * probe feeds `/api/upup/health` so `upup web` callers (and tests) can
 * see the sidecar status without scraping HTML.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { handleInvestmentRequest, type InvestmentRouteDeps } from './investment-routes';
import { injectIntoHtml } from './rebrand';

const SIDECAR_SCRIPT = '<script defer src="/api/upup/sidecar.js"></script>';

function isHtmlResponse(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ct === 'text/html';
}

export interface ProxyOptions {
  readonly publicPort: number;
  readonly upstreamPort: number;
  readonly cwd: string;
  readonly dataDir: string;
}

export interface ProxyHandle {
  readonly port: number;
  readonly pid: number;
  close(): Promise<void>;
}

/**
 * Snapshot of the sidecar-bundle probe taken once at server start.
 *
 * `ok === true` means the bundle is non-empty and present on disk. When
 * `ok === false` the proxy still starts (fail-closed), but it skips the
 * `<script>` injection and reports the failure on `/api/upup/health`.
 */
export interface SidecarProbe {
  readonly ok: boolean;
  readonly path: string;
  readonly bytes: number;
  readonly reason?: string;
}

function probeSidecarBundle(): SidecarProbe {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, '..', 'web', 'upup-sidecar.js');
  if (!existsSync(path)) {
    return { ok: false, path, bytes: 0, reason: 'sidecar bundle not found at expected path' };
  }
  let size: number;
  try {
    size = statSync(path).size;
  } catch (err) {
    return {
      ok: false,
      path,
      bytes: 0,
      reason: `sidecar stat failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (size < 1024) {
    return {
      ok: false,
      path,
      bytes: size,
      reason: `sidecar bundle too small (${size} bytes; expected >= 1024)`,
    };
  }
  return { ok: true, path, bytes: size };
}

export async function startProxyServer(opts: ProxyOptions): Promise<ProxyHandle> {
  const investmentDeps: InvestmentRouteDeps = { cwd: opts.cwd, dataDir: opts.dataDir };
  const sidecar = probeSidecarBundle();
  if (!sidecar.ok) {
    // Fail-closed: log once at startup so callers see the cause, but keep
    // serving the page (skip the sidecar injection in `proxyUpstream`).
    // The `fail` channel is used so `upup doctor` can pick this up via the
    // existing log infra.
    console.warn(`[upup-web] sidecar unavailable; widget will not load: ${sidecar.reason ?? 'unknown'} (path=${sidecar.path})`);
  }
  const server: Server = createServer((req, res) => {
    const boundPort = (server as unknown as { __upupBoundPort?: number }).__upupBoundPort ?? opts.publicPort;
    void handleRequest(req, res, opts, investmentDeps, sidecar, boundPort);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(opts.publicPort, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : opts.publicPort;
  const handle: ProxyHandle = {
    port: boundPort,
    pid: process.pid,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
  // Health endpoint reports the actually-bound port, not the caller's
  // request (which may have been 0 for "pick a free ephemeral port").
  (server as unknown as { __upupBoundPort: number }).__upupBoundPort = boundPort;
  return handle;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
  investmentDeps: InvestmentRouteDeps,
  sidecar: SidecarProbe,
  boundPort: number,
): Promise<void> {
  const url = req.url ?? '/';
  if (url.startsWith('/api/upup/')) {
    if (url === '/api/upup/health' && req.method === 'GET') {
      sendJson(res, 200, {
        ok: sidecar.ok,
        sidecar: { ...sidecar },
        publicPort: boundPort,
        upstreamPort: opts.upstreamPort,
      });
      return;
    }
    const handled = await handleInvestmentRequest(req, res, url, investmentDeps);
    if (handled) return;
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not_found', path: url }));
    return;
  }
  proxyUpstream(req, res, opts, sidecar);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body) + '\n', 'utf8');
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('content-length', String(payload.length));
  res.end(payload);
}

function proxyUpstream(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
  sidecar: SidecarProbe,
): void {
  const upstreamReq = httpRequest(
    {
      host: '127.0.0.1',
      port: opts.upstreamPort,
      method: req.method,
      path: req.url,
      headers: { ...req.headers, host: `127.0.0.1:${opts.upstreamPort}` },
    },
    (upstreamRes) => {
      const contentType = upstreamRes.headers['content-type'];
      const isHtml = isHtmlResponse(typeof contentType === 'string' ? contentType : undefined);
      if (isHtml) {
        const chunks: Buffer[] = [];
        upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        upstreamRes.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          // Sprint I: when the sidecar bundle is missing, skip the <script>
          // injection entirely. The page still loads; only the in-page
          // widget is gone. `injectIntoHtml` already de-dupes on re-entry,
          // so the missing script tag means a clean HTML response.
          const injected = sidecar.ok ? injectIntoHtml(body, SIDECAR_SCRIPT) : body;
          const out = Buffer.from(injected, 'utf8');
          res.statusCode = upstreamRes.statusCode ?? 200;
          for (const [k, v] of Object.entries(upstreamRes.headers)) {
            if (v !== undefined) res.setHeader(k, v as string);
          }
          res.setHeader('content-length', String(out.length));
          res.end(out);
        });
        return;
      }
      res.statusCode = upstreamRes.statusCode ?? 200;
      for (const [k, v] of Object.entries(upstreamRes.headers)) {
        if (v !== undefined) res.setHeader(k, v as string);
      }
      upstreamRes.pipe(res);
    },
  );
  upstreamReq.on('error', (err) => {
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain');
    res.end(`upstream error: ${err.message}`);
  });
  req.pipe(upstreamReq);
}

export const __proxyTestHooks = {
  probeSidecarBundle,
  isHtmlResponse,
};
