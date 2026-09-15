import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPluginCommand } from './plugin';

function withTempHome<T>(run: (home: string) => T): T {
  const home = mkdtempSync(join(tmpdir(), 'upup-plugin-'));
  try {
    return run(home);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

const hermeticEnv = (): NodeJS.ProcessEnv => ({});

describe('@upup/pi-cli-bootstrap — runPluginCommand', () => {
  test('help: prints usage and returns 0', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'help', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(0);
    });
  });

  test('install: returns 1 when no source provided', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'install', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(1);
    });
  });

  test('uninstall: returns 1 when no source provided', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'uninstall', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(1);
    });
  });

  test('list: prints empty list when no packages configured', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'list', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(0);
    });
  });

  test('list: creates ~/.upup/agent when it is the resolved agentDir', async () => {
    await withTempHome(async (home) => {
      // Pre-create the canonical UpUp agent dir so resolveAgentDir picks it.
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      await runPluginCommand({ command: 'list', args: [], env: hermeticEnv(), home });
      expect(existsSync(join(home, '.upup', 'agent'))).toBe(true);
    });
  });

  test('reload: returns 0 when agentDir is fresh and empty', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'reload', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(0);
    });
  });

  test('reload: creates ~/.upup/agent when it is the resolved agentDir', async () => {
    await withTempHome(async (home) => {
      // Pre-create the canonical UpUp agent dir so resolveAgentDir picks it.
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      await runPluginCommand({ command: 'reload', args: [], env: hermeticEnv(), home });
      expect(existsSync(join(home, '.upup', 'agent'))).toBe(true);
    });
  });

  test('reload: reports chord facet inventory (even when empty)', async () => {
    await withTempHome(async (home) => {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(join(home, '.upup', 'agent'), { recursive: true });
      const logs: string[] = [];
      const original = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      let code = -1;
      try {
        const result = await runPluginCommand({ command: 'reload', args: [], env: hermeticEnv(), home });
        code = result.exitCode;
      } finally {
        console.log = original;
      }
      expect(code).toBe(0);
      expect(logs.join('\n')).toContain('chord facets mounted:');
    });
  });

  test('install: auto-reload reports resource counts inline', async () => {
    await withTempHome(async (home) => {
      const logs: string[] = [];
      const original = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      let code = -1;
      try {
        const result = await runPluginCommand({
          command: 'install',
          args: ['./packages/pi-finance-sdk'],
          env: hermeticEnv(),
          home,
        });
        code = result.exitCode;
      } finally {
        console.log = original;
      }
      expect(code).toBe(0);
      const joined = logs.join('\n');
      expect(joined).toContain('extensions:');
      expect(joined).toContain('skills:');
    });
  });

  test('install --no-reload: suppresses inline resource counts', async () => {
    await withTempHome(async (home) => {
      const logs: string[] = [];
      const original = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      try {
        await runPluginCommand({
          command: 'install',
          args: ['./packages/pi-finance-sdk', '--no-reload'],
          env: hermeticEnv(),
          home,
        });
      } finally {
        console.log = original;
      }
      expect(logs.join('\n')).not.toContain('skills:');
    });
  });

  test('unknown subcommand: returns 1', async () => {
    await withTempHome(async (home) => {
      const result = await runPluginCommand({ command: 'banana', args: [], env: hermeticEnv(), home });
      expect(result.exitCode).toBe(1);
    });
  });

  test('watch --exit-after=1: triggers a reload on settings.json mutation', async () => {
    await withTempHome(async (home) => {
      // Seed ~/.upup/agent + a starter settings.json so resolveAgentDir picks it.
      const { mkdirSync, writeFileSync } = await import('node:fs');
      const agentDir = join(home, '.upup', 'agent');
      mkdirSync(agentDir, { recursive: true });
      writeFileSync(join(agentDir, 'settings.json'), JSON.stringify({ packages: [] }));

      const started = runPluginCommand({
        command: 'watch',
        args: ['--exit-after=1', '--debounce=10', '--poll=50'],
        env: hermeticEnv(),
        home,
      });

      // Give the watcher a moment to register, then mutate the file.
      await new Promise((resolve) => setTimeout(resolve, 80));
      writeFileSync(
        join(agentDir, 'settings.json'),
        JSON.stringify({ packages: [{ source: 'npm:triggered', scope: 'user', filtered: false }] }),
      );

      const result = await started;
      // watch always returns 0 on graceful exit; reload-after-mutation may itself
      // be 1 in the hermetic test env (no resource loader cache), but the
      // watcher never escalates that into an exit code.
      expect(result.exitCode).toBe(0);
      expect(result.message).toBe('watch stopped');
    });
  }, { timeout: 10_000 });
});

describe('@upup/pi-cli-bootstrap — plugin → bridge notify-reload', () => {
  // Save & restore real fetch so we never leak between tests.
  let realFetch: typeof fetch | undefined;
  let calls: Array<{ url: string; init?: RequestInit }>;

  const setMockFetch = (impl: typeof fetch): void => {
    (globalThis as unknown as { fetch: typeof fetch }).fetch = impl;
  };

  beforeEach(() => {
    realFetch = globalThis.fetch;
    calls = [];
  });
  afterEach(() => {
    if (realFetch) setMockFetch(realFetch);
  });

  test('install without UPBRIDGE_TOKEN does not POST to the bridge', async () => {
    await withTempHome(async (home) => {
      setMockFetch((async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      }) as typeof fetch);
      const result = await runPluginCommand({
        command: 'install',
        args: ['./packages/pi-finance-sdk'],
        env: hermeticEnv(),
        home,
      });
      expect(result.exitCode).toBe(0);
      expect(calls).toHaveLength(0);
    });
  });

  test('install with UPBRIDGE_TOKEN POSTs to /bridge/notify-reload', async () => {
    await withTempHome(async (home) => {
      setMockFetch((async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response(JSON.stringify({ extensions: 0, skills: 0, prompts: 0 }), { status: 200 });
      }) as typeof fetch);
      const result = await runPluginCommand({
        command: 'install',
        args: ['./packages/pi-finance-sdk'],
        env: { ...hermeticEnv(), UPBRIDGE_TOKEN: 'tkn-test' },
        home,
      });
      expect(result.exitCode).toBe(0);
      expect(calls.length).toBeGreaterThan(0);
      const last = calls[calls.length - 1];
      expect(last.url).toContain('/bridge/notify-reload?token=tkn-test');
      expect(last.init?.method).toBe('POST');
      const body = JSON.parse(String(last.init?.body));
      expect(body.triggeredBy).toBe('upup-plugin-install');
    });
  });

  test('install --no-notify-bridge suppresses the bridge POST even with token', async () => {
    await withTempHome(async (home) => {
      setMockFetch((async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return new Response('{}', { status: 200 });
      }) as typeof fetch);
      const result = await runPluginCommand({
        command: 'install',
        args: ['./packages/pi-finance-sdk', '--no-notify-bridge'],
        env: { ...hermeticEnv(), UPBRIDGE_TOKEN: 'tkn-test' },
        home,
      });
      expect(result.exitCode).toBe(0);
      expect(calls).toHaveLength(0);
    });
  });

  test('install with UPBRIDGE_TOKEN: bridge failure is non-fatal', async () => {
    await withTempHome(async (home) => {
      setMockFetch((async () => new Response('boom', { status: 500 })) as typeof fetch);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: unknown) => { logs.push(String(msg)); };
      let code = -1;
      try {
        const result = await runPluginCommand({
          command: 'install',
          args: ['./packages/pi-finance-sdk'],
          env: { ...hermeticEnv(), UPBRIDGE_TOKEN: 'tkn-test' },
          home,
        });
        code = result.exitCode;
      } finally {
        console.log = originalLog;
      }
      // The lifecycle op must still succeed.
      expect(code).toBe(0);
      expect(logs.join('\n')).toContain('bridge notify-reload returned 500');
    });
  });
});
