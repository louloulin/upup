import { describe, expect, it } from 'bun:test';
import { registerDaemonExtension, type DaemonExtensionApi } from './pi-daemon.js';
import { createFakeApi, type PiFakeApi } from '../pi-main.js';
import { daemonStatsTool } from './pi-daemon-stats-tool.js';

describe('pi daemon extension', () => {
  it('registers a daemon stats tool and command under the full Pi extension surface', () => {
    const api = createFakeApi();
    registerDaemonExtension(api as unknown as DaemonExtensionApi);

    expect(api.tools.length).toBeGreaterThan(0);
    expect(api.tools.some((tool) => tool.name === 'daemon_stats')).toBe(true);
    expect(api.commands.some((command) => command.name === 'daemon')).toBe(true);
  });

  it('daemon_stats tool returns a Supervisor stats payload (legacy loose execute() shape)', async () => {
    // This test exercises the historic loose `execute()` invocation path
    // through the fake api — kept to ensure back-compat for any extension
    // still on the un-migrated shape.
    const api = createFakeApi();
    registerDaemonExtension(api as unknown as DaemonExtensionApi);

    const statsTool = api.tools.find((tool) => tool.name === 'daemon_stats')!;
    expect(statsTool.execute).toBeDefined();

    const result = (await (statsTool.execute as () => unknown)()) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty('queueSize');
    expect(parsed).toHaveProperty('activeTasks');
    expect(parsed).toHaveProperty('workers');
  });

  it('daemon_stats tool is a real pi ToolDefinition — strict 5-arg execute signature', async () => {
    // The migrated tool is built with `defineTool()` and has the strict
    // `execute(toolCallId, params, signal, onUpdate, ctx)` shape that pi's
    // runtime expects. Calling it through the 5-arg signature returns the
    // `{ content, details }` shape pi consumes — note `details` carries
    // typed `SupervisorStats` instead of opaque JSON text.
    expect(daemonStatsTool.name).toBe('daemon_stats');
    expect(daemonStatsTool.label).toBe('Daemon Stats');
    expect(daemonStatsTool.parameters).toBeDefined();

    const result = await daemonStatsTool.execute(
      'tool-call-1',
      {},
      undefined,
      undefined,
      // A minimal ExtensionContext is not actually needed by daemon_stats;
      // pass undefined for the unmocked field so we exercise the real
      // signature path.
      undefined as never,
    );

    expect(result.content).toBeArray();
    expect(result.content[0]?.type).toBe('text');
    expect(result.details).toHaveProperty('queueSize');
    expect(result.details).toHaveProperty('activeTasks');
    expect(result.details).toHaveProperty('workers');
  });

  it('works against the shared PiFakeApi from src/pi-main.ts — no local fake', () => {
    const api: PiFakeApi = createFakeApi();
    registerDaemonExtension(api);
    expect(api.tools.length).toBeGreaterThan(0);
  });
});
