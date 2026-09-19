/**
 * 风控校验单元测试。
 */
import { describe, it, expect } from "bun:test";
import { checkRisk, MIN_LOSS_YUAN, MAX_LOSS_YUAN } from "../../src/domain/risk/position-sizing.js";

describe("checkRisk", () => {
  it("亏损在 [10, 2000] 内通过", () => {
    // 入场 100, 止损 99, 乘数 1000, 亏损 = 1*1000 = 1000
    const r = checkRisk(100, 99, 1000);
    expect(r.pass).toBe(true);
    expect(r.quantity).toBe(1);
    expect(r.estimatedLoss).toBe(1000);
  });

  it("亏损 < 10 元不通过", () => {
    // 入场 100, 止损 99.99, 乘数 100, 亏损 = 0.01*100 = 1
    const r = checkRisk(100, 99.99, 100);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain(`${MIN_LOSS_YUAN}`);
  });

  it("亏损 > 2000 元不通过", () => {
    // 入场 100, 止损 50, 乘数 1000, 亏损 = 50*1000 = 50000
    const r = checkRisk(100, 50, 1000);
    expect(r.pass).toBe(false);
    expect(r.reason).toContain(`${MAX_LOSS_YUAN}`);
  });

  it("做空：止损高于入场价", () => {
    // 做空入场 100, 止损 101, 乘数 100, 亏损 = 1*100 = 100
    const r = checkRisk(100, 101, 100);
    expect(r.pass).toBe(true);
    expect(r.estimatedLoss).toBe(100);
  });

  it("强制 1 手（quantity 不传时）", () => {
    const r = checkRisk(100, 99, 1000);
    expect(r.quantity).toBe(1);
  });
});