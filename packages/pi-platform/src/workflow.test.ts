import { describe, expect, test } from 'bun:test';
import { addPlatformWorkflowPlan, createInitialPlatformWorkflowState, createPlatformWorkflowPlan, parsePlatformWorkflowState } from './workflow';

describe('platform workflow state', () => {
  test('creates and restores a persisted plan', () => {
    const plan = createPlatformWorkflowPlan({ id: 'workflow-1', name: 'research', stopOnError: true, steps: [{ name: 'quote', tool: 'get_market_data', input: { symbol: 'AAPL' }, onError: 'abort' }], createdAt: 10 });
    const state = addPlatformWorkflowPlan(createInitialPlatformWorkflowState(), plan);
    expect(parsePlatformWorkflowState(state)).toEqual(state);
  });

  test('drops malformed plans instead of restoring unsafe state', () => {
    expect(parsePlatformWorkflowState({ schema: 1, plans: [{ id: 'bad', name: 'bad', status: 'planned', stopOnError: true, createdAt: 1, steps: [] }] })).toEqual(createInitialPlatformWorkflowState());
  });
});
