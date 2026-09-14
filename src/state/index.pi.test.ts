/**
 * Tests that `src/state/index.ts` no longer reaches into the legacy
 * `@upup/state` `SessionManager.listSessions` for port enumeration.
 * The StatePort now reads from `PiSessionService.list()`.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const fakeSpec = {
  id: 'fixture',
  version: '1.0.0',
  name: 'fixture',
  description: '',
  tools: '*' as const,
  mode: 'primary' as const,
  capabilities: [],
  taskTypes: [],
  permissions: { id: 'ro', allow: [], requireApproval: [], deny: [], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false },
};

interface FakeSessionHandle {
  id: string;
  getSessionFile: () => string | undefined;
  exportToJsonl: (p?: string) => string;
  appendEntry: (customType: string, data?: unknown) => void;
  appendSessionInfo: (name: string) => void;
  [key: string]: unknown;
}

async function resetAndRegister(): Promise<{
  getStatePort: typeof import('../runtime/pi/agent-port.js').getStatePort;
  getPiSessionService: typeof import('@upup/pi-session').getPiSessionService;
  __resetAgentPorts: typeof import('../runtime/pi/agent-port.js').__resetAgentPorts;
  __registerStatePort: typeof import('./index.js').__registerStatePort;
}> {
  const agentPort = await import('../runtime/pi/agent-port.js');
  const sessionService = await import('@upup/pi-session');
  const stateModule = await import('./index.js');

  sessionService.configurePiSessionService(() => ({
    createSession: async (_spec, options?: { sessionId?: string; sessionDir?: string }) => {
      const id = options?.sessionId ?? randomUUID();
      const sessionFilePath = join(options?.sessionDir ?? process.env.UPUP_SESSION_DIR ?? '.upup', `${id}.jsonl`);
      const entries: Array<Record<string, unknown>> = [
        { type: 'session', id, cwd: process.cwd(), timestamp: new Date().toISOString() },
      ];
      mkdirSync(dirname(sessionFilePath), { recursive: true });
      writeFileSync(sessionFilePath, JSON.stringify(entries[0]) + '\n');
      const fake: FakeSessionHandle = {
        id,
        spec: fakeSpec,
        prompt: () => Promise.resolve(),
        steer: () => Promise.resolve(),
        followUp: () => Promise.resolve(),
        abort: () => Promise.resolve(),
        waitForIdle: () => Promise.resolve(),
        compact: () => Promise.resolve(),
        getSessionFile: () => sessionFilePath,
        getSessionHeader: () => null,
        getSessionTree: () => [],
        exportToJsonl: (p?: string) => {
          const filePath = p ?? sessionFilePath;
          if (filePath) {
            try {
              mkdirSync(dirname(filePath), { recursive: true });
              writeFileSync(filePath, entries.map((e) => JSON.stringify(e)).join('\n') + '\n');
            } catch {}
          }
          return filePath ?? '';
        },
        exportToHtml: () => Promise.resolve(''),
        fork: () => undefined,
        appendEntry: (customType: string, data?: unknown) => {
          entries.push({ type: 'custom', customType, data });
          fake.exportToJsonl();
        },
        appendSessionInfo: (name: string) => {
          entries.push({ type: 'session_info', name });
          fake.exportToJsonl();
        },
        setFinanceContext: () => undefined,
        getFinanceContext: () => ({ ticker: undefined, market: undefined, assumptions: {}, risks: [], evidence: [], unfinishedPhases: [] }),
        getCustomEntries: (customType?: string) => entries.filter((e) => e.customType === customType),
        getAvailableToolNames: () => [],
        executeTool: () => Promise.resolve({} as never),
        getMessages: () => [],
        getResourceTrustAudit: () => [],
        getLoadedPackageResources: () => [],
        getLoadedPackageContracts: () => ({ workflows: [], policies: [], evals: [] }),
        evaluatePackage: () => ({ ok: true, name: '', value: undefined } as never),
        subscribe: () => () => undefined,
        dispose: () => undefined,
      };
      return fake as never;
    },
  }));

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
      await service.tag(created.id, 'watchlist');

      expect(port).not.toBeNull();

      const manager = port!.getSessionManager();
      const sessions = await manager.listSessions(10);
      const match = sessions.find((s) => s.id === created.id);
      expect(match).toBeDefined();
      expect(match!.customTitle).toBe('Maotai review');
      expect(match!.firstPrompt).toBeDefined();
      expect(match!.tags).toEqual(['watchlist']);
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
});
