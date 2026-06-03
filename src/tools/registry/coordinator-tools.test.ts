/**
 * Tests for the coordinator-tools registry wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/coordinator-mode
 */

import { afterEach, describe, expect, test } from "bun:test";
import {
  loadCoordinatorTools,
  setCoordinatorExecutor,
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
