import { describe, expect, test } from 'bun:test';
import financeEvidenceExtension from './index.js';
import {
  PI_FINANCE_HOST_CAPABILITIES,
  PI_FINANCE_HOST_CONTRACT,
  PI_FINANCE_PACKAGE_NAME,
  PI_FINANCE_PACKAGE_VERSION,
} from './host-contract.js';
import { PI_FINANCE_COMMANDS } from './commands.js';

describe('Pi finance SDK extension', () => {
  test('registers Pi-native investment commands that dispatch intents to the current session', async () => {
    const commands = new Map<string, { handler: (args: string) => Promise<void> }>();
    const messages: string[] = [];
    const entries: Array<{ type: string; data: unknown }> = [];
    financeEvidenceExtension({
      on: () => undefined,
      registerTool: () => undefined,
      registerCommand: (name, options) => commands.set(name, options),
      sendUserMessage: (content) => { messages.push(typeof content === 'string' ? content : ''); },
      appendEntry: (type, data) => { entries.push({ type, data }); },
    } as never);

    expect([...commands.keys()]).toEqual([...PI_FINANCE_COMMANDS]);
    await commands.get('risk-dashboard')?.handler('600519.SH');
    expect(messages[0]).toContain('risk dashboard for 600519.SH');
    expect(messages[0]).toContain('Pi finance tools');
    expect(entries[0]).toMatchObject({
      type: 'upup_finance_command',
      data: { schema: 1, command: 'risk-dashboard', args: '600519.SH', workflow: 'invest' },
    });
  });

  test('accepts only the versioned host contract and requests declared capabilities', async () => {
    const previous = (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost;
    const requests: unknown[] = [];
    (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost = {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: PI_FINANCE_PACKAGE_NAME,
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'contract-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      getToolDefinitions(request: unknown) {
        requests.push(request);
        return [];
      },
    };
    try {
      financeEvidenceExtension({ on: () => undefined, registerTool: () => undefined, registerCommand: () => undefined, sendUserMessage: () => undefined, appendEntry: () => undefined } as never);
      expect(requests).toEqual([{
        contract: PI_FINANCE_HOST_CONTRACT,
        packageName: PI_FINANCE_PACKAGE_NAME,
        packageVersion: PI_FINANCE_PACKAGE_VERSION,
        sessionId: 'contract-session',
        capability: 'tool-definitions',
      }]);
    } finally {
      if (previous === undefined) delete (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost;
      else (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost = previous;
    }
  });

  test('does not request host tools when the package identity is not exact', () => {
    const previous = (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost;
    const requests: unknown[] = [];
    (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost = {
      contract: PI_FINANCE_HOST_CONTRACT,
      packageName: '@upup/impersonator',
      packageVersion: PI_FINANCE_PACKAGE_VERSION,
      sessionId: 'contract-session',
      capabilities: PI_FINANCE_HOST_CAPABILITIES,
      getToolDefinitions(request: unknown) {
        requests.push(request);
        return [{ name: 'must-not-load' }];
      },
    };
    try {
      const tools = new Map<string, unknown>();
      financeEvidenceExtension({
        on: () => undefined,
        registerTool: (tool: { name: string }) => tools.set(tool.name, tool),
        registerCommand: () => undefined,
        sendUserMessage: () => undefined,
        appendEntry: () => undefined,
      } as never);
      expect(requests).toEqual([]);
      expect(tools.has('must-not-load')).toBe(false);
    } finally {
      if (previous === undefined) delete (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost;
      else (globalThis as typeof globalThis & { __upupPiFinanceToolHost?: unknown }).__upupPiFinanceToolHost = previous;
    }
  });

  test('registers the complete deterministic finance tool set', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    financeEvidenceExtension({
      on: () => undefined,
      registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool),
      registerCommand: () => undefined,
      sendUserMessage: () => undefined,
      appendEntry: () => undefined,
    } as never);

    expect([...tools.keys()]).toEqual([
      'finance_evidence_quote',
      'finance_evidence_fundamentals',
      'finance_evidence_news',
      'finance_evidence_search',
      'finance_evidence_trading_day',
    ]);
    const result = await tools.get('finance_evidence_quote')!.execute('quote-1', { symbol: '600519.SH' }, new AbortController().signal);
    expect(result.details).toMatchObject({
      auditId: 'quote-1',
      evidence: [{ source: 'upup-fixture://pi-finance-sdk/quote', asOf: '2026-09-12' }],
    });
  });
});
