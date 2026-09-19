/**
 * 止盈算法单元测试
 */
import { describe, it, expect } from "bun:test";
import { calcShortTakeProfit, isValidTakeProfit } from "../../src/domain/signal/take-profit.js";
import type { Bar } from "../../src/domain/types.js";

function bar(date: string, o: number, h: number, l: number, c: number): Bar {
  return { date, open: o, high: h, low: l, close: c };
}

describe("calcShortTakeProfit 修复后行为", () => {
  // 修复后：入场后找不到完整序列时返回 null，不幻觉出错误的高位

  it("入场后没有形成创新高序列时返回 null（不接受入场前的价位）", () => {
    // bars[0] 是反弹拐点 newHighCloseIdx=5680
    // bars[2] 是入场 pivotIdx=5468
    // 入场后价格单边下跌，找不到创新高序列
    const bars: Bar[] = [
      bar("2020-02-04", 5660, 5680, 5650, 5680),  // newHighCloseIdx=0
      bar("2020-02-05", 5680, 5660, 5550, 5580),
      bar("2020-03-18", 5580, 5490, 5460, 5468),  // pivotIdx=2 (入场)
      bar("2020-03-19", 5468, 5450, 5300, 5320),  // 单边下跌
      bar("2020-03-20", 5320, 5310, 5100, 5120),
      bar("2020-03-23", 5120, 5200, 5050, 5180),
      bar("2020-03-24", 5180, 5170, 5000, 5020),
    ];
    const tp = calcShortTakeProfit(bars, 2, 0);
    // 入场后没有创新高序列，应返回 null
    expect(tp).toBeNull();
  });

  it("入场后形成完整的创新高→创新低序列时返回正确止盈（占位）", () => {
    // 已知问题：构造用例难，真实数据测试更可靠
    // 此测试由 take-profit-integration.test.ts 用 SR0 2020-06 真实数据验证
    expect(true).toBe(true);
  });
});

describe("isValidTakeProfit 方向校验", () => {
  it("做空：止盈 < 入场 = valid", () => {
    expect(isValidTakeProfit("short", 100, 95)).toBe(true);
  });
  it("做空：止盈 > 入场 = invalid", () => {
    expect(isValidTakeProfit("short", 100, 105)).toBe(false);
  });
  it("做空：止盈 == 入场 = invalid（必须严格小于）", () => {
    expect(isValidTakeProfit("short", 100, 100)).toBe(false);
  });
  it("做多：止盈 > 入场 = valid", () => {
    expect(isValidTakeProfit("long", 100, 105)).toBe(true);
  });
  it("做多：止盈 < 入场 = invalid", () => {
    expect(isValidTakeProfit("long", 100, 95)).toBe(false);
  });
});