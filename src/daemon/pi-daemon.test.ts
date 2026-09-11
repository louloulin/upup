import { describe, expect, it } from 'bun:test';
import { registerDaemonExtension, type DaemonExtensionApi } from './pi-daemon.js';

function createFakeApi() {
  const tools: any[] = [];
  const commands: any[] = [];
  const api = {
    registerTool(tool: any) {
      tools.push(tool);
    },
    registerCommand(name: string, options: any) {
      commands.push({ name, options });
    },
  } as unknown as DaemonExtensionApi;
  return { api, tools, commands };
}

describe('pi daemon extension', () => {
  it('registers a daemon stats tool and command', () => {
    const { api, tools, commands } = createFakeApi();
    registerDaemonExtension(api);

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((tool) => tool.name === 'daemon_stats')).toBe(true);
    expect(commands.some((command) => command.name === 'daemon')).toBe(true);
  });

  it('daemon_stats tool returns a Supervisor stats payload', async () => {
    const { api, tools } = createFakeApi();
    registerDaemonExtension(api);

    const statsTool = tools.find((tool) => tool.name === 'daemon_stats')!;
    const result = await statsTool.execute();

    const text = result?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(text);

    expect(parsed).toHaveProperty('queueSize');
    expect(parsed).toHaveProperty('activeTasks');
    expect(parsed).toHaveProperty('workers');
  });
});

