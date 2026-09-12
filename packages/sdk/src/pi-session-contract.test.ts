import { describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

interface RpcResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

function startServer(sessionDir: string): ChildProcessWithoutNullStreams {
  const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  return spawn(process.execPath, [join(repositoryRoot, 'src', 'index.tsx'), '--stdio'], {
    cwd: repositoryRoot,
    env: { ...process.env, UPUP_SESSION_DIR: sessionDir },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function request(processHandle: ChildProcessWithoutNullStreams, id: number, method: string, params?: Record<string, unknown>): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const response = JSON.parse(line) as RpcResponse;
          if (response.id !== id) continue;
          processHandle.stdout.off('data', onData);
          response.error ? reject(new Error(response.error.message)) : resolve(response);
          return;
        } catch {
          // Ignore server notifications and incomplete output.
        }
      }
    };
    processHandle.stdout.on('data', onData);
    processHandle.once('error', reject);
    processHandle.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

describe('Pi-backed stdio session contract', () => {
  test('creates, exports, survives process restart, resumes, and ends a Pi session', async () => {
    const sessionDir = await mkdtemp(join(process.cwd(), '.upup', 'sdk-pi-session-'));
    let server = startServer(sessionDir);
    try {
      await request(server, 1, 'initialize', { clientName: 'sdk-test', clientVersion: '1.0.0' });
      const created = (await request(server, 2, 'session/create', { id: 'sdk-pi-fixture' })).result as { id: string; state: string };
      expect(created).toEqual({ id: 'sdk-pi-fixture', state: 'idle', createdAt: expect.any(Number) });
      const info = (await request(server, 3, 'session/get', { id: created.id })).result as { id: string; state: string };
      expect(info.id).toBe(created.id);
      expect(info.state).toBe('idle');
      const messages = (await request(server, 4, 'session/messages', { id: created.id })).result as { messages: unknown[] };
      expect(messages.messages).toEqual([]);
      const resumed = (await request(server, 5, 'session/resume', { id: created.id })).result as { id: string; state: string };
      expect(resumed.id).toBe(created.id);
      expect(resumed.state).toBe('idle');
      const exported = (await request(server, 6, 'session/export', { id: created.id })).result as { path: string };
      expect(exported.path).toEndWith('.jsonl');
      server.kill();
      await new Promise<void>((resolve) => server.once('exit', () => resolve()));
      server = startServer(sessionDir);
      await request(server, 7, 'initialize', { clientName: 'sdk-test-restart', clientVersion: '1.0.0' });
      const afterRestart = (await request(server, 8, 'session/get', { id: created.id })).result as { id: string; state: string };
      expect(afterRestart.id).toBe(created.id);
      expect(afterRestart.state).toBe('idle');
      expect((await request(server, 9, 'session/end', { id: created.id })).result).toEqual({ success: true });
      expect(((await request(server, 10, 'session/get', { id: created.id })).result as { state: string }).state).toBe('completed');
    } finally {
      server.kill();
      await rm(sessionDir, { recursive: true, force: true });
    }
  });
});
