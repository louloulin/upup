import { describe, expect, it } from 'bun:test';
import { registerRealtimeExtension, type RealtimeExtensionApi } from './pi-realtime.js';
import { createRealtimeFeed, createMockFeed } from './index.js';

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
  } as unknown as RealtimeExtensionApi;
  return { api, tools, commands };
}

describe('pi realtime extension', () => {
  it('registers a realtime status tool and command', () => {
    const { api, tools, commands } = createFakeApi();
    registerRealtimeExtension(api);

    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((tool) => tool.name === 'realtime_status')).toBe(true);
    expect(commands.some((command) => command.name === 'realtime')).toBe(true);
  });

  it('exposes a realtime quote tool that returns a real quote from the mock feed', async () => {
    const { api, tools, commands } = createFakeApi();
    registerRealtimeExtension(api);

    const realtimeCommand = commands.find((command) => command.name === 'realtime')!;
    await realtimeCommand.options.handler();

    const quoteTool = tools.find((tool) => tool.name === 'realtime_quote')!;
    expect(quoteTool).toBeDefined();

    const result = await quoteTool.execute({ symbol: '600519' });
    const text = result?.content?.[0]?.text ?? '';

    expect(text).toContain('symbol');
    expect(text).toContain('600519');
    expect(text).toContain('last');
  });
});

