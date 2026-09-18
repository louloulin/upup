/**
 * UpUp web HTTP proxy.
 *
 * Sits between the browser and the npm-installed @agegr/pi-web dev
 * server. Owns every `/api/upup/*` request; forwards everything else
 * upstream. For `text/html` responses, injects one <script> tag so the
 * vanilla JS sidecar runs inside the upstream React tree, and rewrites
 * <title> / meta tags / favicon links to the UpUp brand.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { handleInvestmentRequest, type InvestmentRouteDeps } from './investment-routes';
import { injectIntoHtml } from './rebrand';

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

const SIDECAR_SCRIPT = '<script defer src="/api/upup/sidecar.js"></script>';

function isHtmlResponse(contentType: string | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  return ct === 'text/html';
}

export async function startProxyServer(opts: ProxyOptions): Promise<ProxyHandle> {
  const investmentDeps: InvestmentRouteDeps = { cwd: opts.cwd, dataDir: opts.dataDir };
  const server: Server = createServer((req, res) => {
    void handleRequest(req, res, opts, investmentDeps);
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(opts.publicPort, '127.0.0.1', () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : opts.publicPort;
  return {
    port,
    pid: process.pid,
    close: () => new Promise<void>((resolveClose) => server.close(() => resolveClose())),
  };
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: ProxyOptions,
  investmentDeps: InvestmentRouteDeps,
): Promise<void> {
  const url = req.url ?? '/';
  if (url.startsWith('/api/upup/')) {
    const handled = await handleInvestmentRequest(req, res, url, investmentDeps);
    if (handled) return;
    res.statusCode = 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'not_found', path: url }));
    return;
  }
  proxyUpstream(req, res, opts);
}

function proxyUpstream(req: IncomingMessage, res: ServerResponse, opts: ProxyOptions): void {
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
          const injected = injectIntoHtml(body, SIDECAR_SCRIPT);
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
