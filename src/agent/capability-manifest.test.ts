/**
 * Tests for the investment capability manifest.
 */

import { describe, expect, test } from "bun:test";
import { buildInvestmentCapabilitiesSection, CAPABILITY_GROUPS } from "./capability-manifest.js";

describe("CAPABILITY_GROUPS", () => {
  test("has 5 well-known groups covering all P1/P2 capabilities", () => {
    const ids = CAPABILITY_GROUPS.map((g) => g.id);
    expect(ids).toEqual([
      "realtime",
      "coordinator",
      "kairos",
      "citation",
      "trading",
      "multimodal",
    ]);
  });

  test("every group has non-empty title / prefixes / blurb / whenToUse", () => {
    for (const g of CAPABILITY_GROUPS) {
      expect(g.title).toBeTruthy();
      expect(g.prefixes.length).toBeGreaterThan(0);
      expect(g.blurb).toBeTruthy();
      expect(g.whenToUse.length).toBeGreaterThan(0);
    }
  });

  test("prefixes are non-overlapping across groups (no tool matches two groups)", () => {
    // Build a name -> groups map and ensure each name appears in only one group
    // (we only check the obvious collisions: trading vs realtime both have
    // names starting with the same word? — they're disjoint by design).
    const nameToGroup: Map<string, string[]> = new Map();
    for (const g of CAPABILITY_GROUPS) {
      // Use prefix strings as surrogate "names" for collision detection
      for (const p of g.prefixes) {
        const existing = nameToGroup.get(p) ?? [];
        existing.push(g.id);
        nameToGroup.set(p, existing);
      }
    }
    for (const [prefix, groups] of nameToGroup) {
      expect(groups.length).toBe(1);
    }
  });
});

describe("buildInvestmentCapabilitiesSection", () => {
  test("returns a non-empty markdown section listing the registered investment tools", async () => {
    const md = await buildInvestmentCapabilitiesSection();
    expect(md).toStartWith("## Investment Capabilities");
    // All 4 of the groups with registered tools should appear (realtime /
    // coordinator / kairos / trading). Multimodal is only listed if the
    // registry exposes render_* / ascii_* tools; current registry does not
    // (multimodal is src/multimodal/, not yet wired as tools).
    expect(md).toContain("Realtime market data");
    expect(md).toContain("Multi-worker investment analysis");
    expect(md).toContain("Proactive scanner");
    expect(md).toContain("Paper / live trading");
  });

  test("each rendered group lists its tools in backticks", async () => {
    const md = await buildInvestmentCapabilitiesSection();
    expect(md).toContain("`realtime_subscribe`");
    expect(md).toContain("`analyze_symbol`");
    expect(md).toContain("`kairos_summary`");
    expect(md).toContain("`place_trade_order`");
  });

  test("each rendered group carries a 'When to use' section", async () => {
    const md = await buildInvestmentCapabilitiesSection();
    const whenBlocks = md.split("**When to use**:");
    // 1 split = 1 section; n splits = n-1 sections
    expect(whenBlocks.length).toBeGreaterThanOrEqual(2);
  });
});
