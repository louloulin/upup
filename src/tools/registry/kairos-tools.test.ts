/**
 * Tests for the kairos-tools registry wiring.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { loadKairosTools } from "./kairos-tools.js";
import { resetDefaultBus, getDefaultBus, type EventBus } from "../../core/event-bus.js";

describe("loadKairosTools", () => {
  let bus: EventBus;
  beforeEach(() => {
    resetDefaultBus();
    bus = getDefaultBus();
  });

  test("exposes the 4 expected tools", () => {
    const tools = loadKairosTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual([
      "kairos_recent_opportunities",
      "kairos_recent_position_alerts",
      "kairos_recent_scanner_events",
      "kairos_summary",
    ]);
  });

  test("each tool carries a non-empty description and compact description", () => {
    const tools = loadKairosTools();
    for (const t of tools) {
      expect(t.description).toBeTruthy();
      expect(t.compactDescription).toBeTruthy();
    }
  });

  test("each tool exposes a callable PiTool", () => {
    const tools = loadKairosTools();
    for (const t of tools) {
      expect(t.tool).toBeTruthy();
      expect(typeof (t.tool as { invoke?: unknown }).invoke).toBe("function");
    }
  });
});
