import { describe, expect, test } from 'bun:test';
import { addPlatformPlanStep, createInitialPlatformPlanningState, createPlatformPlan, createPlatformTodo, deletePlatformTodo, getPlatformPlan, listPlatformTodos, parsePlatformPlanningState, platformPlanProgress, platformTodoStats, updatePlatformPlanStep, updatePlatformTodo } from './planning.js';

describe('pi-platform planning', () => {
  test('creates and updates a dependency-aware plan', () => {
    const state = createInitialPlatformPlanningState();
    const plan = createPlatformPlan({ goal: 'Review A-share risk', constraints: ['Use historical evidence'] }, '2026-09-14T00:00:00.000Z');
    state.plans.push(plan); state.currentPlanId = plan.id;
    const first = addPlatformPlanStep(plan, { description: 'Collect filings' }, '2026-09-14T00:01:00.000Z');
    const second = addPlatformPlanStep(plan, { description: 'Write risk summary', dependsOn: [first.id] }, '2026-09-14T00:02:00.000Z');
    expect(() => addPlatformPlanStep(plan, { description: 'Invalid', dependsOn: ['missing'] })).toThrow();
    expect(updatePlatformPlanStep(plan, first.id, 'completed', '10-K reviewed', '2026-09-14T00:03:00.000Z')).toBe(true);
    expect(updatePlatformPlanStep(plan, second.id, 'in_progress')).toBe(true);
    expect(platformPlanProgress(plan)).toBe(50);
    expect(getPlatformPlan(state)?.id).toBe(plan.id);
  });

  test('persists todos through a validated session state', () => {
    const state = createInitialPlatformPlanningState();
    const todo = createPlatformTodo({ content: 'Check valuation assumptions', priority: 'high' }, '2026-09-14T00:00:00.000Z');
    state.todos.push(todo);
    expect(updatePlatformTodo(state, todo.id, { status: 'completed' }, undefined, '2026-09-14T00:01:00.000Z')?.status).toBe('completed');
    expect(platformTodoStats(listPlatformTodos(state))).toMatchObject({ total: 1, completed: 1, pending: 0 });
    const serialized = parsePlatformPlanningState(JSON.parse(JSON.stringify(state)));
    expect(serialized.todos[0]).toMatchObject({ id: todo.id, status: 'completed' });
    expect(deletePlatformTodo(serialized, todo.id)?.id).toBe(todo.id);
    expect(parsePlatformPlanningState({ version: 1, plans: 'bad', todos: [] }).plans).toEqual([]);
  });
});
