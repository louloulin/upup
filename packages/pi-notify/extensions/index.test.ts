import { describe, expect, test } from 'bun:test';
import notifyExtension from './index';

describe('pi-notify extension', () => {
  test('registers notification tools and keeps sessions isolated', async () => { const tools = new Map<string, any>(); notifyExtension({ registerTool: (tool) => tools.set(tool.name, tool) } as never); expect([...tools.keys()]).toEqual(['notify', 'notify_list', 'subscribe_pr', 'unsubscribe_pr', 'list_pr_subscriptions']); const result = await tools.get('notify')!.execute('notify-1', { channel: 'log', title: 'T', message: 'M' }, new AbortController().signal); expect(result.isError).not.toBe(true); });
  test('does not persist a rejected private webhook subscription', async () => { const tools = new Map<string, any>(); notifyExtension({ registerTool: (tool) => tools.set(tool.name, tool) } as never); const rejected = await tools.get('subscribe_pr')!.execute('notify-private', { repo: 'upup/demo', prNumber: 1, webhookUrl: 'http://127.0.0.1:18081', events: ['merge'] }, new AbortController().signal); expect(rejected.isError).toBe(true); const listed = await tools.get('list_pr_subscriptions')!.execute('notify-list', {}, new AbortController().signal); expect(JSON.parse(listed.content[0].text)).toEqual([]); });
});
