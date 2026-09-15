import { describe, expect, test } from 'bun:test';
import cacheExtension from './index';

describe('pi-cache extension', () => {
  test('registers cache tools and fails closed on unconfirmed clear', async () => {
    const tools = new Map<string, { name: string; execute: (id: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<any> }>();
    cacheExtension({ registerTool: (tool) => tools.set(tool.name, tool as never) } as never);
    expect([...tools.keys()]).toEqual(['get_cache_stats', 'clear_cache', 'invalidate_cache', 'get_cache_info']);
    const result = await tools.get('clear_cache')!.execute('cache-clear-1', { confirm: false }, new AbortController().signal);
    expect(result.isError).toBe(true);
  });
});
