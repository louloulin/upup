import { describe, expect, test } from 'bun:test';
import configExtension from './index.js';

describe('pi-config extension', () => {
  test('registers isolated config tools and honors abort', async () => {
    const tools = new Map<string, { name: string; execute: (id: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<any> }>();
    configExtension({ registerTool: (tool) => tools.set(tool.name, tool as never) } as never);
    expect([...tools.keys()]).toEqual(['config_get', 'config_list', 'config_set']);
    const controller = new AbortController(); controller.abort();
    const result = await tools.get('config_get')!.execute('config-abort', {}, controller.signal);
    expect(result.isError).toBe(true);
  });
});
