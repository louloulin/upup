/**
 * Tests for the coordinator: 4-phase protocol, 4 worker dispatch, task list
 * transitions, and synthesis wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { createEventBus, type EventBus } from '../core/event-bus.js';
import {
  createCoordinator,
  type CoordinatorRunResult,
  type WorkerExecutor,
} from './coordinator.js';
import { createInMemoryTaskList } from './in-memory-task-list.js';
import {
  DEFAULT_WORKER_TEMPLATES,
  type ResearchResult,
  type Task,
  type WorkerRole,
} from './types.js';
import { extractTaskNotifications, parseTaskNotification } from './worker-xml.js';

const FIXED_NOW = 1_700_000_000_000;
const SYMBOL = '600519.SH';

function makeExecutor(opts?: {
  delay?: number;
  failRoles?: WorkerRole[];
  researchOverride?: Partial<Record<WorkerRole, ResearchResult>>;
  implementFn?: WorkerExecutor['implement'];
  verifyFn?: WorkerExecutor['verify'];
}): { executor: WorkerExecutor; calls: WorkerRole[] } {
  const calls: WorkerRole[] = [];
  const executor: WorkerExecutor = {
    async runResearch(role, symbol, systemPrompt) {
      calls.push(role);
      if (opts?.delay) await new Promise((r) => setTimeout(r, opts.delay));
      if (opts?.failRoles?.includes(role)) {
        throw new Error(`worker ${role} failed`);
      }
      if (opts?.researchOverride?.[role]) {
        return opts.researchOverride[role]!;
      }
      return {
        role,
        symbol,
        findings: { symbol, role, note: `findings for ${symbol} from ${role}` },
        confidence: 0.7,
        completedAt: FIXED_NOW,
      };
    },
    implement: opts?.implementFn,
    verify: opts?.verifyFn,
  };
  return { executor, calls };
}

describe('coordinator', () => {
  let bus: EventBus;
  const taskTransitions: Array<{ id: string; status: string }> = [];

  beforeEach(() => {
    bus = createEventBus();
    taskTransitions.length = 0;
    bus.on('coordinator.task', (e) => {
      const t = (e.payload as { task: Task }).task;
      taskTransitions.push({ id: t.id, status: t.status });
    });
  });

  test('runs all 4 research workers in parallel and writes pending tasks first', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, calls } = makeExecutor({ delay: 20 });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result: CoordinatorRunResult = await coord.runAnalysis(SYMBOL);
    expect(calls.sort()).toEqual([
      'capital-flow',
      'fundamental-analysis',
      'sentiment-analysis',
      'technical-analysis',
    ]);
    expect(result.research.length).toBe(4);
  });

  test('creates research tasks in "research" phase', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    await coord.runAnalysis(SYMBOL);
    const researchTasks = await taskList.list({ phase: 'research' });
    expect(researchTasks.length).toBe(4);
    for (const t of researchTasks) {
      expect(t.phase).toBe('research');
    }
  });

  test('marks all research tasks completed when workers succeed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    await coord.runAnalysis(SYMBOL);
    const completed = await taskList.list({ status: 'completed', phase: 'research' });
    expect(completed.length).toBe(4);
  });

  test('one failed worker does not block the others (Promise.allSettled)', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, calls } = makeExecutor({ failRoles: ['sentiment-analysis'] });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(calls.length).toBe(4);
    expect(result.research.length).toBe(3); // 3 succeeded
    const failed = await taskList.list({ status: 'failed', phase: 'research' });
    expect(failed.length).toBe(1);
    expect(failed[0]!.assignee).toBe('sentiment-analysis');
  });

  test('emits coordinator.task events on transitions', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    await coord.runAnalysis(SYMBOL);
    expect(taskTransitions.length).toBeGreaterThan(0);
    const ids = new Set(taskTransitions.map((t) => t.id));
    expect(ids.has('synthesis-600519.SH')).toBe(true);
  });

  test('synthesizes a structured synthesis string after research', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.synthesis).toMatch(/Investment synthesis/);
    expect(result.synthesis).toMatch(/Overall bias/);
    const synthTask = await taskList.get('synthesis-600519.SH');
    expect(synthTask?.status).toBe('completed');
  });

  test('runs implementation phase when executor.implement is provided', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const implementFn: WorkerExecutor['implement'] = async (role, plan) => {
      expect(role).toBe('fundamental-analysis');
      expect(plan).toMatch(/synthesis/i);
      return { artifact: `/reports/${SYMBOL}.md` };
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.implementation?.artifact).toBe(`/reports/${SYMBOL}.md`);
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl[0]?.status).toBe('completed');
    expect(impl[0]?.artifacts).toContain(`/reports/${SYMBOL}.md`);
  });

  test('skips implementation when depth is "quick"', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const implementFn: WorkerExecutor['implement'] = async () => ({ artifact: 'x' });
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL, { depth: 'quick' });
    expect(result.implementation).toBeUndefined();
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl.length).toBe(0);
  });

  test('runs verification after implementation and reports ok=true', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const implementFn: WorkerExecutor['implement'] = async () => ({ artifact: '/r/x.md' });
    const verifyFn: WorkerExecutor['verify'] = async (a) => ({ ok: true, notes: `verified ${a}` });
    const { executor } = makeExecutor({ implementFn, verifyFn });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.verification?.ok).toBe(true);
    const ver = await taskList.list({ phase: 'verification' });
    expect(ver[0]?.status).toBe('completed');
  });

  test('marks verification task failed when verify returns ok=false', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const implementFn: WorkerExecutor['implement'] = async () => ({ artifact: '/r/x.md' });
    const verifyFn: WorkerExecutor['verify'] = async () => ({ ok: false, notes: 'truncated' });
    const { executor } = makeExecutor({ implementFn, verifyFn });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.verification?.ok).toBe(false);
    const ver = await taskList.list({ phase: 'verification' });
    expect(ver[0]?.status).toBe('failed');
  });

  test('exposes the 4 default worker templates with restricted tool whitelists', () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList }, executor);
    const templates = coord.listWorkerTemplates();
    expect(Object.keys(templates).sort()).toEqual(
      ['capital-flow', 'fundamental-analysis', 'sentiment-analysis', 'technical-analysis'].sort(),
    );
    for (const role of Object.keys(templates) as WorkerRole[]) {
      expect(templates[role].allowedTools.length).toBeGreaterThan(0);
      expect(templates[role].systemPrompt.length).toBeGreaterThan(0);
      expect(templates[role].maxTurns).toBeGreaterThan(0);
    }
    expect(templates['fundamental-analysis'].allowedTools).toContain('read_filings');
  });

  test('default templates match DEFAULT_WORKER_TEMPLATES', () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList }, executor);
    const templates = coord.listWorkerTemplates();
    expect(templates).toEqual(DEFAULT_WORKER_TEMPLATES);
  });

  test('allows custom worker templates via deps.workers', () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const custom = {
      ...DEFAULT_WORKER_TEMPLATES,
      'technical-analysis': {
        role: 'technical-analysis' as const,
        allowedTools: ['custom-tool'],
        systemPrompt: 'custom',
        maxTurns: 1,
      },
    };
    const coord = createCoordinator({ taskList, workers: custom }, executor);
    expect(coord.listWorkerTemplates()['technical-analysis'].systemPrompt).toBe('custom');
  });

  test('workers run concurrently (total time ~ max, not sum)', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor } = makeExecutor({ delay: 50 });
    const coord = createCoordinator({ taskList, bus, now: () => FIXED_NOW }, executor);
    const t0 = Date.now();
    await coord.runAnalysis(SYMBOL);
    const elapsed = Date.now() - t0;
    // 4 workers at 50ms each in parallel should finish in well under 200ms
    expect(elapsed).toBeLessThan(180);
  });
});

describe('coordinator v2 (Sprint 2.1.3) — wrapInXml', () => {
  test('researchXml is empty by default (v1 behavior preserved)', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.researchXml).toEqual([]);
  });

  test('researchXml contains 4 <task-notification> blocks when wrapInXml=true', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, wrapInXml: true }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.researchXml).toHaveLength(4);
    for (const xml of result.researchXml) {
      expect(xml).toContain('<task-notification');
      expect(xml).toContain('</task-notification>');
    }
  });

  test('researchXml order matches RESEARCH_TASKS order (technical, fundamental, capital-flow, sentiment)', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, wrapInXml: true }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    const roles = result.researchXml.map((xml) => parseTaskNotification(xml).workerRole);
    expect(roles).toEqual([
      'technical-analysis',
      'fundamental-analysis',
      'capital-flow',
      'sentiment-analysis',
    ]);
  });

  test('researchXml task-id matches the corresponding Task in the task list', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, wrapInXml: true }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    const tasks = await taskList.list({ phase: 'research' });
    const taskIds = tasks.map((t) => t.id).sort();
    const xmlIds = result.researchXml
      .map((xml) => parseTaskNotification(xml).taskId)
      .sort();
    expect(xmlIds).toEqual(taskIds);
  });

  test('failed Worker becomes a status="failed" notification (not silently dropped)', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor({ failRoles: ['sentiment-analysis'] });
    const coord = createCoordinator({ taskList, wrapInXml: true }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.researchXml).toHaveLength(4);
    const failed = result.researchXml
      .map((xml) => parseTaskNotification(xml))
      .find((n) => n.status === 'failed');
    expect(failed).toBeDefined();
    expect(failed!.workerRole).toBe('sentiment-analysis');
    expect(failed!.result).toMatch(/sentiment-analysis failed/);
  });

  test('Coordinator can extract notifications back from the buffer (round-trip via extractTaskNotifications)', async () => {
    const taskList = createInMemoryTaskList();
    const { executor } = makeExecutor();
    const coord = createCoordinator({ taskList, wrapInXml: true }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    // Simulate the Coordinator's conversation buffer containing the blocks.
    const buffer = [
      'Coordinator thought: I should look at the 4 worker results.',
      ...result.researchXml,
      'Coordinator thought: now I will synthesize.',
    ].join('\n\n');
    const extracted = extractTaskNotifications(buffer);
    expect(extracted).toHaveLength(4);
    expect(extracted.map((n) => n.workerRole).sort()).toEqual([
      'capital-flow',
      'fundamental-analysis',
      'sentiment-analysis',
      'technical-analysis',
    ]);
  });
});

/**
 * Sprint 2.1.5: wrap executor.implement() with runWithResume so transient
 * failures retry before the task is marked failed. v1 callers (no
 * `workerResumePolicy` in deps) see no behavior change.
 *
 * Test strategy: implementFn controls success/failure per attempt using a
 * shared counter, the test installs a no-op sleep on the resume policy so
 * retries don't actually wait, and bus events are captured via an in-test
 * subscriber on `coordinator.worker.resume`.
 */
describe('coordinator v2 (Sprint 2.1.5) — worker-resume on implementation', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = createEventBus();
  });

  /**
   * Capture every `coordinator.worker.resume` event the coordinator emits.
   * Returns both the array of events and a count-by-type helper.
   */
  function captureResumeEvents(bus: EventBus): {
    events: Array<{
      taskId: string;
      attempt: number;
      type: string;
      nextDelayMs?: number;
      directive?: string;
      errorMsg?: string;
    }>;
    byType: () => Record<string, number>;
  } {
    const events: Array<{
      taskId: string;
      attempt: number;
      type: string;
      nextDelayMs?: number;
      directive?: string;
      errorMsg?: string;
    }> = [];
    bus.on('coordinator.worker.resume', (e) => {
      const p = e.payload as {
        taskId: string;
        event: {
          type: string;
          attempt: number;
          nextDelayMs?: number;
          directive?: string;
          error: Error;
        };
      };
      events.push({
        taskId: p.taskId,
        attempt: p.event.attempt,
        type: p.event.type,
        nextDelayMs: p.event.nextDelayMs,
        directive: p.event.directive,
        errorMsg: p.event.error.message,
      });
    });
    return {
      events,
      byType: () =>
        events.reduce<Record<string, number>>((acc, ev) => {
          acc[ev.type] = (acc[ev.type] ?? 0) + 1;
          return acc;
        }, {}),
    };
  }

  /** Install a no-op sleep so retry waits don't slow the test suite. */
  const fastPolicy = {
    maxAttempts: 3,
    initialBackoffMs: 0,
    backoffFactor: 1,
    maxBackoffMs: 0,
    sleep: () => Promise.resolve(),
  };

  test('no workerResumePolicy (v1): single failure → task failed, no resume events', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    const implementFn: WorkerExecutor['implement'] = async () => {
      throw new Error('boom');
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.implementation).toBeUndefined();
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl).toHaveLength(1);
    expect(impl[0]?.status).toBe('failed');
    expect(impl[0]?.notes).toMatch(/error: boom/);
    // v1 behavior: no resume events surfaced (policy not configured)
    expect(events).toHaveLength(0);
  });

  test('with policy: succeed on 1st attempt → no resume events, task completed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    const implementFn: WorkerExecutor['implement'] = async () => ({
      artifact: `/reports/${SYMBOL}.md`,
    });
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: fastPolicy }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.implementation?.artifact).toBe(`/reports/${SYMBOL}.md`);
    expect(events).toHaveLength(0);
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl[0]?.status).toBe('completed');
  });

  test('with policy: fail 1st, succeed 2nd → 1 retry event, task completed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events, byType } = captureResumeEvents(bus);
    let calls = 0;
    const implementFn: WorkerExecutor['implement'] = async () => {
      calls += 1;
      if (calls === 1) throw new Error('flake 1');
      return { artifact: `/reports/${SYMBOL}.md` };
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: fastPolicy }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(calls).toBe(2);
    expect(result.implementation?.artifact).toBe(`/reports/${SYMBOL}.md`);
    expect(byType()).toEqual({ retry: 1 });
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl[0]?.status).toBe('completed');
    // The retry directive should have been written to the task notes
    const finalImpl = (await taskList.get(impl[0]!.id))!;
    expect(finalImpl.notes).toMatch(/retry-attempt=1/);
  });

  test('with policy: all 3 attempts fail → 2 retry + 1 exhausted, task failed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events, byType } = captureResumeEvents(bus);
    let calls = 0;
    const implementFn: WorkerExecutor['implement'] = async () => {
      calls += 1;
      throw new Error(`flake ${calls}`);
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: fastPolicy }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(calls).toBe(3);
    expect(result.implementation).toBeUndefined();
    expect(byType()).toEqual({ retry: 2, exhausted: 1 });
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl[0]?.status).toBe('failed');
    expect(impl[0]?.notes).toMatch(/error: flake 3/);
    // The exhausted event should be the last one emitted
    const last = events[events.length - 1]!;
    expect(last.type).toBe('exhausted');
    expect(last.attempt).toBe(3);
  });

  test('with shouldRetry=false: non-retryable error → escalated, no retry, task failed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events, byType } = captureResumeEvents(bus);
    let calls = 0;
    const implementFn: WorkerExecutor['implement'] = async () => {
      calls += 1;
      throw new Error('bad config: missing symbol');
    };
    const policy = {
      ...fastPolicy,
      shouldRetry: (err: Error) => !err.message.includes('bad config'),
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: policy }, executor);
    const result = await coord.runAnalysis(SYMBOL);
    expect(calls).toBe(1);
    expect(result.implementation).toBeUndefined();
    expect(byType()).toEqual({ escalated: 1 });
    const impl = await taskList.list({ phase: 'implementation' });
    expect(impl[0]?.status).toBe('failed');
    expect(impl[0]?.notes).toMatch(/error: bad config/);
  });

  test('with policy: retry event payload includes taskId, attempt, error, nextDelayMs, directive', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    let calls = 0;
    const implementFn: WorkerExecutor['implement'] = async () => {
      calls += 1;
      if (calls === 1) throw new Error('transient 1');
      return { artifact: 'ok' };
    };
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: fastPolicy }, executor);
    await coord.runAnalysis(SYMBOL);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.taskId).toBe(`implement-${SYMBOL}`);
    expect(e.type).toBe('retry');
    expect(e.attempt).toBe(1);
    expect(e.nextDelayMs).toBe(0);
    expect(e.directive).toMatch(/retry-attempt=1/);
    expect(e.errorMsg).toBe('transient 1');
  });

  test('with policy: implementation success path still works when depth="deep"', async () => {
    // Regression check: v1 deep-depth impl success must keep working under
    // the resume wrapper. Catches accidental changes to the implement-phase
    // success path.
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    const implementFn: WorkerExecutor['implement'] = async () => ({
      artifact: `/reports/${SYMBOL}-deep.md`,
    });
    const verifyFn: WorkerExecutor['verify'] = async (a) => ({ ok: true, notes: `ok ${a}` });
    const { executor } = makeExecutor({ implementFn, verifyFn });
    const coord = createCoordinator({ taskList, bus, workerResumePolicy: fastPolicy }, executor);
    const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
    expect(result.implementation?.artifact).toBe(`/reports/${SYMBOL}-deep.md`);
    expect(result.verification?.ok).toBe(true);
    expect(events).toHaveLength(0);
  });
});
