import { timingSafeEqual } from 'node:crypto';
import { renderManagementPage } from './management-page.js';
import type { ManagementSnapshotProvider } from './snapshot-provider.js';

export interface ManagementServerConfig {
  readonly port: number;
  readonly bind?: string;
  readonly token: string;
  readonly snapshotProvider: ManagementSnapshotProvider;
}

export interface ManagementServer {
  readonly port: number;
  stop(): Promise<void>;
}

function authorized(request: Request, token: string): boolean {
  const url = new URL(request.url);
  const provided = url.searchParams.get('token') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  const left = Buffer.from(provided);
  const right = Buffer.from(token);
  return left.length >= 8 && left.length === right.length && timingSafeEqual(left, right);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function startManagementServer(config: ManagementServerConfig): Promise<ManagementServer> {
  const server = Bun.serve({
    port: config.port,
    hostname: config.bind ?? '127.0.0.1',
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === 'GET' && ['/', '/manage', '/management'].includes(url.pathname)) {
        return new Response(renderManagementPage(), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
      }
      if (request.method === 'GET' && url.pathname === '/health') {
        return json(200, { ok: true, service: 'upup-pi-management', version: '1.0.0' });
      }
      if (url.pathname === '/api/management/snapshot') {
        if (request.method !== 'GET') return json(405, { error: 'method-not-allowed' });
        if (!authorized(request, config.token)) return json(401, { error: 'unauthorized' });
        try {
          return json(200, await config.snapshotProvider.snapshot());
        } catch (error) {
          return json(503, { error: 'management-snapshot-unavailable', policy: 'fail-closed', message: error instanceof Error ? error.message.slice(0, 200) : 'snapshot unavailable' });
        }
      }
      return new Response('Not found', { status: 404 });
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    port: server.port ?? 0,
    async stop() {
      await server.stop();
      config.snapshotProvider.close();
    },
  };
}

export const _internal = { authorized };
