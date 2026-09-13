export type FundBacktestStrategy = 'dca' | 'lump_sum' | 'threshold';
export type FundType = '货币型' | '债券型' | string;

export interface FundNavPoint {
  readonly date: string;
  readonly nav: number;
}

export interface FundBacktestConfig {
  readonly fundCode: string;
  readonly fundName?: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly initialAmount: number;
  readonly strategy: FundBacktestStrategy;
  readonly fundType?: FundType;
  readonly dca?: { readonly frequency: 'weekly' | 'monthly'; readonly amount: number; readonly dayOfWeek?: number; readonly dayOfMonth?: number };
  readonly threshold?: { readonly buyBelowNav: number; readonly sellAboveNav: number; readonly buyPercent: number; readonly sellPercent: number };
}

export interface FundBacktestSnapshot {
  readonly date: string;
  readonly nav: number;
  readonly shares: number;
  readonly value: number;
  readonly invested: number;
  readonly return: number;
  readonly returnPercent: number;
}

export interface FundBacktestResult {
  readonly config: FundBacktestConfig;
  readonly fundName: string;
  readonly totalInvested: number;
  readonly finalValue: number;
  readonly totalReturn: number;
  readonly totalReturnPercent: number;
  readonly totalTrades: number;
  readonly buyTrades: number;
  readonly sellTrades: number;
  readonly averageCost: number;
  readonly maxDrawdown: number;
  readonly volatility: number;
  readonly sharpeRatio: number;
  readonly timeline: readonly FundBacktestSnapshot[];
}

function round(value: number, decimals = 2): number {
  return Number(value.toFixed(decimals));
}

export function fundSubscriptionFee(amount: number, fundType?: FundType): number {
  if (!Number.isFinite(amount) || amount < 0) throw new Error('amount must be a finite non-negative number');
  const rate = fundType === '货币型' ? 0 : fundType === '债券型' ? 0.0008 : 0.001;
  return round(amount * rate);
}

function validateConfig(config: FundBacktestConfig): void {
  if (!config.fundCode.trim()) throw new Error('fundCode must not be empty');
  if (!config.startDate || !config.endDate || config.startDate > config.endDate) throw new Error('invalid backtest date range');
  if (!Number.isFinite(config.initialAmount) || config.initialAmount <= 0) throw new Error('initialAmount must be positive');
  if (config.strategy === 'dca' && (!config.dca || !Number.isFinite(config.dca.amount) || config.dca.amount <= 0)) throw new Error('dca amount must be positive');
  if (config.strategy === 'threshold' && !config.threshold) throw new Error('threshold config is required');
  if (config.threshold && (config.threshold.buyPercent < 0 || config.threshold.sellPercent < 0 || config.threshold.buyPercent > 1 || config.threshold.sellPercent > 1)) throw new Error('threshold percentages must be between 0 and 1');
}

function normalizeHistory(history: readonly FundNavPoint[], startDate: string, endDate: string): FundNavPoint[] {
  const normalized = history
    .filter((point) => point.date.length >= 10 && point.date.slice(0, 10) >= startDate && point.date.slice(0, 10) <= endDate && Number.isFinite(point.nav) && point.nav > 0)
    .map((point) => ({ date: point.date.slice(0, 10), nav: point.nav }))
    .sort((left, right) => left.date.localeCompare(right.date));
  if (normalized.length < 2) throw new Error('at least two valid historical NAV points are required');
  return normalized;
}

function snapshot(point: FundNavPoint, shares: number, invested: number): FundBacktestSnapshot {
  const value = shares * point.nav;
  const gain = value - invested;
  return { date: point.date, nav: point.nav, shares: round(shares, 4), value: round(value), invested: round(invested), return: round(gain), returnPercent: invested > 0 ? round((gain / invested) * 100) : 0 };
}

function calculateResults(config: FundBacktestConfig, snapshots: readonly FundBacktestSnapshot[], buyTrades: number, sellTrades: number): FundBacktestResult {
  const final = snapshots.at(-1);
  const totalInvested = final?.invested ?? config.initialAmount;
  const finalValue = final?.value ?? 0;
  const totalReturn = finalValue - totalInvested;
  let peak = 0;
  let maxDrawdown = 0;
  const returns: number[] = [];
  for (let index = 0; index < snapshots.length; index += 1) {
    const current = snapshots[index]!;
    if (current.value > peak) peak = current.value;
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, ((peak - current.value) / peak) * 100);
    const previous = snapshots[index - 1];
    if (previous?.value && previous.value > 0) returns.push((current.value - previous.value) / previous.value);
  }
  const averageReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length ? returns.reduce((sum, value) => sum + (value - averageReturn) ** 2, 0) / returns.length : 0;
  const volatilityRaw = Math.sqrt(variance) * 100;
  const sharpe = volatilityRaw > 0 ? (averageReturn * 252 - 0.03) / (volatilityRaw * Math.sqrt(252)) : 0;
  const averageCost = final?.shares && final.shares > 0 ? totalInvested / final.shares : 0;
  return {
    config,
    fundName: config.fundName ?? config.fundCode,
    totalInvested: round(totalInvested), finalValue: round(finalValue), totalReturn: round(totalReturn),
    totalReturnPercent: totalInvested > 0 ? round((totalReturn / totalInvested) * 100) : 0,
    totalTrades: buyTrades + sellTrades, buyTrades, sellTrades, averageCost: round(averageCost, 4),
    maxDrawdown: round(maxDrawdown), volatility: round(volatilityRaw), sharpeRatio: round(sharpe),
    timeline: snapshots,
  };
}

export function runFundBacktest(config: FundBacktestConfig, inputHistory: readonly FundNavPoint[]): FundBacktestResult {
  validateConfig(config);
  const history = normalizeHistory(inputHistory, config.startDate, config.endDate);
  const fee = (amount: number) => fundSubscriptionFee(amount, config.fundType);
  let shares = 0;
  let invested = 0;
  let buyTrades = 0;
  let sellTrades = 0;
  const snapshots: FundBacktestSnapshot[] = [];
  const buy = (amount: number, point: FundNavPoint) => { const net = amount - fee(amount); shares += net / point.nav; invested += amount; buyTrades += 1; };

  if (config.strategy === 'lump_sum') {
    buy(config.initialAmount, history[0]!);
    for (const point of history) snapshots.push(snapshot(point, shares, invested));
  } else if (config.strategy === 'dca') {
    buy(config.initialAmount, history[0]!);
    snapshots.push(snapshot(history[0]!, shares, invested));
    const frequency = config.dca!.frequency;
    for (const point of history.slice(1)) {
      const date = new Date(`${point.date}T00:00:00Z`);
      const shouldBuy = frequency === 'weekly'
        ? date.getUTCDay() === (config.dca!.dayOfWeek ?? 1)
        : date.getUTCDate() === (config.dca!.dayOfMonth ?? 1);
      if (shouldBuy) buy(config.dca!.amount, point);
      snapshots.push(snapshot(point, shares, invested));
    }
  } else {
    const threshold = config.threshold!;
    buy(config.initialAmount * 0.5, history[0]!);
    snapshots.push(snapshot(history[0]!, shares, invested));
    for (let index = 1; index < history.length; index += 1) {
      const point = history[index]!;
      const window = history.slice(Math.max(0, index - 19), index + 1);
      const movingAverage = window.reduce((sum, item) => sum + item.nav, 0) / window.length;
      if (point.nav < movingAverage && point.nav < threshold.buyBelowNav) buy(config.initialAmount * threshold.buyPercent, point);
      if (point.nav > movingAverage && point.nav > threshold.sellAboveNav) { const sold = shares * threshold.sellPercent; if (sold > 0) { shares -= sold; sellTrades += 1; } }
      snapshots.push(snapshot(point, shares, invested));
    }
  }
  if (snapshots.length === 0 || snapshots.at(-1)!.date !== history.at(-1)!.date) snapshots.push(snapshot(history.at(-1)!, shares, invested));
  return calculateResults(config, snapshots, buyTrades, sellTrades);
}

export function renderFundBacktestReport(result: FundBacktestResult): string {
  const strategy = { dca: 'DCA定投', lump_sum: '一次性投资', threshold: '条件触发' }[result.config.strategy];
  return [`# 📊 回测报告: ${result.fundName}`, '', '## 策略信息', '| 项目 | 内容 |', '|------|------|', `| 基金代码 | ${result.config.fundCode} |`, `| 策略类型 | ${strategy} |`, `| 回测期间 | ${result.config.startDate} ~ ${result.config.endDate} |`, `| 初始金额 | ¥${result.config.initialAmount.toLocaleString()} |`, '', '## 📈 收益表现', '| 指标 | 数值 |', '|------|------|', `| 总投入 | ¥${result.totalInvested.toLocaleString()} |`, `| 最终市值 | ¥${result.finalValue.toLocaleString()} |`, `| 总收益 | ¥${result.totalReturn.toLocaleString()} |`, `| 总收益率 | ${result.totalReturnPercent > 0 ? '+' : ''}${result.totalReturnPercent.toFixed(2)}% |`, '', '## 📋 交易统计', '| 指标 | 数值 |', '|------|------|', `| 总交易次数 | ${result.totalTrades} |`, `| 买入次数 | ${result.buyTrades} |`, `| 卖出次数 | ${result.sellTrades} |`, `| 平均成本 | ¥${result.averageCost.toFixed(4)} |`, '', '## ⚠️ 风险指标', '| 指标 | 数值 |', '|------|------|', `| 最大回撤 | ${result.maxDrawdown.toFixed(2)}% |`, `| 波动率 | ${result.volatility.toFixed(2)}% |`, `| 夏普比率 | ${result.sharpeRatio.toFixed(2)} |`, '', '> 仅供参考，不构成投资建议', '> 过去业绩不代表未来表现'].join('\n');
}
