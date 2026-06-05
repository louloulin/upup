/**
 * Legacy keyword-based intent classifier.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/intent-detector
 *      (Requirement: Legacy Mode Fallback)
 *
 * Each intent has a list of Chinese + English keywords. A query's score for
 * an intent is the number of matching keywords, normalized to [0, 1] by the
 * max possible matches for that intent. Intents with zero matches drop out.
 */

import {
  ALL_INTENTS,
  INTENT_DESCRIPTIONS,
  type Intent,
  type IntentResult,
  type IntentScore,
} from './types.js';

interface IntentRule {
  intent: Intent;
  keywords: string[];
}

const RULES: IntentRule[] = [
  {
    intent: 'stock-selection',
    keywords: [
      '选股', '筛选', '找出', '找一下', '推荐股票', '哪些股', '哪只股',
      'screen', 'filter', 'pick', 'find stocks', 'which stocks', 'recommend',
    ],
  },
  {
    intent: 'analysis',
    keywords: [
      '分析', '看一下', '看看', '怎么样', '值得买', '值得投资', '估值', '基本面',
      '财务', '研报', '财报', '怎么看', '该买', '该卖',
      'analyze', 'analysis', 'valuation', 'fundamentals', 'look at', 'should i buy',
    ],
  },
  {
    intent: 'backtest',
    keywords: [
      '回测', '历史表现', '策略', '模拟', '过去', '按...回测',
      'backtest', 'historical', 'simulate', 'past performance',
    ],
  },
  {
    intent: 'trade',
    keywords: [
      '买入', '卖出', '下单', '建仓', '加仓', '减仓', '清仓', '止损', '止盈',
      '买', '卖', '成交', '委托',
      'buy', 'sell', 'place order', 'submit order', 'execute', 'fill', 'order',
    ],
  },
  {
    intent: 'monitor',
    keywords: [
      '盯盘', '监控', '跟踪', '设个提醒', '提醒我', '预警', '加入自选', '自选股',
      '到价', '突破提醒',
      'monitor', 'watch', 'alert', 'notify', 'add to watchlist', 'track',
    ],
  },
];

const FALLBACK_INTENT: Intent = 'analysis';

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function matchScore(query: string, keywords: string[]): number {
  let hits = 0;
  for (const kw of keywords) {
    if (query.includes(kw)) hits++;
  }
  return keywords.length === 0 ? 0 : hits / keywords.length;
}

export interface LegacyClassifierOptions {
  rules?: IntentRule[];
  fallbackIntent?: Intent;
  now?: () => number;
}

export function classifyWithRules(
  query: string,
  rules: IntentRule[],
  fallbackIntent: Intent = FALLBACK_INTENT,
): IntentScore[] {
  const q = normalize(query);
  const scores: IntentScore[] = [];
  for (const rule of rules) {
    const raw = matchScore(q, rule.keywords);
    if (raw > 0) {
      const confidence = Math.min(0.95, Math.sqrt(raw) * 1.2);
      scores.push({ intent: rule.intent, confidence });
    }
  }
  if (scores.length === 0) {
    scores.push({ intent: fallbackIntent, confidence: 0.4 });
  }
  scores.sort((a, b) => b.confidence - a.confidence);
  return scores;
}

export function createLegacyClassifier(opts: LegacyClassifierOptions = {}) {
  const rules = opts.rules ?? RULES;
  const fallback = opts.fallbackIntent ?? FALLBACK_INTENT;
  const now = opts.now ?? (() => Date.now());

  return {
    describe(): string {
      return 'legacy keyword classifier';
    },
    classify(query: string): IntentResult {
      const t0 = now();
      const scores = classifyWithRules(query, rules, fallback);
      return { query, scores, mode: 'legacy', latencyMs: now() - t0 };
    },
  };
}

export const _internal = { RULES, ALL_INTENTS, INTENT_DESCRIPTIONS, classifyWithRules };
