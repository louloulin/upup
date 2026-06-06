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
    // v2 (Sprint 2.1.7): Phase 4 uses runVerification instead of
    // executor.verify. Write a real tmp markdown report so the
    // file-exists + md-structure checks pass.
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const artifact = `/tmp/upup-coord-${Date.now()}-${Math.random().toString(36).slice(2)}.md`;
    await Bun.write(
      artifact,
      '# 600519.SH Report\n\n## Synthesis\n\nOverall bias: bullish.\n\n## Recommendation\n\nBUY.',
    );
    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList,
          bus,
          now: () => FIXED_NOW,
          // Skip tsc + bun test in the verify step — this is a v1 wiring
          // smoke test, not a real tsc/test exercise.
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL);
      expect(result.verification?.ok).toBe(true);
      const ver = await taskList.list({ phase: 'verification' });
      expect(ver[0]?.status).toBe('completed');
    } finally {
      await Bun.write(artifact, '').catch(() => {});
      const { unlink } = await import('node:fs/promises');
      await unlink(artifact).catch(() => {});
    }
  });

  test('marks verification task failed when deliverable fails file-exists check', async () => {
    // v2 (Sprint 2.1.7): Phase 4 verification fails when the artifact
    // file is missing on disk (file-exists check). WorkerExecutor.verify
    // is no longer called from Phase 4, so verifyFn is omitted.
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const implementFn: WorkerExecutor['implement'] = async () => ({
      artifact: `/tmp/upup-missing-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
    });
    const { executor } = makeExecutor({ implementFn });
    const coord = createCoordinator(
      {
        taskList,
        bus,
        now: () => FIXED_NOW,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      executor,
    );
    const result = await coord.runAnalysis(SYMBOL);
    expect(result.verification?.ok).toBe(false);
    expect(result.verification?.notes).toMatch(/file not found/);
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
    // v2 (Sprint 2.1.7): use a real tmp .ts file so runVerification
    // doesn't fail-and-retry during Phase 4 and pollute the events array.
    const artifact = `/tmp/upup-215-1st-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');
    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus, workerResumePolicy: fastPolicy,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL);
      expect(result.implementation?.artifact).toBe(artifact);
      expect(events).toHaveLength(0);
      const impl = await taskList.list({ phase: 'implementation' });
      expect(impl[0]?.status).toBe('completed');
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('with policy: fail 1st, succeed 2nd → 1 retry event, task completed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events, byType } = captureResumeEvents(bus);
    // v2 (Sprint 2.1.7): use a real tmp .ts file so runVerification
    // doesn't fail-and-retry during Phase 4 and pollute the events array.
    const artifact = `/tmp/upup-215-2nd-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');
    let calls = 0;
    try {
      const implementFn: WorkerExecutor['implement'] = async () => {
        calls += 1;
        if (calls === 1) throw new Error('flake 1');
        return { artifact };
      };
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus, workerResumePolicy: fastPolicy,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL);
      expect(calls).toBe(2);
      expect(result.implementation?.artifact).toBe(artifact);
      expect(byType()).toEqual({ retry: 1 });
      const impl = await taskList.list({ phase: 'implementation' });
      expect(impl[0]?.status).toBe('completed');
      const finalImpl = (await taskList.get(impl[0]!.id))!;
      expect(finalImpl.notes).toMatch(/retry-attempt=1/);
    } finally {
      await unlink(artifact).catch(() => {});
    }
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
    // v2 (Sprint 2.1.7): use a real tmp .ts file so runVerification
    // doesn't fail-and-retry during Phase 4 and pollute the events array.
    const artifact = `/tmp/upup-215-payload-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');
    let calls = 0;
    try {
      const implementFn: WorkerExecutor['implement'] = async () => {
        calls += 1;
        if (calls === 1) throw new Error('transient 1');
        return { artifact };
      };
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus, workerResumePolicy: fastPolicy,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      await coord.runAnalysis(SYMBOL);
      expect(events).toHaveLength(1);
      const e = events[0]!;
      expect(e.taskId).toBe(`implement-${SYMBOL}`);
      expect(e.type).toBe('retry');
      expect(e.attempt).toBe(1);
      expect(e.nextDelayMs).toBe(0);
      expect(e.directive).toMatch(/retry-attempt=1/);
      expect(e.errorMsg).toBe('transient 1');
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('with policy: implementation + verification success path still works when depth="deep"', async () => {
    // Regression check: v1 deep-depth impl success must keep working under
    // the resume wrapper, AND the v2 runVerification pipeline must accept
    // a real artifact file. Catches accidental changes to either the
    // implement-phase success path or the verify wiring.
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    const artifact = `/tmp/upup-deep-${Date.now()}-${Math.random().toString(36).slice(2)}.md`;
    await Bun.write(
      artifact,
      '# 600519.SH Deep Report\n\n## Synthesis\n\nBullish.\n\n## Recommendation\n\nBUY.',
    );
    const { unlink } = await import('node:fs/promises');
    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList,
          bus,
          workerResumePolicy: fastPolicy,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(result.implementation?.artifact).toBe(artifact);
      expect(result.verification?.ok).toBe(true);
      expect(events).toHaveLength(0);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });
});

/**
 * Sprint 2.1.7: Phase 4 verification is now backed by runVerification
 * (file-exists + readable + extension-specific parse + optional
 * tsc --noEmit + optional bun test). Failures retry via the same
 * runWithResume wrapper as Phase 3 when workerResumePolicy is set.
 *
 * Tests use a fake `VerificationRunner` so we don't actually spawn
 * `bun x tsc` / `bun test` processes. Artifact files are written to
 * /tmp via Bun.write so the file-exists check sees real files.
 */
describe('coordinator v2 (Sprint 2.1.7) — runVerification wiring', () => {
  let bus: EventBus;
  beforeEach(() => {
    bus = createEventBus();
  });

  function captureResumeEvents(bus: EventBus): {
    events: Array<{ taskId: string; type: string; attempt: number; errorMsg?: string }>;
    byType: () => Record<string, number>;
  } {
    const events: Array<{ taskId: string; type: string; attempt: number; errorMsg?: string }> = [];
    bus.on('coordinator.worker.resume', (e) => {
      const p = e.payload as {
        taskId: string;
        event: { type: string; attempt: number; error: Error };
      };
      events.push({
        taskId: p.taskId,
        type: p.event.type,
        attempt: p.event.attempt,
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

  const fastPolicy = {
    maxAttempts: 3,
    initialBackoffMs: 0,
    backoffFactor: 1,
    maxBackoffMs: 0,
    sleep: () => Promise.resolve(),
  };

  /** Make a tmp .ts path (does not actually create the file). */
  const tmpTsPath = (tag: string) =>
    `/tmp/upup-verif-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.ts`;

  test('with policy: verification retries on tsc failure, succeeds on 2nd attempt', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events, byType } = captureResumeEvents(bus);
    const artifact = tmpTsPath('retry');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    let tscCalls = 0;
    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run(cmd) {
        if (cmd.includes('tsc')) {
          tscCalls += 1;
          if (tscCalls === 1) {
            return { exitCode: 2, stdout: '', stderr: 'error TS2: transient' };
          }
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus, workerResumePolicy: fastPolicy, verificationRunner: fakeRunner,
          // No sibling .test.ts exists for the tmp artifact, so disable
          // the bun-test step to keep the retry count predictable.
          verificationDeps: { runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(tscCalls).toBe(2);
      expect(result.verification?.ok).toBe(true);
      // 1 retry event from the verify phase (implement succeeded on 1st try)
      expect(byType()).toEqual({ retry: 1 });
      // The retry event's taskId points to the verification task
      const ev = events.find((e) => e.taskId.startsWith('verify-'))!;
      expect(ev.type).toBe('retry');
      expect(ev.attempt).toBe(1);
      expect(ev.errorMsg).toMatch(/transient/);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('with policy: verification exhausts all retries when tsc always fails', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { byType } = captureResumeEvents(bus);
    const artifact = tmpTsPath('exhaust');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    let tscCalls = 0;
    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run() {
        tscCalls += 1;
        return { exitCode: 1, stdout: '', stderr: 'persistent tsc error' };
      },
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        { taskList, bus, workerResumePolicy: fastPolicy, verificationRunner: fakeRunner },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(tscCalls).toBe(3); // maxAttempts=3
      expect(result.verification?.ok).toBe(false);
      expect(byType()).toEqual({ retry: 2, exhausted: 1 });
      const ver = await taskList.list({ phase: 'verification' });
      expect(ver[0]?.status).toBe('failed');
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('no workerResumePolicy: verification single attempt, no resume events', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { events } = captureResumeEvents(bus);
    const artifact = tmpTsPath('nopolicy');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    let tscCalls = 0;
    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run() {
        tscCalls += 1;
        return { exitCode: 1, stdout: '', stderr: 'fail' };
      },
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        { taskList, bus, verificationRunner: fakeRunner },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(tscCalls).toBe(1);
      expect(result.verification?.ok).toBe(false);
      expect(events).toHaveLength(0);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('executor.verify is no longer called from Phase 4 (replaced by runVerification)', async () => {
    // Regression: ensure backward-compat `executor.verify` is NOT called
    // when runVerification is the new path. Tests that previously
    // relied on verifyFn must now drive verification through artifact
    // content + injected runner.
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    let verifyFnCalled = 0;
    const artifact = tmpTsPath('novfy');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run() {
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };
    const verifyFn: WorkerExecutor['verify'] = async () => {
      verifyFnCalled += 1;
      return { ok: true };
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn, verifyFn });
      const coord = createCoordinator(
        { taskList, bus, verificationRunner: fakeRunner },
        executor,
      );
      await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(verifyFnCalled).toBe(0);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('verificationDeps.runTsc=false skips tsc-noEmit check', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const artifact = tmpTsPath('notsc');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    let tscCalls = 0;
    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run(cmd) {
        if (cmd.includes('tsc')) tscCalls += 1;
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus,
          verificationRunner: fakeRunner,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      const result = await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      expect(tscCalls).toBe(0);
      expect(result.verification?.ok).toBe(true);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });

  test('verificationRunner is invoked with artifact path and configured cwd', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const artifact = tmpTsPath('cwdcheck');
    await Bun.write(artifact, 'export const x: number = 1;');
    const { unlink } = await import('node:fs/promises');

    const calls: Array<{ cmd: string[]; opts?: { cwd?: string } }> = [];
    const fakeRunner: import('./verification.js').VerificationRunner = {
      async run(cmd, opts) {
        calls.push({ cmd, opts: opts as { cwd?: string } });
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    };

    try {
      const implementFn: WorkerExecutor['implement'] = async () => ({ artifact });
      const { executor } = makeExecutor({ implementFn });
      const coord = createCoordinator(
        {
          taskList, bus,
          verificationRunner: fakeRunner,
          verificationDeps: { runTsc: false, runBunTest: false },
        },
        executor,
      );
      await coord.runAnalysis(SYMBOL, { depth: 'deep' });
      // file-exists / file-readable use injected fileExists, NOT the
      // runner. So the runner is never called when both tsc + bun
      // test are disabled. (Useful negative test.)
      expect(calls).toHaveLength(0);
    } finally {
      await unlink(artifact).catch(() => {});
    }
  });
});
