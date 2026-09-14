/**
 * Tests that `src/state/index.ts` no longer reaches into the legacy
 * `@upup/state` `SessionManager.listSessions` for port enumeration.
 * The StatePort now reads from `PiSessionService.list()`.
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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
      if (sessionFilePath) {
        await mkdir(dirname(sessionFilePath), { recursive: true });
        await writeFile(sessionFilePath, JSON.stringify({ type: 'session', id, cwd: process.cwd(), timestamp: new Date().toISOString() }) + '\n');
        console.log('Wrote session file:', sessionFilePath);
      } else {
        console.log('FIXME_DEBUG', id);
      }
      const entries: Array<Record<string, unknown>> = [];
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
          const path = p ?? sessionFilePath;
          if (path) {
            // handled in createSession
          }
          return path ?? '';
        },
        exportToHtml: () => Promise.resolve(''),
        fork: () => undefined,
        appendEntry: (customType: string, data?: unknown) => {
          entries.push({ type: 'custom', customType, data });
          void fake.exportToJsonl();
        },
        appendSessionInfo: (name: string) => {
          entries.push({ type: 'session_info', data: name });
          void fake.exportToJsonl();
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
      const fs = await import('node:fs/promises');
      try {
        const dirEntries = await fs.readdir(process.env.UPUP_SESSION_DIR);
        console.log('dir entries:', dirEntries);
      } catch (e) { console.log('readdir err:', e.message); }
      console.log('all sessions:', JSON.stringify(all));
      const files = await fs.readdir(process.env.UPUP_SESSION_DIR);
      const firstFile = files[0];
      if (firstFile) {
        const content = await fs.readFile(`${process.env.UPUP_SESSION_DIR}/${firstFile}`, 'utf8');
        console.log('First file content:', content);
      }
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
