/**
 * Workflow Tools Tests
 */

import { describe, it, expect } from 'vitest';

describe('workflow_tools', () => {
  it('should create workflow tool', async () => {
    const { createRunWorkflowTool } = await import('./workflow-tools.js');
    const tool = createRunWorkflowTool();
    
    expect(tool.name).toBe('run_workflow');
    expect(typeof tool.func).toBe('function');
  });

  it('should prepare workflow with multiple steps', async () => {
    const { createRunWorkflowTool } = await import('./workflow-tools.js');
    const tool = createRunWorkflowTool();
    
    const result = await tool.func({
      name: 'Test Workflow',
      steps: [
        { name: 'step1', tool: 'get_market_data', input: { symbol: 'AAPL' } },
        { name: 'step2', tool: 'calculate_pnl', input: { positions: [] } },
      ],
      stopOnError: true,
    });
    
    const parsed = JSON.parse(result as string);
    expect(parsed.data.type).toBe('Workflow Plan');
    expect(parsed.data.name).toBe('Test Workflow');
    expect(parsed.data.stepCount).toBe(2);
    expect(parsed.data.steps.length).toBe(2);
  });

  it('should include step metadata', async () => {
    const { createRunWorkflowTool } = await import('./workflow-tools.js');
    const tool = createRunWorkflowTool();
    
    const result = await tool.func({
      name: 'Research Pipeline',
      steps: [
        {
          name: 'fetch_data',
          tool: 'get_market_data',
          input: { symbol: 'AAPL' },
          condition: undefined,
          onError: 'abort',
        },
      ],
      stopOnError: true,
    });
    
    const parsed = JSON.parse(result as string);
    expect(parsed.data.steps[0].index).toBe(1);
    expect(parsed.data.steps[0].hasCondition).toBe(false);
    expect(parsed.data.steps[0].onError).toBe('abort');
  });
});
