import { describe, expect, it } from 'bun:test';
import { registerRealtimeExtension, type RealtimeExtensionApi } from './pi-realtime.js';
import { createFakeApi, type PiFakeApi } from '../pi-main.js';

describe('pi realtime extension', () => {
  it('registers a realtime status tool and command under the full Pi extension surface', () => {
    const api = createFakeApi();
    registerRealtimeExtension(api as unknown as RealtimeExtensionApi);

    // The fake api records every method call as part of the full Pi surface.
    expect(api.tools.length).toBeGreaterThan(0);
    expect(api.tools.some((tool) => tool.name === 'realtime_status')).toBe(true);
    expect(api.commands.some((command) => command.name === 'realtime')).toBe(true);
  });

  it('exposes a realtime quote tool that returns a real quote from the mock feed', async () => {
    const api = createFakeApi();
    registerRealtimeExtension(api as unknown as RealtimeExtensionApi);

    const realtimeCommand = api.commands.find((command) => command.name === 'realtime')!;
    await (realtimeCommand.options as { handler: () => Promise<void> }).handler();

    const quoteTool = api.tools.find((tool) => tool.name === 'realtime_quote')!;
    expect(quoteTool).toBeDefined();
    expect(quoteTool.execute).toBeDefined();

    const result = (await quoteTool.execute!({ symbol: '600519' })) as {
      content: Array<{ type: string; text: string }>;
    };
    const text = result?.content?.[0]?.text ?? '';

    expect(text).toContain('symbol');
    expect(text).toContain('600519');
    expect(text).toContain('last');
  });

  it('works against the shared PiFakeApi from src/pi-main.ts — no local fake', () => {
    // The point of this test: registerRealtimeExtension must accept the same
    // fake api object that the loader bridge uses, so there is exactly one
    // recording test double in the project.
    const api: PiFakeApi = createFakeApi();
    registerRealtimeExtension(api);
    expect(api.tools.length).toBeGreaterThan(0);
  });
});