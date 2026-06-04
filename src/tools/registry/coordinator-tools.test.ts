/**
 * Tests for the coordinator-tools registry wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  loadCoordinatorTools,
  setCoordinatorExecutor,
  setCoordinatorOptions,
  getLastCoordinatorResult,
} from "./coordinator-tools.js";
import type { ResearchResult, WorkerRole } from "../../coordinator/index.js";

afterEach(() => {
  setCoordinatorExecutor(null);
});

describe("loadCoordinatorTools", () => {
  test("exposes the 2 expected tools", () => {
    const tools = loadCoordinatorTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(["analyze_symbol", "list_research_tasks"]);
  });

  test("each tool carries a non-empty description and compact description", () => {
    const tools = loadCoordinatorTools();
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.compactDescription).toBeTruthy();
    }
  });

  test("each tool exposes a callable StructuredToolInterface", () => {
    const tools = loadCoordinatorTools();
    for (const t of tools) {
      expect(t.tool).toBeTruthy();
      expect(typeof (t.tool as { invoke?: unknown }).invoke).toBe("function");
    }
  });

  test("analyze_symbol runs default executor and persists the result", async () => {
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const result = JSON.parse(
      await (analyze.tool as any).invoke({
        symbol: "AAPL",
        question: "Is it a buy?",
      }),
    );
    expect(result.symbol).toBe("AAPL");
    expect(Array.isArray(result.research)).toBe(true);
    expect(result.research.length).toBe(4); // all 4 default workers
    for (const r of result.research) {
      expect(r.role).toBeTruthy();
      expect(r.findings).toBeTruthy();
    }
    expect(result.synthesis).toBeTruthy();
    expect(Array.isArray(result.tasks)).toBe(true);
    expect(getLastCoordinatorResult()?.symbol).toBe("AAPL");
  });

  test("custom WorkerExecutor is honored", async () => {
    setCoordinatorExecutor({
      async runResearch(role: WorkerRole, symbol: string): Promise<ResearchResult> {
        return {
          role,
          symbol,
          findings: { custom: true, role },
          confidence: 0.9,
          completedAt: Date.now(),
        };
      },
    });
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const result = JSON.parse(
      await (analyze.tool as any).invoke({
        symbol: "NVDA",
        question: "深度分析",
      }),
    );
    // "深度" keyword should map to depth=deep
    expect(result.symbol).toBe("NVDA");
    for (const r of result.research) {
      expect(r.findings.custom).toBe(true);
      expect(r.confidence).toBe(0.9);
    }
  });

  test("workers filter narrows the result (post-run filter on the tool surface)", async () => {
    let calls = 0;
    setCoordinatorExecutor({
      async runResearch(role, symbol): Promise<ResearchResult> {
        calls++;
        return { role, symbol, findings: {}, confidence: 0.5, completedAt: Date.now() };
      },
    });
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const result = JSON.parse(
      await (analyze.tool as any).invoke({
        symbol: "X",
        question: "quick",
        workers: ["technical-analysis"],
      }),
    );
    expect(result.research.length).toBe(1);
    expect(calls).toBe(4); // all 4 workers ran; filter is on the tool surface
  });

  test("list_research_tasks returns the latest run's tasks", async () => {
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const list = tools.find((t) => t.name === "list_research_tasks")!;

    await (analyze.tool as any).invoke({ symbol: "Z", question: "?" });
    const result = JSON.parse(await (list.tool as any).invoke({}));
    expect(result.tasks.length).toBeGreaterThan(0);
    const researchTasks = JSON.parse(
      await (list.tool as any).invoke({ phase: "research" }),
    );
    for (const t of researchTasks.tasks) {
      expect(t.phase).toBe("research");
    }
  });

  test("rejects missing symbol or question", async () => {
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    await expect((analyze.tool as any).invoke({ question: "?" })).rejects.toThrow();
    await expect((analyze.tool as any).invoke({ symbol: "X" })).rejects.toThrow();
  });
});

/**
 * Sprint 2.1.10: analyze_symbol wires the v2 coordinator features
 * (wrapInXml + workerResumePolicy + verificationDeps overrides) by
 * default. These tests assert that the tool surface activates them
 * end-to-end without the caller needing to thread extra config.
 */
describe("analyze_symbol v2 (Sprint 2.1.10)", () => {
  // Reset both the executor slot AND the options override between tests,
  // so the order in this file does not affect the next describe block.
  afterEach(() => {
    setCoordinatorExecutor(null);
    setCoordinatorOptions({});
  });

  test("wrapInXml is on by default: result.researchXml has 4 task-notification blocks", async () => {
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const result = JSON.parse(
      await (analyze.tool as any).invoke({ symbol: "AAPL", question: "buy?" }),
    );
    expect(Array.isArray(result.researchXml)).toBe(true);
    expect(result.researchXml).toHaveLength(4);
    for (const xml of result.researchXml) {
      expect(xml).toContain("<task-notification");
      expect(xml).toContain("</task-notification>");
      expect(xml).toMatch(
        /worker-role="(technical-analysis|fundamental-analysis|capital-flow|sentiment-analysis)"/,
      );
    }
  });

  test("setCoordinatorOptions overrides verificationRunner: a fake runner is used (no real tsc)", async () => {
    // Use a fake VerificationRunner that records each call so we can
    // assert that tsc was actually invoked through the injection point.
    const calls: string[][] = [];
    const fakeRunner = {
      async run(cmd: string[]) {
        calls.push(cmd);
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    };
    setCoordinatorOptions({
      verificationRunner: fakeRunner as any,
      verificationDeps: { runBunTest: false },
    });
    // Inject an executor that writes a real .ts file so verification
    // has something to check.
    setCoordinatorExecutor({
      async runResearch(role, symbol) {
        return {
          role,
          symbol,
          findings: { stub: true },
          confidence: 0.5,
          completedAt: Date.now(),
        };
      },
      async implement(_role, _plan) {
        const artifact = `/tmp/upup-tool-ts-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.ts`;
        await Bun.write(artifact, "export const x: number = 1;");
        return { artifact };
      },
    });
    const tools = loadCoordinatorTools();
    const analyze = tools.find((t) => t.name === "analyze_symbol")!;
    const result = JSON.parse(
      await (analyze.tool as any).invoke({ symbol: "NVDA", question: "?" }),
    );
    expect(result.implementation).toBeDefined();
    expect(result.implementation.artifact).toMatch(/\.ts$/);
    // The fake runner should have been called for tsc.
    const tscCalls = calls.filter((c) => c.includes("tsc"));
    expect(tscCalls.length).toBeGreaterThanOrEqual(1);
    expect(tscCalls[0]).toContain("--noEmit");
    // Cleanup
    const { unlink } = await import("node:fs/promises");
    await unlink(result.implementation.artifact).catch(() => {});
  });

  test("workerResumePolicy: flaky implement via setCoordinatorExecutor retries on the tool surface", async () => {
    // v2: a 1st-attempt failure in implement should retry (3 attempts) and
    // eventually succeed. The result.implementation should be defined and
    // result.verification.ok should be true.
    let implementCalls = 0;
    const tmpArtifacts: string[] = [];
    setCoordinatorOptions({
      verificationDeps: { runTsc: false, runBunTest: false },
      // Override the default 500ms initial backoff with 0 so the test
      // doesn't actually wait. The DEFAULT_COORDINATOR_RESUME_POLICY
      // defaults are verified separately in a dedicated test below.
      workerResumePolicy: {
        maxAttempts: 3,
        initialBackoffMs: 0,
        backoffFactor: 1,
        maxBackoffMs: 0,
        sleep: () => Promise.resolve(),
      },
    });
    setCoordinatorExecutor({
      async runResearch(role, symbol) {
        return {
          role,
          symbol,
          findings: { stub: true },
          confidence: 0.5,
          completedAt: Date.now(),
        };
      },
      async implement(_role, _plan) {
        implementCalls += 1;
        if (implementCalls === 1) {
          throw new Error("flake attempt 1");
        }
        const artifact = `/tmp/upup-tool-retry-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.md`;
        tmpArtifacts.push(artifact);
        await Bun.write(
          artifact,
          "# Report\n\n## Synthesis\n\nBody.\n\n## Recommendation\n\nBUY.",
        );
        return { artifact };
      },
    });
    try {
      const tools = loadCoordinatorTools();
      const analyze = tools.find((t) => t.name === "analyze_symbol")!;
      const result = JSON.parse(
        await (analyze.tool as any).invoke({ symbol: "TSLA", question: "?" }),
      );
      expect(implementCalls).toBe(2);
      expect(result.implementation).toBeDefined();
      expect(result.implementation.artifact).toMatch(/\.md$/);
      expect(result.verification.ok).toBe(true);
    } finally {
      const { unlink } = await import("node:fs/promises");
      for (const f of tmpArtifacts) await unlink(f).catch(() => {});
    }
  });

  test("DEFAULT_COORDINATOR_RESUME_POLICY is exported and has the expected defaults", async () => {
    const { DEFAULT_COORDINATOR_RESUME_POLICY } = await import("./coordinator-tools.js");
    expect(DEFAULT_COORDINATOR_RESUME_POLICY.maxAttempts).toBe(3);
    expect(DEFAULT_COORDINATOR_RESUME_POLICY.initialBackoffMs).toBe(500);
    expect(DEFAULT_COORDINATOR_RESUME_POLICY.backoffFactor).toBe(2);
    expect(DEFAULT_COORDINATOR_RESUME_POLICY.maxBackoffMs).toBe(5000);
  });
});
