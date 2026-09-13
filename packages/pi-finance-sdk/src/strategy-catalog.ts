export type NativeStrategyRiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type NativeStrategyTimeHorizon = 'short' | 'medium' | 'long';

export interface NativeInvestmentStrategy {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly suitableFor: NativeStrategyRiskTolerance;
  readonly timeHorizon: NativeStrategyTimeHorizon;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly performance?: Readonly<{ readonly sharpe?: number; readonly maxDrawdown?: number; readonly winRate?: number }>;
}

export interface NativeStrategyQuery {
  readonly riskTolerance?: NativeStrategyRiskTolerance;
  readonly timeHorizon?: NativeStrategyTimeHorizon;
}

const STRATEGIES: readonly NativeInvestmentStrategy[] = [
  { id: 'value-investing', name: 'Value Investing', description: 'Buy undervalued companies with strong fundamentals at a discount to intrinsic value', suitableFor: 'conservative', timeHorizon: 'long', parameters: { minDiscount: 0.2, minYears: 5, metrics: ['P/E', 'P/B', 'P/S', 'EV/EBITDA'] }, performance: { sharpe: 0.8, maxDrawdown: 0.3 } },
  { id: 'growth-investing', name: 'Growth Investing', description: 'Invest in high-growth companies with expanding revenues and market opportunity', suitableFor: 'aggressive', timeHorizon: 'medium', parameters: { minRevenueGrowth: 0.2, minMarketCap: 1_000_000_000, targetMarket: 'large' }, performance: { sharpe: 0.7, maxDrawdown: 0.5 } },
  { id: 'dividend-growth', name: 'Dividend Growth', description: 'Focus on companies with sustainable, growing dividend payments', suitableFor: 'moderate', timeHorizon: 'long', parameters: { minDividendYield: 0.02, minDividendGrowth: 0.05, minYearsOfGrowth: 5 }, performance: { sharpe: 0.9, maxDrawdown: 0.25 } },
  { id: 'momentum', name: 'Momentum', description: 'Buy assets with recent strong performance, expecting continued outperformance', suitableFor: 'aggressive', timeHorizon: 'short', parameters: { lookbackPeriod: 90, rebalanceFrequency: 'monthly' }, performance: { sharpe: 0.6, maxDrawdown: 0.4 } },
  { id: 'index-investing', name: 'Index Investing', description: 'Passive investment in broad market indices for diversified exposure', suitableFor: 'conservative', timeHorizon: 'long', parameters: { index: 'S&P 500', expenseRatio: 0.0003, reinvestDividends: true }, performance: { sharpe: 0.75, maxDrawdown: 0.35 } },
];

function cloneStrategy(strategy: NativeInvestmentStrategy): NativeInvestmentStrategy {
  return { ...strategy, parameters: { ...strategy.parameters }, ...(strategy.performance ? { performance: { ...strategy.performance } } : {}) };
}

export function listNativeInvestmentStrategies(query: NativeStrategyQuery = {}): readonly NativeInvestmentStrategy[] {
  return STRATEGIES
    .filter((strategy) => !query.riskTolerance || strategy.suitableFor === query.riskTolerance)
    .filter((strategy) => !query.timeHorizon || strategy.timeHorizon === query.timeHorizon)
    .map(cloneStrategy);
}
