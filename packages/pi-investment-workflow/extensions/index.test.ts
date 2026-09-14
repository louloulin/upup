import { describe, expect, test } from 'bun:test';
import investmentWorkflowExtension from './index.js';

describe('Pi investment-workflow extension', () => {
  test('registers the phase tool and fails closed without the host', async () => {
    const tools = new Map<string, { execute: (...args: any[]) => Promise<any> }>();
    investmentWorkflowExtension({ registerTool: (tool: { name: string; execute: (...args: any[]) => Promise<any> }) => tools.set(tool.name, tool) } as never);
    expect([...tools.keys()]).toEqual(['invest_workflow_phase', 'invest_workflow']);
    const result = await tools.get('invest_workflow_phase')!.execute('workflow-denied', { phase: 'research', ticker: 'AAPL' }, new AbortController().signal);
    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ capability: 'investment-workflow', policy: 'fail-closed' });
  });
});
