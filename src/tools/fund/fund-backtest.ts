/**
 * Fund Backtest Engine - 基金回测系统
 * 支持DCA定投、一次性投资、条件触发交易回测
 */

import { getFundBasic, getFundEstimatedValue } from './fund-api';

// ============================================================================
// Types
// ============================================================================

export interface BacktestConfig {
  fundCode: string;
  startDate: string;
  endDate: string;
  initialAmount: number;
  strategy: 'dca' | 'lump_sum' | 'threshold';
  
  // DCA参数
  dca?: {
    frequency: 'weekly' | 'monthly';
    amount: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  
  // 条件触发参数
  threshold?: {
    buyBelowNav: number;
    sellAboveNav: number;
    buyPercent: number;
    sellPercent: number;
  };
  
  // 基准对比
  benchmark?: {
    code: string;
    enable: boolean;
  };
}

export interface BacktestResult {
  config: BacktestConfig;
  fundName: string;
  
  // 基础统计
  totalInvested: number;
  finalValue: number;
  totalReturn: number;
  totalReturnPercent: number;
  
  // 交易统计
  totalTrades: number;
  buyTrades: number;
  sellTrades: number;
  averageCost: number;
  
  // 风险指标
  maxDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  
  // 时间序列
  timeline: BacktestSnapshot[];
  
  // 对比基准
  benchmarkReturn?: number;
  alpha?: number;
}

export interface BacktestSnapshot {
  date: string;
  nav: number;
  shares: number;
  value: number;
  invested: number;
  return: number;
  returnPercent: number;
}

// ============================================================================
// Fee Calculation
// ============================================================================

function calculateFee(amount: number, fundType?: string): number {
  let rate = 0.001;
  if (fundType === '货币型') rate = 0;
  else if (fundType === '债券型') rate = 0.0008;
  return Math.round(amount * rate * 100) / 100;
}

// ============================================================================
// Historical Data
// ============================================================================

interface FundHistoryPoint {
  date: string;
  nav: number;
}

/**
 * 模拟历史净值数据 (实际使用时调用真实API)
 */
function generateSimulatedHistory(
  startDate: string,
  endDate: string,
  startNav: number,
  volatility: number = 0.02
): FundHistoryPoint[] {
  const points: FundHistoryPoint[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  let currentNav = startNav;
  const current = new Date(start);
  
  while (current <= end) {
    // 模拟波动
    const change = (Math.random() - 0.5) * 2 * volatility;
    currentNav = currentNav * (1 + change);
    
    points.push({
      date: current.toISOString().split('T')[0],
      nav: Math.round(currentNav * 10000) / 10000,
    });
    
    // 下一个工作日
    current.setDate(current.getDate() + 1);
  }
  
  return points;
}

/**
 * 获取历史净值 (简化版)
 */
export async function getFundHistory(
  fundCode: string,
  startDate: string,
  endDate: string
): Promise<FundHistoryPoint[]> {
  // 获取当前净值作为基准
  const fund = await getFundBasic(fundCode);
  const estimated = await getFundEstimatedValue(fundCode);
  
  const currentNav = estimated?.estimatedUnit || fund?.netUnitValue || 1.0;
  
  // 生成模拟历史数据 (基于当前净值往前推)
  // 实际生产环境应调用天天基金历史净值API
  return generateSimulatedHistory(startDate, endDate, currentNav);
}

// ============================================================================
// Backtest Engine
// ============================================================================

export class BacktestEngine {
  private history: FundHistoryPoint[] = [];
  private fundType?: string;
  
  async loadFundData(fundCode: string, startDate: string, endDate: string): Promise<void> {
    const fund = await getFundBasic(fundCode);
    this.fundType = fund?.type;
    this.history = await getFundHistory(fundCode, startDate, endDate);
  }
  
  /**
   * 执行DCA定投回测
   */
  async runDCA(config: BacktestConfig): Promise<BacktestResult> {
    await this.loadFundData(config.fundCode, config.startDate, config.endDate);
    
    const snapshots: BacktestSnapshot[] = [];
    let shares = 0;
    let totalInvested = config.initialAmount;
    let buyCount = 0;
    
    const frequency = config.dca?.frequency || 'monthly';
    const amount = config.dca?.amount || 1000;
    
    // 初始买入
    const firstPoint = this.history[0];
    if (firstPoint) {
      const fee = calculateFee(config.initialAmount, this.fundType);
      const actualAmount = config.initialAmount - fee;
      shares += actualAmount / firstPoint.nav;
      buyCount++;
      
      snapshots.push(this.createSnapshot(firstPoint, shares, totalInvested));
    }
    
    // 定投循环
    for (const point of this.history) {
      const date = new Date(point.date);
      let shouldInvest = false;
      
      if (frequency === 'monthly' && config.dca?.dayOfMonth) {
        shouldInvest = date.getDate() === config.dca.dayOfMonth;
      } else if (frequency === 'weekly' && config.dca?.dayOfWeek) {
        shouldInvest = date.getDay() === config.dca.dayOfWeek;
      } else if (frequency === 'monthly') {
        shouldInvest = date.getDate() === 1;
      }
      
      if (shouldInvest && date > new Date(this.history[0].date)) {
        const fee = calculateFee(amount, this.fundType);
        const actualAmount = amount - fee;
        shares += actualAmount / point.nav;
        totalInvested += amount;
        buyCount++;
        
        snapshots.push(this.createSnapshot(point, shares, totalInvested));
      }
    }
    
    // 最终快照
    const finalPoint = this.history[this.history.length - 1];
    if (finalPoint) {
      snapshots.push(this.createSnapshot(finalPoint, shares, totalInvested));
    }
    
    return this.calculateResults(config, snapshots, buyCount, 0);
  }
  
  /**
   * 执行一次性投资回测
   */
  async runLumpSum(config: BacktestConfig): Promise<BacktestResult> {
    await this.loadFundData(config.fundCode, config.startDate, config.endDate);
    
    const snapshots: BacktestSnapshot[] = [];
    let shares = 0;
    let totalInvested = config.initialAmount;
    
    // 一次性买入
    const firstPoint = this.history[0];
    if (firstPoint) {
      const fee = calculateFee(config.initialAmount, this.fundType);
      const actualAmount = config.initialAmount - fee;
      shares = actualAmount / firstPoint.nav;
      
      // 记录每个时间点的状态
      for (const point of this.history) {
        snapshots.push(this.createSnapshot(point, shares, totalInvested));
      }
    }
    
    return this.calculateResults(config, snapshots, 1, 0);
  }
  
  /**
   * 执行条件触发回测
   */
  async runThreshold(config: BacktestConfig): Promise<BacktestResult> {
    await this.loadFundData(config.fundCode, config.startDate, config.endDate);
    
    const snapshots: BacktestSnapshot[] = [];
    let shares = 0;
    let totalInvested = config.initialAmount;
    let buyCount = 0;
    let sellCount = 0;
    
    const threshold = config.threshold!;
    
    // 初始建仓
    const firstPoint = this.history[0];
    if (firstPoint) {
      const initAmount = config.initialAmount * 0.5;
      const fee = calculateFee(initAmount, this.fundType);
      shares += (initAmount - fee) / firstPoint.nav;
      totalInvested += initAmount;
      buyCount++;
      
      snapshots.push(this.createSnapshot(firstPoint, shares, totalInvested));
    }
    
    // 计算移动平均线
    const ma20: number[] = [];
    for (let i = 19; i < this.history.length; i++) {
      const avg = this.history.slice(i - 19, i + 1).reduce((sum, p) => sum + p.nav, 0) / 20;
      ma20.push(avg);
    }
    
    // 条件触发交易
    for (let i = 20; i < this.history.length; i++) {
      const point = this.history[i];
      const currentNav = point.nav;
      const ma = ma20[i - 20];
      
      // 买入条件: 净值低于均线且低于阈值
      if (currentNav < ma && currentNav < threshold.buyBelowNav) {
        const buyAmount = config.initialAmount * threshold.buyPercent;
        const fee = calculateFee(buyAmount, this.fundType);
        shares += (buyAmount - fee) / currentNav;
        totalInvested += buyAmount;
        buyCount++;
      }
      
      // 卖出条件: 净值高于均线且高于阈值
      if (currentNav > ma && currentNav > threshold.sellAboveNav) {
        const sellShares = shares * threshold.sellPercent;
        if (sellShares > 0) {
          shares -= sellShares;
          sellCount++;
        }
      }
      
      snapshots.push(this.createSnapshot(point, shares, totalInvested));
    }
    
    return this.calculateResults(config, snapshots, buyCount, sellCount);
  }
  
  private createSnapshot(point: FundHistoryPoint, shares: number, invested: number): BacktestSnapshot {
    const value = shares * point.nav;
    const return_ = value - invested;
    const returnPercent = invested > 0 ? (return_ / invested) * 100 : 0;
    
    return {
      date: point.date,
      nav: point.nav,
      shares: Math.round(shares * 10000) / 10000,
      value: Math.round(value * 100) / 100,
      invested: Math.round(invested * 100) / 100,
      return: Math.round(return_ * 100) / 100,
      returnPercent: Math.round(returnPercent * 100) / 100,
    };
  }
  
  private calculateResults(
    config: BacktestConfig,
    snapshots: BacktestSnapshot[],
    buyCount: number,
    sellCount: number
  ): BacktestResult {
    const finalSnapshot = snapshots[snapshots.length - 1];
    const finalValue = finalSnapshot?.value || 0;
    const totalInvested = finalSnapshot?.invested || config.initialAmount;
    const totalReturn = finalValue - totalInvested;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;
    
    // 计算最大回撤
    let maxValue = 0;
    let maxDrawdown = 0;
    for (const snap of snapshots) {
      if (snap.value > maxValue) maxValue = snap.value;
      const drawdown = maxValue > 0 ? ((maxValue - snap.value) / maxValue) * 100 : 0;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }
    
    // 计算波动率
    const returns: number[] = [];
    for (let i = 1; i < snapshots.length; i++) {
      if (snapshots[i - 1].value > 0) {
        returns.push((snapshots[i].value - snapshots[i - 1].value) / snapshots[i - 1].value);
      }
    }
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance) * 100;
    
    // 计算夏普比率 (假设无风险利率3%)
    const sharpeRatio = volatility > 0 ? ((avgReturn * 252 - 0.03) / (volatility * Math.sqrt(252))) : 0;
    
    // 平均成本
    const totalShares = finalSnapshot?.shares || 0;
    const averageCost = totalShares > 0 ? totalInvested / totalShares : 0;
    
    const fund = this.fundType;
    
    return {
      config,
      fundName: config.fundCode,
      totalInvested,
      finalValue,
      totalReturn,
      totalReturnPercent,
      totalTrades: buyCount + sellCount,
      buyTrades: buyCount,
      sellTrades: sellCount,
      averageCost,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      volatility: Math.round(volatility * 100) / 100,
      sharpeRatio: Math.round(sharpeRatio * 100) / 100,
      timeline: snapshots,
    };
  }
}

// ============================================================================
// Quick Backtest Functions
// ============================================================================

const engine = new BacktestEngine();

/**
 * 快速DCA回测
 */
export async function backtestDCA(
  fundCode: string,
  months: number = 12,
  monthlyAmount: number = 1000
): Promise<BacktestResult> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  return engine.runDCA({
    fundCode,
    startDate,
    endDate,
    initialAmount: monthlyAmount * 2, // 初始资金
    strategy: 'dca',
    dca: {
      frequency: 'monthly',
      amount: monthlyAmount,
      dayOfMonth: 1,
    },
  });
}

/**
 * 一次性投资回测
 */
export async function backtestLumpSum(
  fundCode: string,
  months: number = 12,
  amount: number = 10000
): Promise<BacktestResult> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  return engine.runLumpSum({
    fundCode,
    startDate,
    endDate,
    initialAmount: amount,
    strategy: 'lump_sum',
  });
}

/**
 * 条件触发回测
 */
export async function backtestThreshold(
  fundCode: string,
  months: number = 12,
  buyBelow: number = 0.95,
  sellAbove: number = 1.05
): Promise<BacktestResult> {
  const endDate = new Date().toISOString().split('T')[0];
  const startDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  return engine.runThreshold({
    fundCode,
    startDate,
    endDate,
    initialAmount: 10000,
    strategy: 'threshold',
    threshold: {
      buyBelowNav: buyBelow,
      sellAboveNav: sellAbove,
      buyPercent: 0.2,
      sellPercent: 0.1,
    },
  });
}

/**
 * 对比回测
 */
export async function compareBacktests(
  configs: BacktestConfig[]
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];
  
  for (const config of configs) {
    let result: BacktestResult;
    
    switch (config.strategy) {
      case 'dca':
        result = await engine.runDCA(config);
        break;
      case 'lump_sum':
        result = await engine.runLumpSum(config);
        break;
      case 'threshold':
        result = await engine.runThreshold(config);
        break;
      default:
        result = await engine.runDCA(config);
    }
    
    results.push(result);
  }
  
  return results;
}

/**
 * 生成回测报告
 */
export function generateBacktestReport(result: BacktestResult): string {
  const { config, fundName, totalInvested, finalValue, totalReturn, totalReturnPercent,
          totalTrades, buyTrades, sellTrades, averageCost, maxDrawdown, volatility, sharpeRatio } = result;
  
  const strategyDesc = {
    'dca': 'DCA定投',
    'lump_sum': '一次性投资',
    'threshold': '条件触发',
  };
  
  let report = `# 📊 回测报告: ${fundName}

## 策略信息
| 项目 | 内容 |
|------|------|
| 基金代码 | ${config.fundCode} |
| 策略类型 | ${strategyDesc[config.strategy]} |
| 回测期间 | ${config.startDate} ~ ${config.endDate} |
| 初始金额 | ¥${config.initialAmount.toLocaleString()}`;

  if (config.dca) {
    report += `\n| 定投频率 | ${config.dca.frequency === 'monthly' ? '每月' : '每周'} |
| 每次金额 | ¥${config.dca.amount.toLocaleString()}`;
  }
  
  report += `

## 📈 收益表现
| 指标 | 数值 |
|------|------|
| 总投入 | ¥${totalInvested.toLocaleString()} |
| 最终市值 | ¥${finalValue.toLocaleString()} |
| 总收益 | ¥${totalReturn.toLocaleString()} |
| 总收益率 | ${totalReturnPercent > 0 ? '+' : ''}${totalReturnPercent.toFixed(2)}% |

## 📋 交易统计
| 指标 | 数值 |
|------|------|
| 总交易次数 | ${totalTrades} |
| 买入次数 | ${buyTrades} |
| 卖出次数 | ${sellTrades} |
| 平均成本 | ¥${averageCost.toFixed(4)} |

## ⚠️ 风险指标
| 指标 | 数值 | 评价 |
|------|------|------|
| 最大回撤 | ${maxDrawdown.toFixed(2)}% | ${maxDrawdown < 10 ? '✅ 低' : maxDrawdown < 20 ? '⚠️ 中' : '❌ 高'} |
| 波动率 | ${volatility.toFixed(2)}% | ${volatility < 10 ? '✅ 低' : volatility < 20 ? '⚠️ 中' : '❌ 高'} |
| 夏普比率 | ${sharpeRatio.toFixed(2)} | ${sharpeRatio > 1 ? '✅ 优秀' : sharpeRatio > 0.5 ? '⚠️ 一般' : '❌ 较差'} |

> 仅供参考，不构成投资建议
> 过去业绩不代表未来表现`;

  return report;
}
