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
