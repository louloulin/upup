/**
 * E2E tests for the v2 coordinator (Sprint 2.1.8).
 *
 * Exercises the full 4-phase protocol (Research -> Synthesis ->
 * Implementation -> Verification) end-to-end with:
 *   - Real file I/O (the implement Worker writes an actual file on disk
 *     so runVerification sees the artifact)
 *   - Real runVerification function (not stubbed)
 *   - Injected fake VerificationRunner (so tsc / bun test don't actually
 *     spawn; the e2e stays fast and deterministic)
 *   - wrapInXml wiring for task-notification serialization
 *   - workerResumePolicy for transient-failure retry
 *
 * The fake-executor pattern keeps the LLM out of the loop; tests focus
 * on the Coordinator's protocol machinery, not on Worker output quality.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { unlink, mkdir } from 'node:fs/promises';
import { createEventBus, type EventBus } from '../core/event-bus.js';
import { createCoordinator, type WorkerExecutor } from './coordinator.js';
import { createInMemoryTaskList } from './in-memory-task-list.js';
import {
  type ResearchResult,
  type WorkerRole,
} from './types.js';
import type { VerificationRunner } from './verification.js';

const FIXED_NOW = 1_700_000_000_000;
const SYMBOL = '600519.SH';
const RESEARCH_ORDER: WorkerRole[] = [
  'technical-analysis',
  'fundamental-analysis',
  'capital-flow',
  'sentiment-analysis',
];

// --- helpers ---------------------------------------------------------------

interface FakeExecutorOpts {
  /** Worker roles that should fail during runResearch. */
  failRoles?: WorkerRole[];
  /** Per-role research override (used when role is NOT in failRoles). */
  researchOverride?: Partial<Record<WorkerRole, ResearchResult>>;
  /** Override the default implement (writes a real .md). */
  implementFn?: WorkerExecutor['implement'];
  /** Make implement flaky: fail the first N attempts, then succeed. */
  flakyImplement?: { failTimes: number; error?: string };
  /** Make implement always fail with the given error. */
  failingImplement?: { error: string };
}

interface FakeExecutorHandle {
  executor: WorkerExecutor;
  implementCalls: number;
  tmpArtifacts: string[];
}

function buildFakeExecutor(opts: FakeExecutorOpts = {}): FakeExecutorHandle {
  const handle: FakeExecutorHandle = {
    executor: {} as WorkerExecutor,
    implementCalls: 0,
    tmpArtifacts: [],
  };

  const writeRealMd = async (symbol: string): Promise<string> => {
    const artifact = `/tmp/upup-e2e-${symbol}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.md`;
    handle.tmpArtifacts.push(artifact);
    const content = [
      `# Investment Analysis for ${symbol}`,
      '',
      '## Synthesis',
      '',
      'Overall bias: bullish (avg confidence 0.70).',
      '',
      '## Recommendation',
      '',
      'BUY with target band 1850-2050, stop-loss 1750.',
    ].join('\n');
    await Bun.write(artifact, content);
    return artifact;
  };

  const executor: WorkerExecutor = {
    async runResearch(role, symbol, _systemPrompt) {
      if (opts.failRoles?.includes(role)) {
        throw new Error(`${role} worker failed`);
      }
      if (opts.researchOverride?.[role]) {
        return opts.researchOverride[role]!;
      }
      return {
        role,
        symbol,
        findings: { role, note: `${role} findings for ${symbol}` },
        confidence: 0.7,
        completedAt: FIXED_NOW,
      };
    },
    async implement(_role, plan) {
      handle.implementCalls += 1;
      if (
        opts.failingImplement &&
        handle.implementCalls > 0
      ) {
        throw new Error(opts.failingImplement.error);
      }
      if (
        opts.flakyImplement &&
        handle.implementCalls <= opts.flakyImplement.failTimes
      ) {
        throw new Error(opts.flakyImplement.error ?? `flake attempt ${handle.implementCalls}`);
      }
      if (opts.implementFn) {
        const r = await opts.implementFn(_role, plan);
        if (r.artifact.startsWith('/tmp/')) handle.tmpArtifacts.push(r.artifact);
        return r;
      }
      const artifact = await writeRealMd(SYMBOL);
      return { artifact };
    },
  };
  handle.executor = executor;
  return handle;
}

/**
 * Always-pass fake VerificationRunner. Each call records its command so
 * tests can assert on what was invoked.
 */
function recordingRunner(opts: { tscExitCode?: number; bunTestExitCode?: number } = {}): {
  runner: VerificationRunner;
  calls: Array<{ cmd: string[]; opts?: { cwd?: string; timeoutMs?: number } }>;
} {
  const calls: Array<{ cmd: string[]; opts?: { cwd?: string; timeoutMs?: number } }> = [];
  const tscExit = opts.tscExitCode ?? 0;
  const bunExit = opts.bunTestExitCode ?? 0;
  const responses: Array<{ exitCode: number; stderr?: string }> = [
    { exitCode: tscExit, stderr: tscExit !== 0 ? 'fake tsc error' : '' },
    { exitCode: bunExit, stderr: bunExit !== 0 ? 'fake bun test error' : '' },
  ];
  const runner: VerificationRunner = {
    async run(cmd, opts) {
      calls.push({ cmd, opts: opts as { cwd?: string; timeoutMs?: number } });
      const r = responses.shift() ?? { exitCode: 0 };
      return { exitCode: r.exitCode, stdout: '', stderr: r.stderr ?? '' };
    },
  };
  return { runner, calls };
}

// --- tests -----------------------------------------------------------------

describe('coordinator v2 e2e (Sprint 2.1.8) -- full 4-phase with real verification', () => {
  let bus: EventBus;
  const extraArtifacts: string[] = [];
  const fastPolicy = {
    maxAttempts: 3,
    initialBackoffMs: 0,
    backoffFactor: 1,
    maxBackoffMs: 0,
    sleep: () => Promise.resolve(),
  };

  beforeEach(() => {
    bus = createEventBus();
  });

  afterEach(async () => {
    for (const f of extraArtifacts) {
      await unlink(f).catch(() => {});
    }
    extraArtifacts.length = 0;
  });

  test('happy path: 4 research -> synthesis -> implement writes .md -> verify passes', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, tmpArtifacts } = buildFakeExecutor();
    const { runner: _runner } = recordingRunner();
    const coord = createCoordinator(
      {
        taskList,
        bus,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL, { depth: 'standard' });

      // Phase 1: 4 research results, in RESEARCH_TASKS order
      expect(result.research).toHaveLength(4);
      expect(result.research.map((r) => r.role)).toEqual(RESEARCH_ORDER);

      // Phase 2: synthesis
      expect(result.synthesis).toMatch(/Investment synthesis/);
      expect(result.synthesis).toMatch(/Overall bias: bullish/);

      // Phase 3: implement wrote a real file on disk
      expect(result.implementation).toBeDefined();
      const artifact = result.implementation!.artifact;
      extraArtifacts.push(artifact, ...tmpArtifacts);
      expect(await Bun.file(artifact).exists()).toBe(true);
      const content = await Bun.file(artifact).text();
      expect(content).toMatch(/^# Investment Analysis for /m);
      expect(content).toMatch(/^## Synthesis/m);

      // Phase 4: verify passed
      expect(result.verification?.ok).toBe(true);

      // Task list: 4 research + 1 synthesis + 1 implement + 1 verify (final)
      const research = await taskList.list({ phase: 'research' });
      const synthesis = await taskList.list({ phase: 'synthesis' });
      const impl = await taskList.list({ phase: 'implementation' });
      const ver = await taskList.list({ phase: 'verification' });
      expect(research).toHaveLength(4);
      expect(research.every((t) => t.status === 'completed')).toBe(true);
      expect(synthesis).toHaveLength(1);
      expect(synthesis[0]?.status).toBe('completed');
      expect(impl).toHaveLength(1);
      expect(impl[0]?.status).toBe('completed');
      expect(impl[0]?.artifacts).toContain(artifact);
      expect(ver).toHaveLength(1);
      expect(ver[0]?.status).toBe('completed');
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('wrapInXml: 4 task-notification blocks in RESEARCH_TASKS order, all completed', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, tmpArtifacts } = buildFakeExecutor();
    const coord = createCoordinator(
      {
        taskList,
        bus,
        wrapInXml: true,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL);

      expect(result.researchXml).toHaveLength(4);
      const roles: string[] = [];
      for (const xml of result.researchXml) {
        expect(xml).toContain('<task-notification');
        expect(xml).toContain('</task-notification>');
        expect(xml).toMatch(/status="completed"/);
        // worker-xml uses kebab-case attributes (worker-role, task-id)
        const m = xml.match(/worker-role="([^"]+)"/);
        expect(m).not.toBeNull();
        roles.push(m![1]!);
      }
      expect(roles).toEqual(RESEARCH_ORDER);
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('.ts artifact: implement writes .ts, verification runs tsc via injected runner', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { runner, calls } = recordingRunner({ tscExitCode: 0 });
    const { executor, tmpArtifacts } = buildFakeExecutor({
      implementFn: async () => {
        const artifact = `/tmp/upup-e2e-ts-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.ts`;
        tmpArtifacts.push(artifact);
        await Bun.write(artifact, 'export const x: number = 1;');
        return { artifact };
      },
    });
    const coord = createCoordinator(
      {
        taskList,
        bus,
        verificationRunner: runner,
        verificationDeps: { runBunTest: false },
      },
      executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL);
      expect(result.implementation?.artifact).toMatch(/\.ts$/);
      expect(result.verification?.ok).toBe(true);

      // tsc was called exactly once with --noEmit and the artifact path
      const tscCalls = calls.filter((c) => c.cmd.includes('tsc'));
      expect(tscCalls).toHaveLength(1);
      expect(tscCalls[0]!.cmd).toContain('--noEmit');
      expect(tscCalls[0]!.cmd).toContain(result.implementation!.artifact);
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('workerResumePolicy: flaky implement (1 fail) -> retry -> succeed -> verify passes', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const handle = buildFakeExecutor({
      flakyImplement: { failTimes: 1, error: 'flake 1' },
    });
    const { runner: _r } = recordingRunner();
    const resumeEvents: Array<{ taskId: string; type: string; attempt: number }> = [];
    bus.on('coordinator.worker.resume', (e) => {
      const p = e.payload as {
        taskId: string;
        event: { type: string; attempt: number };
      };
      resumeEvents.push({ taskId: p.taskId, type: p.event.type, attempt: p.event.attempt });
    });
    const coord = createCoordinator(
      {
        taskList,
        bus,
        workerResumePolicy: fastPolicy,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      handle.executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL);
      expect(handle.implementCalls).toBe(2);
      expect(result.implementation).toBeDefined();
      const artifact = result.implementation!.artifact;
      extraArtifacts.push(artifact, ...handle.tmpArtifacts);
      expect(result.verification?.ok).toBe(true);

      // 1 retry event from the implement phase (verify succeeded on 1st try)
      const implRetries = resumeEvents.filter((e) => e.taskId.startsWith('implement-'));
      expect(implRetries).toHaveLength(1);
      expect(implRetries[0]!.type).toBe('retry');
      expect(implRetries[0]!.attempt).toBe(1);
    } finally {
      for (const f of handle.tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('verification failure: implement writes bad .md (no headings) -> verify fails', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, tmpArtifacts } = buildFakeExecutor({
      implementFn: async () => {
        const artifact = `/tmp/upup-e2e-bad-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.md`;
        tmpArtifacts.push(artifact);
        // No heading at all -> md-structure check fails
        await Bun.write(artifact, 'plain prose, no markdown headings whatsoever');
        return { artifact };
      },
    });
    const coord = createCoordinator(
      {
        taskList,
        bus,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL);
      expect(result.implementation).toBeDefined();
      extraArtifacts.push(result.implementation!.artifact);
      expect(result.verification?.ok).toBe(false);
      expect(result.verification?.notes).toMatch(/md-structure: no markdown headings/);
      const ver = await taskList.list({ phase: 'verification' });
      expect(ver[0]?.status).toBe('failed');
      // Implementation still completed (deliverable was written), only verify failed
      const impl = await taskList.list({ phase: 'implementation' });
      expect(impl[0]?.status).toBe('completed');
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('one failed research worker -> other 3 succeed -> XML has status=failed for that one', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, tmpArtifacts } = buildFakeExecutor({
      failRoles: ['sentiment-analysis'],
    });
    const coord = createCoordinator(
      {
        taskList,
        bus,
        wrapInXml: true,
        verificationDeps: { runTsc: false, runBunTest: false },
      },
      executor,
    );
    try {
      const result = await coord.runAnalysis(SYMBOL);
      // 3 research succeeded
      expect(result.research).toHaveLength(3);
      expect(result.research.map((r) => r.role).sort()).toEqual([
        'capital-flow',
        'fundamental-analysis',
        'technical-analysis',
      ]);
      // XML has all 4 (3 completed + 1 failed)
      expect(result.researchXml).toHaveLength(4);
      const failedBlocks = result.researchXml.filter((x) => x.includes('status="failed"'));
      expect(failedBlocks).toHaveLength(1);
      expect(failedBlocks[0]).toContain('worker-role="sentiment-analysis"');

      // Failed research task is marked failed in the task list
      const failed = await taskList.list({ status: 'failed', phase: 'research' });
      expect(failed).toHaveLength(1);
      expect(failed[0]?.assignee).toBe('sentiment-analysis');

      // Synthesis + implement + verify still run (degraded but functional)
      expect(result.synthesis).toMatch(/Investment synthesis/);
      expect(result.implementation).toBeDefined();
      expect(result.verification?.ok).toBe(true);
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('depth=quick: research + synthesis only, no implement/verify tasks', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const { executor, tmpArtifacts, implementCalls } = buildFakeExecutor();
    const coord = createCoordinator({ taskList, bus }, executor);
    try {
      const result = await coord.runAnalysis(SYMBOL, { depth: 'quick' });
      expect(result.implementation).toBeUndefined();
      expect(result.verification).toBeUndefined();
      expect(implementCalls).toBe(0);
      const impl = await taskList.list({ phase: 'implementation' });
      const ver = await taskList.list({ phase: 'verification' });
      expect(impl).toHaveLength(0);
      expect(ver).toHaveLength(0);
      // Research + synthesis still ran
      expect(result.research).toHaveLength(4);
      expect(result.synthesis).toMatch(/Investment synthesis/);
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test('coordinator.task events are emitted for every task transition', async () => {
    const taskList = createInMemoryTaskList({ now: () => FIXED_NOW });
    const transitions: Array<{ id: string; status: string }> = [];
    bus.on('coordinator.task', (e) => {
      const t = (e.payload as { task: { id: string; status: string } }).task;
      transitions.push({ id: t.id, status: t.status });
    });
    const { executor, tmpArtifacts } = buildFakeExecutor();
    const coord = createCoordinator(
      { taskList, bus, verificationDeps: { runTsc: false, runBunTest: false } },
      executor,
    );
    try {
      await coord.runAnalysis(SYMBOL, { depth: 'standard' });
      const ids = new Set(transitions.map((t) => t.id));
      // All 4 research tasks transition through in_progress -> completed
      for (const role of RESEARCH_ORDER) {
        expect(ids.has(`research-${role}-${SYMBOL}`)).toBe(true);
      }
      // Synthesis + implement + verify tasks also transitioned
      expect(ids.has(`synthesis-${SYMBOL}`)).toBe(true);
      expect(ids.has(`implement-${SYMBOL}`)).toBe(true);
      expect(ids.has(`verify-${SYMBOL}`)).toBe(true);
    } finally {
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });
});
