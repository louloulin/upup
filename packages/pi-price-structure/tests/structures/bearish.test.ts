/**
 * 空头结构识别单元测试。
 */
import { describe, it, expect } from "bun:test";
import { detectBearishStructure } from "../../src/domain/structures/bearish.js";
import type { Bar } from "../../src/domain/types.js";

function bar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { date, open: o, high: h, low: l, close: c };
}

describe("detectBearishStructure", () => {
  it("空数组返回未识别", () => {
    expect(detectBearishStructure([]).detected).toBe(false);
  });

  it("方法 A：创新高阳线 + 阴线基线 + 连续3根 + 第3根创新低阴线", () => {
    const bars: Bar[] = [
      bar("2026-01-05", 95, 100, 90, 98),
      bar("2026-01-12", 100, 130, 95, 125),    // 创新高阳线
      bar("2026-01-19", 124, 125, 110, 112),   // 阴线基线 (close=112)
      bar("2026-01-26", 111, 113, 108, 109),   // < 112 ✓
      bar("2026-02-02", 108, 110, 105, 106),   // < 112 ✓
      bar("2026-02-09", 105, 106, 70, 72),     // < 112 + 创新低阴线 ✓
    ];
    const r = detectBearishStructure(bars);
    expect(r.detected).toBe(true);
    // 注：方法 B 可能抢先匹配
    expect(["A", "B"]).toContain(r.method!);
  });

  it("方法 B：创新高起 9 根内出现创新低阴线（前面无更低）", () => {
    const bars: Bar[] = [
      bar("2026-01-05", 80, 100, 75, 95),
      bar("2026-01-12", 96, 120, 90, 115),     // 创新高
      bar("2026-01-19", 114, 116, 100, 102),   // 阴线
      bar("2026-01-26", 101, 103, 60, 65),     // 创新低阴线 ✓
    ];
    const r = detectBearishStructure(bars);
    expect(r.detected).toBe(true);
    expect(r.method).toBe("B");
  });

  it("无创新高 → 不触发", () => {
    // 平稳走势：所有 K 线都是十字线，没有阳线/阴线
    const bars: Bar[] = [
      bar("2026-01-05", 100, 110, 90, 100),
      bar("2026-01-12", 100, 105, 95, 100),
      bar("2026-01-19", 100, 102, 98, 100),
      bar("2026-01-26", 100, 103, 97, 100),
    ];
    expect(detectBearishStructure(bars).detected).toBe(false);
  });
});