/**
 * A28 contract: the daemon is a thin supervisor.
 *
 * It owns scheduling, priority, retries and lifecycle, and delegates every
 * agent execution to Pi's `BackgroundService` through the injected
 * `DaemonBackgroundRuntimePort`. The daemon must not grow its own agent loop,
 * model client or session store.
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PiBackgroundService } from '@upup/pi-session';
import type { DaemonBackgroundRuntimePort } from './index';

const SRC = import.meta.dir;

function daemonSources(): Array<{ path: string; source: string }> {
  const files = readdirSync(SRC, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return readdirSync(join(SRC, entry.name)).map((name) => join(SRC, entry.name, name));
    return [join(SRC, entry.name)];
  }).filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'));
  return files.map((path) => ({ path, source: readFileSync(path, 'utf8') }));
}

describe('@upup/daemon — Pi BackgroundService contract', () => {
  test('the daemon never constructs a Pi AgentSession or an LLM client', () => {
    for (const { path, source } of daemonSources()) {
      expect(source, path).not.toMatch(/createAgentSession\s*\(/);
      expect(source, path).not.toMatch(/ModelRuntime\s*\.\s*create\s*\(/);
      expect(source, path).not.toMatch(/from '@earendil-works\/pi-ai'/);
      expect(source, path).not.toMatch(/from '@upup\/pi-session'/);
    }
  });

  test('the Pi BackgroundService start signature satisfies the daemon port', () => {
    // Compile-time proof that Pi's own background service is a structural
    // superset of what the daemon needs; no adapter layer is required.
    const port: DaemonBackgroundRuntimePort['start'] = (prompt, options) =>
      (undefined as unknown as PiBackgroundService).start(prompt, options);
    expect(typeof port).toBe('function');
  });

  test('agent task types are routed to the injected background runtime', () => {
    const source = readFileSync(join(SRC, 'workers/tasks.ts'), 'utf8');
    for (const type of ['agent:background', 'agent:scheduled']) {
      expect(source).toContain(type);
    }
    expect(source).toContain('DaemonBackgroundRuntimePort');
    expect(source).toMatch(/this\.backgroundRuntime\.start\(/);
  });
});
