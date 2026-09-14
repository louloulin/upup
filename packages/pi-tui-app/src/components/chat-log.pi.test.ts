import { describe, expect, test } from 'bun:test';
import type { TUI } from '@earendil-works/pi-tui';
import { ChatLogComponent } from './chat-log.js';

const stubTui = {
  requestRender: () => {},
  terminal: { rows: 40, cols: 120 },
} as unknown as TUI;

describe('Pi event to CLI TUI rendering contract', () => {
  test('renders a complete financial query turn from Pi tool events', () => {
    const chat = new ChatLogComponent(stubTui);

    chat.addQuery('查询 600519.SH 的历史行情');
    chat.resetToolGrouping();
    chat.startTool('pi-tool-call-1', 'fixture_market_quote', { symbol: '600519.SH' });
    chat.updateToolProgress('pi-tool-call-1', 'Loading quote for 600519.SH');
    chat.completeTool('pi-tool-call-1', '→ 收盘价 100 CNY', 12);
    chat.finalizeAnswer('600519.SH 收盘价为 100 CNY，数据来自确定性 Pi fixture。');

    const rendered = chat.render(120).join('\n');
    expect(rendered).toContain('查询 600519.SH 的历史行情');
    expect(rendered).toContain('Fixture Market Quote');
    expect(rendered).toContain('收盘价 100 CNY');
    expect(rendered).toContain('确定性 Pi fixture');

    chat.clearAll();
  });
});
