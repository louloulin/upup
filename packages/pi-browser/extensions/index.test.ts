import { describe, expect, test } from 'bun:test';
import browserExtension from './index';

describe('Pi browser extension', () => {
  test('registers one browser tool and fails closed for unsafe navigation', async () => {
    const tools = new Map<string, { name: string; execute: (id: string, input: Record<string, unknown>, signal: AbortSignal) => Promise<any> }>();
    browserExtension({ registerTool: (tool) => tools.set(tool.name, tool as never) } as never);
    const tool = tools.get('browser');
    expect(tool).toBeDefined();
    const result = await tool!.execute('browser-unsafe-1', { action: 'navigate', url: 'http://127.0.0.1:18081/' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('private or local network target');
  });
});
