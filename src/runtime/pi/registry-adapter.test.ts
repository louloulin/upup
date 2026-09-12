import { describe, expect, test } from 'bun:test';
import { getToolRegistry } from '../../tools/registry/index.js';
import { isPiTool } from './tool.js';
import { registeredToolToPiContract } from './registry-adapter.js';
import { PiTool, z } from './tool.js';

describe('Pi registry adapter', () => {
  test('exposes the complete registered tool surface as Pi-native contracts', async () => {
    const tools = await getToolRegistry('deepseek-v4-flash');
    expect(tools.length).toBeGreaterThan(20);

    for (const registered of tools) {
      expect(isPiTool(registered.tool)).toBe(true);
      expect(registered.tool.name.length).toBeGreaterThan(0);
      expect(registered.tool.parameters).toBeDefined();
      const contract = registeredToolToPiContract(registered);
      expect(contract.parameters).toBe(registered.tool.parameters);
      expect(contract.category).toBeDefined();
      expect(contract.safetyLevel).toMatch(/^(safe|warning|dangerous|critical)$/);
      expect(contract.maxConcurrent).toBeGreaterThan(0);
      expect(contract.hasFinancialImpact).toBeBoolean();
    }
  });

  test('adds redacted, non-empty evidence to registered financial results', async () => {
    const registered = {
      name: 'fixture_financial_result',
      tool: new PiTool({
        name: 'fixture_financial_result',
        description: 'fixture',
        schema: z.object({ token: z.string() }),
        execute: async () => JSON.stringify({
          data: { close: 100, asOf: '2026-09-12' },
          sourceUrls: ['https://example.test/quote?api_key=SECRET#fragment'],
          secret: 'SECRET',
        }),
      }),
      description: 'fixture',
      concurrencySafe: true,
      concurrencyMetadata: {
        safe: true,
        safetyLevel: 'safe' as const,
        category: 'financial' as const,
        sideEffects: {
          readsFiles: false,
          writesFiles: false,
          makesNetworkRequests: true,
          hasRateLimit: true,
          modifiesState: false,
          spawnsProcess: false,
          hasFinancialImpact: false,
        },
        maxConcurrent: 5,
      },
    };
    const contract = registeredToolToPiContract(registered);
    const result = await contract.execute({ token: 'SECRET' }, {
      signal: new AbortController().signal,
      agent: {
        id: 'fixture-agent', version: '1.0.0', name: 'Fixture', description: 'Fixture', tools: '*',
        mode: 'primary', capabilities: [], taskTypes: [],
        permissions: {
          id: 'read-only', allow: ['safe'], requireApproval: [], deny: ['warning', 'dangerous', 'critical'],
          allowExternalNetwork: true, allowCredentialAccess: false, allowFinancialWrites: false,
        },
      },
      toolCallId: 'tool-call-1',
      auditId: 'audit-1',
    });
    expect(result.details?.evidence).toHaveLength(1);
    expect(result.details?.evidence[0]).toMatchObject({
      source: 'https://example.test/quote',
      asOf: '2026-09-12',
    });
    expect(result.details?.evidence[0]?.source).not.toContain('SECRET');
    expect(JSON.stringify(result.details)).not.toContain('SECRET');
    expect(result.text).not.toContain('SECRET');
    expect(JSON.stringify(result.value)).not.toContain('SECRET');
    expect(result.details?.auditId).toBe('audit-1');
  });
});
