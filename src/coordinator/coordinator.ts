/**
 * Coordinator — main Claude that orchestrates 4 investment-analyst Workers
 * through the 4-phase protocol (Research → Synthesis → Implementation →
 * Verification) using a file-based shared task list.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 *      (Requirements: Coordinator Main/Worker Separation, Four-Phase Protocol,
 *       Worker Templates, Shared Task List)
 *
 * The Coordinator itself is intentionally tool-restricted: it can only
 * create / update tasks, dispatch to workers, and read worker results.
 * Workers are injected so tests can swap in synchronous fakes.
 */

import type { EventBus } from '../core/event-bus.js';
import {
  DEFAULT_WORKER_TEMPLATES,
  type CoordinatorDeps,
  type Phase,
  type ResearchResult,
  type Task,
  type TaskList,
  type TaskStatus,
  type WorkerConfig,
  type WorkerRole,
} from './types.js';
import { wrapWorkerResult } from './worker-xml.js';
import {
  DEFAULT_WORKER_RESUME_POLICY,
  runWithResume,
  type WorkerResumeEvent,
  type WorkerResumePolicy,
} from './worker-resume.js';

export interface WorkerExecutor {
  runResearch(role: WorkerRole, symbol: string, systemPrompt: string): Promise<ResearchResult>;
  /** Write a deliverable (e.g. report file) for the implementation phase. */
  implement?(role: WorkerRole, plan: string): Promise<{ artifact: string }>;
  /** Verify a deliverable (read-back, sanity checks). */
  verify?(artifact: string): Promise<{ ok: boolean; notes?: string }>;
}

const RESEARCH_TASKS: WorkerRole[] = [
  'technical-analysis',
  'fundamental-analysis',
  'capital-flow',
  'sentiment-analysis',
];

export interface Coordinator {
  runAnalysis(symbol: string, opts?: { depth?: 'quick' | 'standard' | 'deep' }): Promise<CoordinatorRunResult>;
  listWorkerTemplates(): Record<WorkerRole, WorkerConfig>;
}

export interface CoordinatorRunResult {
  symbol: string;
  research: ResearchResult[];
  /**
   * v2: each Worker result wrapped in a <task-notification> XML block
   * (one per role, in the same order as `research`). Empty array unless
   * `wrapInXml: true` was passed in CoordinatorDeps.
   */
  researchXml: string[];
  synthesis: string;
  implementation?: { artifact: string };
  verification?: { ok: boolean; notes?: string };
  tasks: Task[];
}

function defaultSynthesisPrompt(): string {
  return [
    'You are the Coordinator synthesizing 4 parallel research streams.',
    'Read the technical, fundamental, capital-flow, and sentiment findings.',
    'Produce a structured synthesis:',
    '- Overall bias (bullish / bearish / neutral) with confidence 0..1',
    '- Top 3 supporting arguments',
    '- Top 3 risks',
    '- Recommended action (BUY / HOLD / SELL / WATCH) with target price band',
    '- Suggested position size (% of portfolio) and stop-loss',
  ].join('\n');
}

function defaultImplementPrompt(symbol: string, synthesis: string): string {
  return [
    `Write an investment analysis report for ${symbol} based on this synthesis:`,
    '',
    synthesis,
    '',
    'Save the report to the artifacts directory and return the file path.',
  ].join('\n');
}

export function createCoordinator(deps: CoordinatorDeps, executor: WorkerExecutor): Coordinator {
  const workers: Record<WorkerRole, WorkerConfig> = { ...DEFAULT_WORKER_TEMPLATES, ...deps.workers };
  const now = deps.now ?? (() => Date.now());
  const taskList: TaskList = deps.taskList;

  function emitTaskTransition(task: Task, prev?: TaskStatus): void {
    if (!deps.bus) return;
    if (prev === task.status) return;
    deps.bus.emit('coordinator.task', { task, prev });
  }

  async function setTaskStatus(taskId: string, status: Task['status']): Promise<Task> {
    const before = await taskList.get(taskId);
    const updated = await taskList.update(taskId, { status });
    emitTaskTransition(updated, before?.status);
    return updated;
  }

  return {
    listWorkerTemplates() {
      return workers;
    },

    async runAnalysis(symbol, opts) {
      const depth = opts?.depth ?? 'standard';
      const tasks: Task[] = [];

      // ----- Phase 1: Research -----
      const researchTasks: Task[] = [];
      for (const role of RESEARCH_TASKS) {
        const t = await taskList.create({
          id: `research-${role}-${symbol}`,
          title: `Research ${role} for ${symbol}`,
          assignee: role,
          phase: 'research',
        });
        researchTasks.push(t);
        tasks.push(t);
      }
      await Promise.all(researchTasks.map((t) => setTaskStatus(t.id, 'in_progress')));

      const researchResults: ResearchResult[] = [];
      // Workers run in parallel; failures on one don't block the others.
      const settled = await Promise.allSettled(
        RESEARCH_TASKS.map((role) =>
          executor
            .runResearch(role, symbol, workers[role].systemPrompt)
            .catch((err) => {
              throw { role, err: err instanceof Error ? err : new Error(String(err)) };
            }),
        ),
      );
      settled.forEach((res, i) => {
        const role = RESEARCH_TASKS[i]!;
        const task = researchTasks[i]!;
        if (res.status === 'fulfilled') {
          researchResults.push(res.value);
          setTaskStatus(task.id, 'completed').then((u) => tasks.push(u));
        } else {
          const err = (res.reason as { err: Error }).err;
          setTaskStatus(task.id, 'failed').then(async (u) => {
            tasks.push(u);
            await taskList.update(task.id, { notes: `error: ${err.message}` });
          });
        }
      });

      // ----- Phase 2: Synthesis (Coordinator itself) -----
      const synthesisId = `synthesis-${symbol}`;
      const synthTask = await taskList.create({
        id: synthesisId,
        title: `Synthesize research for ${symbol}`,
        assignee: 'coordinator',
        phase: 'synthesis',
      });
      tasks.push(synthTask);
      await setTaskStatus(synthTask.id, 'in_progress');
      const synthesis = synthesize(researchResults, defaultSynthesisPrompt());
      const synthDone = await setTaskStatus(synthTask.id, 'completed');
      tasks.push(synthDone);

      // ----- Phase 3: Implementation (worker writes report) -----
      let implementation: { artifact: string } | undefined;
      if (executor.implement && depth !== 'quick') {
        const implTask = await taskList.create({
          id: `implement-${symbol}`,
          title: `Write analysis report for ${symbol}`,
          assignee: 'fundamental-analysis',
          phase: 'implementation',
        });
        tasks.push(implTask);
        await setTaskStatus(implTask.id, 'in_progress');

        // v2 (Sprint 2.1.5): wrap the implement() call with runWithResume
        // so transient failures retry with exponential backoff. When
        // deps.workerResumePolicy is omitted, we still funnel through
        // runWithResume with maxAttempts=1 so the success/failure code
        // path is unified (the v1 behavior is preserved: no retries, no
        // events, fail on first error). When the policy is set, each
        // retry writes a directive to the task notes and emits a
        // `coordinator.worker.resume` bus event so the UI can surface
        // the retry.
        const policyEnabled = deps.workerResumePolicy !== undefined;
        const resumePolicy: Partial<WorkerResumePolicy> = policyEnabled
          ? {
              ...DEFAULT_WORKER_RESUME_POLICY,
              ...deps.workerResumePolicy,
            }
          : { maxAttempts: 1, sleep: () => Promise.resolve() };

        const onResume = (e: WorkerResumeEvent): void => {
          if (!policyEnabled) return;
          if (deps.bus) {
            deps.bus.emit('coordinator.worker.resume', { taskId: implTask.id, event: e });
          }
          if (e.directive) {
            // Best-effort note write. Don't await — keep the retry loop
            // moving; the next attempt will see an up-to-date notes field
            // when it calls taskList.get() during a follow-on phase.
            taskList
              .update(implTask.id, { notes: e.directive })
              .catch(() => {
                /* ignore */
              });
          }
        };

        const runOnce = (): Promise<{ artifact: string }> =>
          executor.implement!(
            'fundamental-analysis',
            defaultImplementPrompt(symbol, synthesis),
          );

        const outcome = await runWithResume(runOnce, resumePolicy, onResume);

        if (outcome.result) {
          implementation = outcome.result;
          const done = await setTaskStatus(implTask.id, 'completed');
          await taskList.update(implTask.id, { artifacts: [implementation.artifact] });
          tasks.push(done);
        } else {
          const failed = await setTaskStatus(implTask.id, 'failed');
          const notes = `error: ${outcome.finalError?.message ?? 'unknown'}`;
          await taskList.update(implTask.id, { notes });
          tasks.push(failed);
        }
      }

      // ----- Phase 4: Verification -----
      let verification: { ok: boolean; notes?: string } | undefined;
      if (executor.verify && implementation) {
        const verTask = await taskList.create({
          id: `verify-${symbol}`,
          title: `Verify analysis report for ${symbol}`,
          assignee: 'coordinator',
          phase: 'verification',
        });
        tasks.push(verTask);
        await setTaskStatus(verTask.id, 'in_progress');
        verification = await executor.verify(implementation.artifact);
        const done = await taskList.update(verTask.id, {
          status: verification.ok ? 'completed' : 'failed',
          notes: verification.notes,
        });
        tasks.push(done);
      }

      void now; // keep the param used in case future phases need a timestamp

      // v2 (Sprint 2.1.3): when wrapInXml is set, serialize each Worker
      // result into a <task-notification> block so the main Agent can
      // inject the wire format into its own context. Failed workers are
      // serialized with status="failed" so the Coordinator sees the
      // failure, not a silent drop.
      const researchXml: string[] = [];
      if (deps.wrapInXml) {
        for (let i = 0; i < RESEARCH_TASKS.length; i++) {
          const r = researchResults[i];
          const role = RESEARCH_TASKS[i]!;
          const taskId = researchTasks[i]?.id ?? `research-${role}-${symbol}`;
          if (r) {
            researchXml.push(
              wrapWorkerResult({
                taskId,
                workerRole: role,
                status: 'completed',
                summary: `${role} for ${r.symbol}: confidence=${r.confidence.toFixed(2)}`,
                result: JSON.stringify(r.findings),
                usage: { totalTokens: 0, durationMs: 0 },
              }),
            );
          } else {
            const notes = (await taskList.get(taskId))?.notes ?? 'unknown failure';
            researchXml.push(
              wrapWorkerResult({
                taskId,
                workerRole: role,
                status: 'failed',
                summary: `${role} for ${symbol} failed`,
                result: notes,
                usage: { totalTokens: 0, durationMs: 0 },
              }),
            );
          }
        }
      }

      return {
        symbol,
        research: researchResults,
        researchXml,
        synthesis,
        implementation,
        verification,
        tasks,
      };
    },
  };
}

function synthesize(results: ResearchResult[], _prompt: string): string {
  // Deterministic local synthesis. In production, the Coordinator would
  // call an LLM with the 4 worker findings and the synthesis prompt.
  const lines: string[] = [];
  lines.push('Investment synthesis');
  lines.push('====================');
  for (const r of results) {
    lines.push(`- ${r.role}: confidence=${r.confidence.toFixed(2)}`);
  }
  const avg = results.reduce((s, r) => s + r.confidence, 0) / Math.max(results.length, 1);
  const bias = avg >= 0.66 ? 'bullish' : avg <= 0.33 ? 'bearish' : 'neutral';
  lines.push('');
  lines.push(`Overall bias: ${bias} (avg confidence ${avg.toFixed(2)})`);
  return lines.join('\n');
}

export const _internal = {
  RESEARCH_TASKS,
  synthesize,
};
