/**
 * Backtest Engine Tests
 */

import { describe, it, expect } from 'bun:test';
import { BacktestEngine, DailyBar, EvaluationConfig } from './backtest-engine.js';

describe('BacktestEngine - Direction Inference', () => {
  it('infers bullish direction for buy signals', () => {
    expect(BacktestEngine.inferDirectionExpected('买入')).toBe('up');
    expect(BacktestEngine.inferDirectionExpected('strong buy')).toBe('up');
    expect(BacktestEngine.inferDirectionExpected('建仓')).toBe('up');
    expect(BacktestEngine.inferDirectionExpected('加仓')).toBe('up');
  });

  it('infers bearish direction for sell signals', () => {
    expect(BacktestEngine.inferDirectionExpected('卖出')).toBe('down');
    expect(BacktestEngine.inferDirectionExpected('清仓')).toBe('down');
    expect(BacktestEngine.inferDirectionExpected('减仓')).toBe('down');
  });

  it('infers flat for wait signals', () => {
    expect(BacktestEngine.inferDirectionExpected('观望')).toBe('flat');
    expect(BacktestEngine.inferDirectionExpected('等待')).toBe('flat');
  });

  it('infers not_down for hold signals', () => {
    expect(BacktestEngine.inferDirectionExpected('持有')).toBe('not_down');
    expect(BacktestEngine.inferDirectionExpected('hold')).toBe('not_down');
  });

  it('handles negation correctly', () => {
    expect(BacktestEngine.inferDirectionExpected('不要买入')).toBe('flat');
    expect(BacktestEngine.inferDirectionExpected('不建议卖出')).toBe('flat');
  });
});

describe('BacktestEngine - Position Recommendation', () => {
  it('recommends long for bullish signals', () => {
    expect(BacktestEngine.inferPositionRecommendation('买入')).toBe('long');
    expect(BacktestEngine.inferPositionRecommendation('持有')).toBe('long');
    expect(BacktestEngine.inferPositionRecommendation('增持')).toBe('long');
  });

  it('recommends cash for bearish signals', () => {
    expect(BacktestEngine.inferPositionRecommendation('卖出')).toBe('cash');
    expect(BacktestEngine.inferPositionRecommendation('清仓')).toBe('cash');
  });

  it('recommends cash for wait signals', () => {
    expect(BacktestEngine.inferPositionRecommendation('观望')).toBe('cash');
    expect(BacktestEngine.inferPositionRecommendation('等待')).toBe('cash');
  });
});

describe('BacktestEngine - Single Trade Evaluation', () => {
  const config: EvaluationConfig = {
    evalWindowDays: 5,
    neutralBandPct: 2.0,
    engineVersion: 'v1',
  };

  it('evaluates winning trade correctly', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', close: 102 },
      { date: '2024-01-03', close: 104 },
      { date: '2024-01-04', close: 106 },
      { date: '2024-01-05', close: 108 },
      { date: '2024-01-08', close: 110 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      config,
    });

    expect(result.evalStatus).toBe('completed');
    expect(result.outcome).toBe('win');
    expect(result.directionCorrect).toBe(true);
    expect(result.stockReturnPct).toBe(10); // 10% return
  });

  it('evaluates losing trade correctly', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', close: 98 },
      { date: '2024-01-03', close: 96 },
      { date: '2024-01-04', close: 94 },
      { date: '2024-01-05', close: 92 },
      { date: '2024-01-08', close: 90 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      config,
    });

    expect(result.evalStatus).toBe('completed');
    expect(result.outcome).toBe('loss');
    expect(result.directionCorrect).toBe(false);
    expect(result.stockReturnPct).toBe(-10); // -10% return
  });

  it('evaluates neutral trade correctly', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', close: 100.5 },
      { date: '2024-01-03', close: 100.8 },
      { date: '2024-01-04', close: 101 },
      { date: '2024-01-05', close: 100.9 },
      { date: '2024-01-08', close: 101.2 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      config,
    });

    expect(result.evalStatus).toBe('completed');
    expect(result.outcome).toBe('neutral');
    expect(result.directionCorrect).toBeUndefined();
  });

  it('handles stop-loss trigger', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', high: 102, low: 95, close: 98 },
      { date: '2024-01-03', high: 100, low: 94, close: 95 },
      { date: '2024-01-04', high: 97, low: 94, close: 96 },
      { date: '2024-01-05', high: 98, low: 95, close: 97 },
      { date: '2024-01-08', high: 99, low: 95, close: 98 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      stopLoss: 95,
      takeProfit: 110,
      config,
    });

    expect(result.hitStopLoss).toBe(true);
    expect(result.firstHit).toBe('stop_loss');
    expect(result.simulatedExitPrice).toBe(95);
  });

  it('handles take-profit trigger', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', high: 105, low: 98, close: 105 },
      { date: '2024-01-03', high: 108, low: 103, close: 107 },
      { date: '2024-01-04', high: 110, low: 105, close: 109 },
      { date: '2024-01-05', high: 111, low: 107, close: 110 },
      { date: '2024-01-08', high: 112, low: 108, close: 111 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      stopLoss: 95,
      takeProfit: 108,
      config,
    });

    expect(result.hitTakeProfit).toBe(true);
    expect(result.firstHit).toBe('take_profit');
    expect(result.simulatedExitPrice).toBe(108);
  });

  it('returns insufficient_data for short forward bars', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', close: 102 },
      { date: '2024-01-03', close: 104 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '买入',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      config,
    });

    expect(result.evalStatus).toBe('insufficient_data');
  });

  it('handles cash position correctly', () => {
    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', close: 102 },
      { date: '2024-01-03', close: 104 },
      { date: '2024-01-04', close: 106 },
      { date: '2024-01-05', close: 108 },
      { date: '2024-01-08', close: 110 },
    ];

    const result = BacktestEngine.evaluateSingle({
      operationAdvice: '卖出',
      analysisDate: '2024-01-01',
      startPrice: 100,
      forwardBars,
      config,
    });

    expect(result.positionRecommendation).toBe('cash');
    expect(result.simulatedReturnPct).toBe(0);
  });
});

describe('BacktestEngine - Summary Computation', () => {
  const config: EvaluationConfig = {
    evalWindowDays: 5,
    neutralBandPct: 2.0,
    engineVersion: 'v1',
  };

  it('computes summary correctly', () => {
    // With neutralBandPct=2:
    // - 买入赢: 10% return > 2% = win
    // - 买入输: -10% return < -2% = loss
    // - 观望输: -6% return > 2% but flat expects small movement, so loss
    const results = [
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 105 },
          { date: '2024-01-03', close: 106 },
          { date: '2024-01-04', close: 107 },
          { date: '2024-01-05', close: 108 },
          { date: '2024-01-08', close: 110 },
        ],
        config,
      }),
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 95 },
          { date: '2024-01-03', close: 94 },
          { date: '2024-01-04', close: 93 },
          { date: '2024-01-05', close: 92 },
          { date: '2024-01-08', close: 91 },
        ],
        config,
      }),
      BacktestEngine.evaluateSingle({
        operationAdvice: '观望',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 99 },
          { date: '2024-01-03', close: 98 },
          { date: '2024-01-04', close: 97 },
          { date: '2024-01-05', close: 96 },
          { date: '2024-01-08', close: 95 },
        ],
        config,
      }),
    ];

    const summary = BacktestEngine.computeSummary(results, 'batch', undefined, 5, 'v1');

    expect(summary.totalEvaluations).toBe(3);
    expect(summary.completedCount).toBe(3);
    expect(summary.winCount).toBe(1); // only the first 买入赢
    expect(summary.lossCount).toBe(2); // 买入输 + 观望输(flat expects small movement)
    expect(summary.neutralCount).toBe(0);
    expect(summary.longCount).toBe(2);
    expect(summary.cashCount).toBe(1);
  });

  it('calculates win rate correctly', () => {
    const results = [
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 105 },
          { date: '2024-01-03', close: 106 },
          { date: '2024-01-04', close: 107 },
          { date: '2024-01-05', close: 108 },
          { date: '2024-01-08', close: 110 },
        ],
        config,
      }),
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 105 },
          { date: '2024-01-03', close: 106 },
          { date: '2024-01-04', close: 107 },
          { date: '2024-01-05', close: 108 },
          { date: '2024-01-08', close: 110 },
        ],
        config,
      }),
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 95 },
          { date: '2024-01-03', close: 94 },
          { date: '2024-01-04', close: 93 },
          { date: '2024-01-05', close: 92 },
          { date: '2024-01-08', close: 91 },
        ],
        config,
      }),
    ];

    const summary = BacktestEngine.computeSummary(results, 'batch', undefined, 5, 'v1');

    expect(summary.winRatePct).toBe(66.67); // 2 wins, 1 loss = 66.67%
  });

  it('computes direction accuracy', () => {
    const results = [
      BacktestEngine.evaluateSingle({
        operationAdvice: '买入',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 105 },
          { date: '2024-01-03', close: 106 },
          { date: '2024-01-04', close: 107 },
          { date: '2024-01-05', close: 108 },
          { date: '2024-01-08', close: 110 },
        ],
        config,
      }),
      BacktestEngine.evaluateSingle({
        operationAdvice: '卖出',
        analysisDate: '2024-01-01',
        startPrice: 100,
        forwardBars: [
          { date: '2024-01-02', close: 95 },
          { date: '2024-01-03', close: 94 },
          { date: '2024-01-04', close: 93 },
          { date: '2024-01-05', close: 92 },
          { date: '2024-01-08', close: 91 },
        ],
        config,
      }),
    ];

    const summary = BacktestEngine.computeSummary(results, 'batch', undefined, 5, 'v1');

    expect(summary.directionAccuracyPct).toBe(100); // Both correct
  });
});

describe('BacktestEngine - Simulate Trade', () => {
  const config: EvaluationConfig = {
    evalWindowDays: 5,
    neutralBandPct: 2.0,
    engineVersion: 'v1',
  };

  it('simulates trade with all parameters', () => {
    const trade = {
      symbol: 'AAPL',
      analysisDate: '2024-01-01',
      operationAdvice: '买入，目标价105，止损98',
      entryPrice: 100,
      stopLoss: 98,
      takeProfit: 105,
      quantity: 100,
    };

    const forwardBars: DailyBar[] = [
      { date: '2024-01-02', high: 106, low: 99, close: 105 },
      { date: '2024-01-03', close: 106 },
      { date: '2024-01-04', close: 107 },
      { date: '2024-01-05', close: 108 },
      { date: '2024-01-08', close: 110 },
    ];

    const result = BacktestEngine.simulateTrade(trade, forwardBars, config);

    expect(result.evalStatus).toBe('completed');
    expect(result.hitTakeProfit).toBe(true);
    expect(result.firstHit).toBe('take_profit');
    expect(result.simulatedReturnPct).toBe(5); // 5% profit
  });
});
