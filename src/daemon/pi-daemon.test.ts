import { describe, expect, it } from 'bun:test';
import { registerDaemonExtension, type DaemonExtensionApi } from './pi-daemon.js';
import { createFakeApi, type PiFakeApi } from '../pi-main.js';

describe('pi daemon extension', () => {
  it('registers a daemon stats tool and command under the full Pi extension surface', () => {
    const api = createFakeApi();
    registerDaemonExtension(api as unknown as DaemonExtensionApi);

    expect(api.tools.length).toBeGreaterThan(0);
    expect(api.tools.some((tool) => tool.name === 'daemon_stats')).toBe(true);
    expect(api.commands.some((command) => command.name === 'daemon')).toBe(true);
  });

  it('daemon_stats tool returns a Supervisor stats payload', async () => {
    const api = createFakeApi();
    registerDaemonExtension(api as unknown as DaemonExtensionApi);

    const statsTool = api.tools.find((tool) => tool.name === 'daemon_stats')!;
    expect(statsTool.execute).toBeDefined();

    const result = (await statsTool.execute!()) as {
      content: Array<{ type: string; text: string }>;
    };

    const text = result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty('queueSize');
    expect(parsed).toHaveProperty('activeTasks');
    expect(parsed).toHaveProperty('workers');
  });

  it('works against the shared PiFakeApi from src/pi-main.ts — no local fake', () => {
    const api: PiFakeApi = createFakeApi();
    registerDaemonExtension(api);
    expect(api.tools.length).toBeGreaterThan(0);
  });
});