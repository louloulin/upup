import { describe, expect, test } from 'bun:test';
import { createPlatformComposition } from './src/index.js';

describe('@upup/pi-platform-composition', () => {
  test('injects worker execution without importing root services', async () => {
    const spec = { id: 'test', version: '1.0.0', name: 'test', description: 'test', tools: '*', mode: 'primary', capabilities: [], taskTypes: [], permissions: { id: 'test', allow: ['safe'], requireApproval: [], deny: ['dangerous', 'critical'], allowExternalNetwork: false, allowCredentialAccess: false, allowFinancialWrites: false } } as const;
    const composition = createPlatformComposition({ sessionId: 'platform-test', spec, runPrompt: async () => 'ok', runCron: async () => undefined, listMcpResources: async () => [], readMcpResource: async () => [] });
    const result = await composition.runAgentWorker({ agentId: 'A/1', name: 'worker', role: 'test', prompt: 'hi', tools: '*' }, new AbortController().signal);
    expect(result.output).toBe('ok');
    expect(result.sessionId).toBe('platform-test:agent:a-1');
  });
});
