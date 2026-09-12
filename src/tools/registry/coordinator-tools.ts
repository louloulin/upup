/**
 * Coordinator tool registration — wires the 4-worker investment-analysis
 * coordinator into the unified tool registry.
 *
 * Tools:
 *  - analyze_symbol       (network/compute — runs a full 4-phase research)
 *  - list_research_tasks  (read — no side effects)
 *
 * The coordinator is a module-level singleton: a WorkerExecutor can be
 * injected via `setCoordinatorExecutor()` (used by the Pi runtime to wire
 * real Pi workers) and a default no-op executor is used otherwise so
 * tests and offline runs can exercise the tool without an LLM in the loop.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 */

import type { RegisteredTool } from "./types.js";
import { computationMetadata, networkMetadata } from "./types.js";
import {
  createCoordinator,
  createInMemoryTaskList,
  type Coordinator,
  type CoordinatorDeps,
  type CoordinatorRunResult,
  type ResearchResult,
  type Task,
  type WorkerRole,
  type WorkerExecutor,
} from "../../coordinator/index.js";
import type { WorkerResumePolicy } from "../../coordinator/worker-resume.js";
import { PiTool } from "../../runtime/pi/tool.js";
import { z } from "zod";

let executor: WorkerExecutor | null = null;
let coordinatorOptionsOverride: Partial<CoordinatorDeps> = {};
let lastResult: CoordinatorRunResult | null = null;
let lastTasks: Task[] = [];

/**
 * v2 (Sprint 2.1.10): default resume policy for the coordinator's
 * implement / verify phases. Longer initial backoff (500ms) than the
 * library default (100ms) because the coordinator is end-user-facing:
 * we'd rather wait a moment for a flaky worker than surface a fast
 * escalation. Capped at 5s so retries don't blow the tool timeout.
 */
export const DEFAULT_COORDINATOR_RESUME_POLICY: Partial<WorkerResumePolicy> = {
  maxAttempts: 3,
  initialBackoffMs: 500,
  backoffFactor: 2,
  maxBackoffMs: 5000,
};

/** Inject a real WorkerExecutor (production / agent loop wiring). */
export function setCoordinatorExecutor(ex: WorkerExecutor | null): void {
  executor = ex;
}

/**
 * v2 (Sprint 2.1.10): inject CoordinatorDeps overrides. Use to:
 *   - Pass a fake `verificationRunner` in tests (avoids spawning real
 *     `bun x tsc` / `bun test` processes).
 *   - Tighten / loosen the resume policy.
 *   - Pass a file-backed `taskList` for persistent runs.
 *
 * The override is shallow-merged on top of the v2 defaults (wrapInXml,
 * workerResumePolicy) so callers don't have to repeat the boilerplate.
 */
export function setCoordinatorOptions(opts: Partial<CoordinatorDeps>): void {
  coordinatorOptionsOverride = opts;
}

export function getLastCoordinatorResult(): CoordinatorRunResult | null {
  return lastResult;
}

export function getLastCoordinatorTasks(): Task[] {
  return [...lastTasks];
}

/** Default no-op executor for tests / offline. Each worker returns a stub
 * finding referencing the symbol; the coordinator still walks all 4 phases
 * and writes to the in-memory task list. */
const defaultExecutor: WorkerExecutor = {
  async runResearch(role, symbol, _systemPrompt): Promise<ResearchResult> {
    return {
      role,
      symbol,
      findings: {
        summary: `[${role}] stub finding for ${symbol}`,
        note: "Default executor — setCoordinatorExecutor() for real Pi workers.",
      },
      confidence: 0.5,
      completedAt: Date.now(),
    };
  },
};

async function runCoordinator(
  symbol: string,
  question: string,
  workers: WorkerRole[] | undefined,
): Promise<CoordinatorRunResult> {
  const ex = executor ?? defaultExecutor;
  const taskList = createInMemoryTaskList();
  const coordinator: Coordinator = createCoordinator(
    {
      taskList,
      // v2 (Sprint 2.1.10): enable v2 coordinator features by default
      // for the production analyze_symbol surface.
      wrapInXml: true,
      workerResumePolicy: DEFAULT_COORDINATOR_RESUME_POLICY,
      // Allow tests / production overrides to take precedence.
      ...coordinatorOptionsOverride,
    },
    ex,
  );
  // The Coordinator interface accepts (symbol, {depth}); question and
  // workers are surfaced in the tool schema for the LLM's intent, and we
  // map them onto the available depth control:
  //   question with "deep" or "comprehensive" → depth: "deep"
  //   workers of length 1 → depth: "quick"
  //   otherwise → depth: "standard"
  let depth: "quick" | "standard" | "deep" = "standard";
  if (workers && workers.length === 1) depth = "quick";
  if (/深度|深入|详细|comprehensive|deep/i.test(question)) depth = "deep";
  const result = await coordinator.runAnalysis(symbol, { depth });
  // Honor the optional `workers` filter: if the caller asked for a subset,
  // narrow result.research and the per-phase task list down to those roles.
  // The Coordinator's runAnalysis depth control does not currently expose
  // per-role selection, so we filter the post-run result.
  const filtered: CoordinatorRunResult =
    workers && workers.length > 0
      ? {
          ...result,
          research: result.research.filter((r) =>
            (workers as WorkerRole[]).includes(r.role),
          ),
          tasks: result.tasks.filter(
            (t) =>
              !t.assignee ||
              t.assignee === "coordinator" ||
              (workers as WorkerRole[]).includes(t.assignee as WorkerRole),
          ),
        }
      : result;
  lastResult = filtered;
  lastTasks = filtered.tasks;
  return filtered;
}

export const COORDINATOR_DESCRIPTION = `
Coordinator — 4-worker investment analysis orchestrator (v2).

## What It Does
- Spawns up to 4 parallel research workers (technical / fundamental / capital-flow / sentiment)
- Walks the 4-phase protocol: research → synthesis → implementation → verification
- v2: wrapInXml=true — each worker result is serialized as a <task-notification>
  XML block in result.researchXml so the main Agent can inject the wire format
  into its own conversation context (matches the loucode pattern)
- v2: workerResumePolicy — transient failures in implement/verify retry with
  exponential backoff (3 attempts, 500ms initial, ×2, 5s cap) before escalating
- v2: Phase 4 verification runs runVerification (file-exists + readable +
  extension-specific parse + optional tsc + optional bun test)
- Persists a shared task list (in-memory or file-backed) so progress is observable
- Surfaces a structured CoordinatorRunResult with worker findings, synthesis,
  implementation, verification, and researchXml

## When to Use
- User asks "全面分析 600519" or "该不该买入 NVDA" → analyze_symbol
- User wants to inspect the latest research trail → list_research_tasks

## Notes
- In the default wiring the executor returns stub findings. Production
  should call \`setCoordinatorExecutor()\` at startup to wire real Pi workers.
- Tests can call \`setCoordinatorOptions({ verificationRunner: fake })\` to
  avoid spawning real tsc / bun test processes.
- workers filter is optional — omit to run all 4.
`;

export function createAnalyzeSymbolTool() {
  return new PiTool({
    name: "analyze_symbol",
    description: "Run the 4-worker investment-analysis coordinator for a symbol. Returns a structured CoordinatorRunResult with worker findings, synthesis, and recommendation.",
    schema: z.object({
      symbol: z.string().min(1)
        .describe("Ticker symbol to analyze (e.g. '600519', 'AAPL')."),
      question: z.string().min(1)
        .describe("The investment question to answer (e.g. 'Is it a good buy at current price?')."),
      workers: z.array(z.enum([
        "technical-analysis",
        "fundamental-analysis",
        "capital-flow",
        "sentiment-analysis",
      ])).optional()
        .describe("Which workers to spawn. Omit for all 4."),
    }),
    func: async (input) => {
      const result = await runCoordinator(
        input.symbol,
        input.question,
        input.workers as WorkerRole[] | undefined,
      );
      return JSON.stringify(result, null, 2);
    },
  });
}

export function createListResearchTasksTool() {
  return new PiTool({
    name: "list_research_tasks",
    description: "List the tasks persisted by the most recent coordinator run (research / synthesis / implementation / verification).",
    schema: z.object({
      phase: z.enum(["research", "synthesis", "implementation", "verification"]).optional()
        .describe("Filter by phase."),
    }),
    func: async (input) => {
      const filtered = input.phase
        ? lastTasks.filter((t) => t.phase === input.phase)
        : lastTasks;
      return JSON.stringify({ tasks: filtered });
    },
  });
}

export function loadCoordinatorTools(): RegisteredTool[] {
  const compute = computationMetadata();
  const network = networkMetadata();
  return [
    {
      name: "analyze_symbol",
      tool: createAnalyzeSymbolTool(),
      description: COORDINATOR_DESCRIPTION,
      compactDescription: "4-worker 综合分析 (技术/基本面/资金流/舆情),4 阶段协议",
      concurrencySafe: false,
      concurrencyMetadata: network,
    },
    {
      name: "list_research_tasks",
      tool: createListResearchTasksTool(),
      description: "List the tasks persisted by the most recent coordinator run.",
      compactDescription: "查最近 coordinator 任务列表",
      concurrencySafe: true,
      concurrencyMetadata: compute,
    },
  ];
}
