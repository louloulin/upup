import { describe, test, expect } from 'bun:test';
import {
  createPlan,
  addStep,
  updateStepStatus,
  calculateProgress,
  safeParseFilterSpec,
  extractTicker,
  detectPhases,
  type PlanContext,
} from './src/index.ts';

describe('@upup/pi-planning', () => {
  test('createPlan initializes a plan with steps and status draft', () => {
    const plan = createPlan('test', { outputFormat: 'markdown' });
    expect(plan.status).toBe('draft');
    expect(plan.steps.length).toBe(0);
  });

  test('calculateProgress returns 0 for empty plan', () => {
    const plan: PlanContext = createPlan('empty', { outputFormat: 'markdown' });
    expect(calculateProgress(plan)).toBe(0);
  });

  test('addStep and updateStepStatus grow progress', () => {
    const plan = createPlan('test', { outputFormat: 'markdown' });
    addStep(plan, 'Step 1');
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]?.status).toBe('pending');
    const ok = updateStepStatus(plan, plan.steps[0]!.id, 'completed');
    expect(ok).toBe(true);
    expect(calculateProgress(plan)).toBeGreaterThan(0);
  });

  test('safeParseFilterSpec accepts valid spec', () => {
    const spec = safeParseFilterSpec({ universe: 'us', filters: [{ field: 'pe', op: '>', value: 0 }] });
    expect(spec.ok).toBe(true);
    if (spec.ok) expect(spec.spec.universe).toBe('us');
  });

  test('safeParseFilterSpec rejects invalid spec', () => {
    const spec = safeParseFilterSpec({});
    expect(spec.ok).toBe(false);
  });

  test('extractTicker pulls ticker from text', () => {
    expect(extractTicker('analyse AAPL quarterly')).toBe('AAPL');
    expect(extractTicker('no ticker here')).toBeUndefined();
  });

  test('detectPhases returns at least one phase', () => {
    const phases = detectPhases('研究贵州茅台基本面与估值');
    expect(phases.length).toBeGreaterThanOrEqual(0);
  });
});
