/**
 * Investment-Specialized Subagent Tests (Sprint v7-7)
 *
 * 验证 5 个投资专用 subagent:
 *   - 启动时自动注册到全局 AgentRegistry
 *   - 每个有正确的 id / name / capabilities / taskTypes
 *   - tool 白名单边界正确 (explore 不含 trade, trade 不含 valuation 等)
 *   - unregister / 重注册可工作
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import {
  INVESTMENT_SUBAGENTS,
  getInvestmentSubagents,
  getInvestmentSubagent,
  areInvestmentSubagentsRegistered,
  registerInvestmentSubagents,
  unregisterInvestmentSubagents,
} from './investment-subagents.js';
import { getAgentRegistry } from './registry.js';

const READ_ONLY = [
  'getStockPrice', 'getFilings', 'web_search', 'browser', 'financial_metrics',
  'getTradingPositions', 'getTradingBalance',
];
const VALUATION = ['calculateValuationRatios', 'calculateDCF', 'backtestLumpSum'];
const PORTFOLIO_ANALYTICS = ['calculatePortfolioPnL', 'attribution'];
const TRADE = ['placeTradeOrder', 'cancelTradeOrder'];

describe('v7-7 investment-specialized subagents', () => {
  beforeEach(() => {
    // 重置:测试间重置注册表
    unregisterInvestmentSubagents();
  });
  afterEach(() => {
    // 恢复:测试结束重新注册(保持 side effect 持久, 给后续 describe 留下干净已注册状态)
    registerInvestmentSubagents();
  });

  // --------------------------------------------------------------------------
  // 基础结构
  // --------------------------------------------------------------------------

  test('5 个投资 subagent 全部存在', () => {
    expect(INVESTMENT_SUBAGENTS.length).toBe(5);
    const ids = INVESTMENT_SUBAGENTS.map(a => a.id);
    expect(ids).toEqual([
      'invest-explore',
      'invest-plan',
      'invest-risk',
      'invest-trade',
      'invest-review',
    ]);
  });

  test('每个 subagent 必备字段 (id/name/description/capabilities/taskTypes/systemPrompt/config)', () => {
    for (const a of INVESTMENT_SUBAGENTS) {
      expect(a.id).toMatch(/^invest-/);
      expect(a.name).toBeTruthy();
      expect(a.description).toBeTruthy();
      expect(a.capabilities.length).toBeGreaterThan(0);
      expect(a.taskTypes.length).toBeGreaterThan(0);
      expect(a.systemPrompt).toBeTruthy();
      expect(a.isBuiltIn).toBe(true);
      expect(a.config).toBeDefined();
    }
  });

  test('每个 subagent 都有 toolWhitelist config', () => {
    for (const a of INVESTMENT_SUBAGENTS) {
      const wl = (a.config as { toolWhitelist?: string[] })?.toolWhitelist;
      expect(Array.isArray(wl)).toBe(true);
      expect(wl!.length).toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // Tool 白名单边界
  // --------------------------------------------------------------------------

  test('invest-explore 只含 read 类工具 (不含 trade/valuation/portfolio-analytics)', () => {
    const wl = (INVEST_EXPLORE().config as { toolWhitelist: string[] }).toolWhitelist;
    expect(wl).toContain('getStockPrice');
    expect(wl).toContain('web_search');
    expect(wl.some(t => TRADE.includes(t))).toBe(false);
    expect(wl.some(t => VALUATION.includes(t))).toBe(false);
    expect(wl.some(t => PORTFOLIO_ANALYTICS.includes(t))).toBe(false);
  });

  test('invest-plan 含 read + valuation (不含 trade)', () => {
    const wl = (INVEST_PLAN().config as { toolWhitelist: string[] }).toolWhitelist;
    expect(wl).toContain('getStockPrice');
    for (const t of VALUATION) expect(wl).toContain(t);
    expect(wl.some(t => TRADE.includes(t))).toBe(false);
  });

  test('invest-risk 含 read + portfolio-analytics (不含 trade/valuation)', () => {
    const wl = (INVEST_RISK().config as { toolWhitelist: string[] }).toolWhitelist;
    expect(wl).toContain('getStockPrice');
    for (const t of PORTFOLIO_ANALYTICS) expect(wl).toContain(t);
    expect(wl.some(t => TRADE.includes(t))).toBe(false);
    expect(wl.some(t => VALUATION.includes(t))).toBe(false);
  });

  test('invest-trade 含 read + trade (不含 valuation/backtest)', () => {
    const wl = (INVEST_TRADE().config as { toolWhitelist: string[] }).toolWhitelist;
    expect(wl).toContain('getStockPrice');
    for (const t of TRADE) expect(wl).toContain(t);
    expect(wl.some(t => VALUATION.includes(t))).toBe(false);
  });

  test('invest-review 含 read + portfolio-analytics (不含 trade)', () => {
    const wl = (INVEST_REVIEW().config as { toolWhitelist: string[] }).toolWhitelist;
    expect(wl).toContain('getStockPrice');
    for (const t of PORTFOLIO_ANALYTICS) expect(wl).toContain(t);
    expect(wl.some(t => TRADE.includes(t))).toBe(false);
  });

  // --------------------------------------------------------------------------
  // Capabilities + task types
  // --------------------------------------------------------------------------

  test('explore 是 research/analysis 能力,不含 review', () => {
    const a = INVEST_EXPLORE();
    expect(a.capabilities).toContain('research');
    expect(a.capabilities).not.toContain('review');
  });

  test('review 是 review/analysis 能力', () => {
    const a = INVEST_REVIEW();
    expect(a.capabilities).toContain('review');
    expect(a.capabilities).toContain('analysis');
  });

  test('explore taskTypes 覆盖 research 各种子任务', () => {
    const a = INVEST_EXPLORE();
    expect(a.taskTypes).toContain('research');
    expect(a.taskTypes).toContain('research:industry');
    expect(a.taskTypes).toContain('research:filings');
  });

  test('trade taskTypes 显式 buy/sell/rebalance/stop', () => {
    const a = INVEST_TRADE();
    expect(a.taskTypes).toContain('trade');
    expect(a.taskTypes).toContain('trade:buy');
    expect(a.taskTypes).toContain('trade:sell');
    expect(a.taskTypes).toContain('trade:rebalance');
    expect(a.taskTypes).toContain('trade:stop');
  });

  // --------------------------------------------------------------------------
  // 系统 prompt 边界声明
  // --------------------------------------------------------------------------

  test('explore systemPrompt 显式禁止 trade', () => {
    const a = INVEST_EXPLORE();
    expect(a.systemPrompt).toMatch(/不调用|不写|禁止|read/i);
  });

  test('plan systemPrompt 显式禁止 trade', () => {
    const a = INVEST_PLAN();
    expect(a.systemPrompt).toMatch(/不.*trade|禁止.*trade/i);
  });

  test('risk systemPrompt 显式不出具买卖建议', () => {
    const a = INVEST_RISK();
    expect(a.systemPrompt).toMatch(/不出具买卖|不主动建议/i);
  });

  test('trade systemPrompt 显式需要主 agent 授权 + risk 评估', () => {
    const a = INVEST_TRADE();
    expect(a.systemPrompt).toMatch(/授权|risk-invest|主 agent/i);
  });

  // --------------------------------------------------------------------------
  // 注册 / 注销
  // --------------------------------------------------------------------------

  test('unregisterInvestmentSubagents 注销全部 5 个', () => {
    // beforeEach 已注销,显式重置到已注册状态
    registerInvestmentSubagents();
    expect(areInvestmentSubagentsRegistered()).toBe(true);
    unregisterInvestmentSubagents();
    expect(areInvestmentSubagentsRegistered()).toBe(false);
    const registry = getAgentRegistry();
    for (const a of INVESTMENT_SUBAGENTS) {
      expect(registry.get(a.id)).toBeUndefined();
    }
  });

  test('注销后可重新注册 (idempotent)', () => {
    unregisterInvestmentSubagents();
    // 直接 import 已注册,调用 unregister + import 的副作用不重复执行
    // 用 registerInvestmentSubagents() 显式注册
    registerInvestmentSubagents();
    expect(areInvestmentSubagentsRegistered()).toBe(true);
    registerInvestmentSubagents(); // 二次调用应 no-op
    expect(areInvestmentSubagentsRegistered()).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 便捷查询
  // --------------------------------------------------------------------------

  test('getInvestmentSubagent(id) 返回正确 agent', () => {
    expect(getInvestmentSubagent('invest-explore')?.id).toBe('invest-explore');
    expect(getInvestmentSubagent('invest-trade')?.id).toBe('invest-trade');
    expect(getInvestmentSubagent('nonexistent')).toBeUndefined();
  });

  test('getInvestmentSubagents() 返回 readonly 5 个', () => {
    const list = getInvestmentSubagents();
    expect(list.length).toBe(5);
    expect(Object.isFrozen(list)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 内部 helper:从 INVESTMENT_SUBAGENTS 数组按 id 取
// ---------------------------------------------------------------------------
function INVEST_EXPLORE() { return INVESTMENT_SUBAGENTS.find(a => a.id === 'invest-explore')!; }
function INVEST_PLAN() { return INVESTMENT_SUBAGENTS.find(a => a.id === 'invest-plan')!; }
function INVEST_RISK() { return INVESTMENT_SUBAGENTS.find(a => a.id === 'invest-risk')!; }
function INVEST_TRADE() { return INVESTMENT_SUBAGENTS.find(a => a.id === 'invest-trade')!; }
function INVEST_REVIEW() { return INVESTMENT_SUBAGENTS.find(a => a.id === 'invest-review')!; }

// ---------------------------------------------------------------------------
// 独立 describe: 验证 import 时的 side effect (必须在没有 beforeEach 注销的
// 环境中跑, 因为所有测试在 import 时就已注册了, 不能被 reset)
// ---------------------------------------------------------------------------
describe('v7-7 investment-subagents import side-effect', () => {
  test('import 时自动注册到 AgentRegistry (5 个全部可见)', () => {
    // 上面顶层 import 已触发模块级 registerInvestmentSubagents() 调用
    expect(areInvestmentSubagentsRegistered()).toBe(true);
    const registry = getAgentRegistry();
    for (const a of INVESTMENT_SUBAGENTS) {
      const got = registry.get(a.id);
      expect(got).toBeDefined();
      expect(got!.id).toBe(a.id);
      expect(got!.isBuiltIn).toBe(true);
    }
  });
});
