/**
 * Tests that `src/state/index.ts` no longer reaches into the legacy
 * `@upup/state` `SessionManager.listSessions` for port enumeration.
 * The StatePort now reads from `PiSessionService.list()`.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

async function resetAndRegister(): Promise<{
  getStatePort: typeof import('../runtime/pi/agent-port.js').getStatePort;
  getPiSessionService: typeof import('../runtime/pi/session-service.js').getPiSessionService;
  __resetAgentPorts: typeof import('../runtime/pi/agent-port.js').__resetAgentPorts;
  __registerStatePort: typeof import('./index.js').__registerStatePort;
}> {
  const agentPort = await import('../runtime/pi/agent-port.js');
  const sessionService = await import('../runtime/pi/session-service.js');
  const stateModule = await import('./index.js');
  agentPort.__resetAgentPorts();
  stateModule.__registerStatePort();
  return {
    getStatePort: agentPort.getStatePort,
    getPiSessionService: sessionService.getPiSessionService,
    __resetAgentPorts: agentPort.__resetAgentPorts,
    __registerStatePort: stateModule.__registerStatePort,
  };
}

describe('StatePort -> PiSessionService bridge', () => {
  let tempDir: string;
  let previousDir: string | undefined;
  let handles: Awaited<ReturnType<typeof resetAndRegister>>;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(process.cwd(), '.upup', 'state-port-pi-'));
    previousDir = process.env.UPUP_SESSION_DIR;
    process.env.UPUP_SESSION_DIR = tempDir;
    handles = await resetAndRegister();
  });

  afterEach(async () => {
    handles.__resetAgentPorts();
    if (previousDir === undefined) delete process.env.UPUP_SESSION_DIR;
    else process.env.UPUP_SESSION_DIR = previousDir;
    await rm(tempDir, { recursive: true, force: true });
  });

  test('getSessionManager().listSessions delegates to PiSessionService', async () => {
    const service = handles.getPiSessionService();
    const port = handles.getStatePort();
    const created = await service.create({
      cwd: process.cwd(),
      firstPrompt: 'Investigate 600519.SH Q3 results',
    });
    try {
      await service.rename(created.id, 'Maotai review');

      expect(port).not.toBeNull();

      const manager = port!.getSessionManager();
      const sessions = await manager.listSessions(10);
      const match = sessions.find((s) => s.id === created.id);
      expect(match).toBeDefined();
      expect(match!.customTitle).toBe('Maotai review');
      expect(match!.firstPrompt).toBeDefined();
    } finally {
      await service.remove(created.id);
      await service.dispose();
    }
  });

  test('listSessions honors the limit argument via slice', async () => {
    const service = handles.getPiSessionService();
    const port = handles.getStatePort()!;
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const created = await service.create({
        cwd: process.cwd(),
        firstPrompt: `Probe ${i}`,
      });
      ids.push(created.id);
    }
    try {
      const all = await port.getSessionManager().listSessions(0);
      const ours = all.filter((s) => ids.includes(s.id));
      expect(ours.length).toBe(3);

      const limited = await port.getSessionManager().listSessions(2);
      expect(limited.length).toBeLessThanOrEqual(2);
    } finally {
      for (const id of ids) await service.remove(id);
      await service.dispose();
    }
  });

  test('formatCost/formatTokens are exposed through the port', async () => {
    const port = handles.getStatePort();
    expect(port).not.toBeNull();
    expect(port!.formatCost(0.0012)).toContain('$');
    expect(port!.formatTokens(1500)).toMatch(/K/);
  });
});
