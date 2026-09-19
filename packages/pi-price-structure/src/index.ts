/**
 * @upup/pi-price-structure
 *
 * 期货价格结构交易系统完整实现：
 *   周线判方向 + 日线找拐点 + 止损止盈 + 严格风控 + 完整回测
 */
export * from "./domain/types.js";
export * from "./domain/structures/bullish.js";
export * from "./domain/structures/bearish.js";
export * from "./domain/structures/top.js";
export * from "./domain/structures/bottom.js";
export * from "./domain/structures/pullback-pivot.js";
export * from "./domain/structures/bounce-pivot.js";
export * from "./domain/signal/entry.js";
export * from "./domain/signal/stop-loss.js";
export * from "./domain/signal/take-profit.js";
export * from "./domain/risk/position-sizing.js";
export * from "./domain/backtest/engine.js";
export * from "./domain/backtest/metrics.js";
export * from "./domain/backtest/cost-model.js";
export * from "./adapters/akshare-bridge.js";
export { default as register } from "./extensions/register.js";