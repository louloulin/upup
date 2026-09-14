import { describe, expect, test } from 'bun:test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

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

function request(processHandle: ChildProcessWithoutNullStreams, id: number, method: string, params?: Record<string, unknown>, timeoutMs = 15_000): Promise<RpcResponse> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      processHandle.stdout.off('data', onData);
      reject(new Error(`stdio request timed out: ${method}`));
    }, timeoutMs);
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
          clearTimeout(timer);
          response.error ? reject(new Error(response.error.message)) : resolve(response);
          return;
        } catch {
          // Ignore server notifications and incomplete output.
        }
      }
    };
    processHandle.stdout.on('data', onData);
    processHandle.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    processHandle.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

describe('Pi-backed stdio session contract', () => {
  test('creates, exports, survives process restart, resumes, and ends a Pi session', async () => {
    await mkdir(join(process.cwd(), '.upup'), { recursive: true });
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

  test('serializes concurrent cross-process updates and keeps independent sessions isolated', async () => {
    await mkdir(join(process.cwd(), '.upup'), { recursive: true });
    const sessionDir = await mkdtemp(join(process.cwd(), '.upup', 'sdk-pi-concurrency-'));
    const first = startServer(sessionDir);
    const second = startServer(sessionDir);
    try {
      await Promise.all([
        request(first, 1, 'initialize', { clientName: 'sdk-concurrency-a', clientVersion: '1.0.0' }),
        request(second, 1, 'initialize', { clientName: 'sdk-concurrency-b', clientVersion: '1.0.0' }),
      ]);
      await Promise.all([
        request(first, 2, 'session/create', { id: 'sdk-concurrent-a' }),
        request(second, 2, 'session/create', { id: 'sdk-concurrent-b' }),
      ]);
      await Promise.all([
        request(first, 3, 'session/update', { id: 'sdk-concurrent-a', metadata: { writer: 'first' } }),
        request(second, 3, 'session/update', { id: 'sdk-concurrent-a', metadata: { writer: 'second' } }),
      ]);
      const exported = (await request(first, 4, 'session/export', { id: 'sdk-concurrent-a' })).result as { path: string };
      const lines = (await readFile(exported.path, 'utf8')).split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(() => lines.forEach((line) => JSON.parse(line))).not.toThrow();
      expect(JSON.parse(lines[0])).toMatchObject({ type: 'session', id: 'sdk-concurrent-a' });

      first.kill();
      second.kill();
      await Promise.all([
        new Promise<void>((resolve) => first.once('exit', () => resolve())),
        new Promise<void>((resolve) => second.once('exit', () => resolve())),
      ]);
      const restarted = startServer(sessionDir);
      try {
        await request(restarted, 5, 'initialize', { clientName: 'sdk-concurrency-restart', clientVersion: '1.0.0' });
        expect(((await request(restarted, 6, 'session/get', { id: 'sdk-concurrent-a' })).result as { id: string }).id).toBe('sdk-concurrent-a');
        expect(((await request(restarted, 7, 'session/get', { id: 'sdk-concurrent-b' })).result as { id: string }).id).toBe('sdk-concurrent-b');
      } finally {
        restarted.kill();
      }
    } finally {
      first.kill();
      second.kill();
      await rm(sessionDir, { recursive: true, force: true });
    }
  }, 15_000);
});
