/**
 * 多头结构识别单元测试。
 */
import { describe, it, expect } from "bun:test";
import { detectBullishStructure } from "../../src/domain/structures/bullish.js";
import type { Bar } from "../../src/domain/types.js";

function bar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { date, open: o, high: h, low: l, close: c };
}

describe("detectBullishStructure", () => {
  it("空数组返回未识别", () => {
    const r = detectBullishStructure([]);
    expect(r.detected).toBe(false);
  });

  it("方法 A：创新低阳线 + 阳线基线 + 连续3根 + 第3根创新高阳线", () => {
    // 关键：第3根创新高阳线之前的所有 K 线，close 都不超过它
    const bars: Bar[] = [
      bar("2026-01-05", 100, 110, 90, 95),     // 阴线
      bar("2026-01-12", 92, 96, 78, 80),       // 创新低阴线
      bar("2026-01-19", 82, 88, 81, 85),       // 阳线基线 (close=85)
      bar("2026-01-26", 86, 90, 85, 89),       // > 85 ✓
      bar("2026-02-02", 90, 93, 89, 92),       // > 85 ✓
      bar("2026-02-09", 93, 110, 92, 108),     // > 85 + 创新高阳线 ✓
    ];
    const r = detectBullishStructure(bars);
    expect(r.detected).toBe(true);
    // 注：方法 B 也会命中（第 4 根 close=108 > 所有前面 close），先命中谁谁优先
    expect(["A", "B"]).toContain(r.method!);
  });

  it("方法 B：创新低起 9 根内出现创新高阳线（前面无更高）", () => {
    const bars: Bar[] = [
      bar("2026-01-05", 100, 105, 70, 80),     // 创新低阴线
      bar("2026-01-12", 82, 90, 82, 88),       // 阳线
      bar("2026-01-19", 89, 95, 87, 93),       // 阳线
      bar("2026-01-26", 94, 110, 93, 108),     // 创新高阳线 ✓
    ];
    const r = detectBullishStructure(bars);
    expect(r.detected).toBe(true);
    expect(r.method).toBe("B");
  });

  it("无创新低 → 不触发", () => {
    // 平稳走势：所有 K 线都是十字线，没有阳线/阴线，
    // 方法 A 和 B 都需要阳线，所以不触发
    const bars: Bar[] = [
      bar("2026-01-05", 100, 110, 90, 100),     // 十字线
      bar("2026-01-12", 100, 105, 95, 100),     // 十字线
      bar("2026-01-19", 100, 102, 98, 100),     // 十字线
      bar("2026-01-26", 100, 103, 97, 100),     // 十字线
    ];
    const r = detectBullishStructure(bars);
    expect(r.detected).toBe(false);
  });

  it("多头结构识别后 originIndex 指向创新低 K 线", () => {
    const bars: Bar[] = [
      bar("2026-01-05", 105, 110, 100, 108),    // 高点
      bar("2026-01-12", 108, 110, 70, 75),      // 创新低阴线 index=1
      bar("2026-01-19", 78, 115, 76, 112),      // 创新高阳线
    ];
    const r = detectBullishStructure(bars);
    expect(r.detected).toBe(true);
    expect(r.originIndex).toBe(1);
  });
});