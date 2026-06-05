/**
 * 中文投资意图路由 — e2e tests.
 *
 * Covers:
 *   - keywordRoute: each of 4 main intents (选股/诊断/对比/教学) + 3 compat
 *   - Edge cases: no match, multi-intent, English queries
 *   - ZhRouter: rule-only when no LLM
 *   - ZhRouter: LLM with valid JSON output → uses LLM
 *   - ZhRouter: LLM error → falls back to rule
 *   - ZhRouter: LLM returns invalid JSON → falls back to rule
 *   - ZhRouter: rule confident + LLM fires → mixed
 *   - ZH_INTENT_LABELS / DESCRIPTIONS
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ZhRouter,
  routeZh,
  keywordRoute,
  ZH_INTENT_LABELS,
  ZH_INTENT_DESCRIPTIONS,
  type LlmCall,
  type ZhIntent,
} from './zh-router.js';

// ---------------------------------------------------------------------------
// keywordRoute — 4 main intents
// ---------------------------------------------------------------------------

describe('keywordRoute — 选股 (stock-selection)', () => {
  test('找出 + PE + 科技股', () => {
    const r = keywordRoute('找出 PE<20 的科技股');
    expect(r[0].intent).toBe('stock-selection');
    expect(r[0].score).toBeGreaterThan(0);
  });

  test('筛选 + 估值', () => {
    const r = keywordRoute('帮我筛选低估值的银行股');
    expect(r[0].intent).toBe('stock-selection');
  });

  test('找一找 + 高分红', () => {
    const r = keywordRoute('找一找高分红蓝筹股');
    expect(r[0].intent).toBe('stock-selection');
  });

  test('English: "find stocks with low PE"', () => {
    const r = keywordRoute('find stocks with low PE');
    expect(r[0].intent).toBe('stock-selection');
  });
});

describe('keywordRoute — 诊断 (analysis)', () => {
  test('分析 + 基本面', () => {
    const r = keywordRoute('分析一下 600519 的基本面');
    expect(r[0].intent).toBe('analysis');
  });

  test('诊断 + 估值', () => {
    const r = keywordRoute('诊断 AAPL 估值');
    expect(r[0].intent).toBe('analysis');
  });

  test('English: "analyze AAPL fundamentals"', () => {
    const r = keywordRoute('analyze AAPL fundamentals');
    expect(r[0].intent).toBe('analysis');
  });

  test('看一下 + 财报', () => {
    const r = keywordRoute('看一下苹果最近的财报');
    expect(r[0].intent).toBe('analysis');
  });
});

describe('keywordRoute — 对比 (compare)', () => {
  test('对比 + A 和 B', () => {
    const r = keywordRoute('对比茅台和五粮液');
    expect(r[0].intent).toBe('compare');
  });

  test('A vs B', () => {
    const r = keywordRoute('AAPL vs MSFT 哪个更好');
    expect(r[0].intent).toBe('compare');
  });

  test('English: "compare AAPL and MSFT"', () => {
    const r = keywordRoute('compare AAPL and MSFT');
    expect(r[0].intent).toBe('compare');
  });

  test('比一下 + 区别', () => {
    const r = keywordRoute('比一下两只股票的区别');
    expect(r[0].intent).toBe('compare');
  });
});

describe('keywordRoute — 教学 (tutorial)', () => {
  test('什么是 + PE', () => {
    const r = keywordRoute('什么是 PE');
    expect(r[0].intent).toBe('tutorial');
  });

  test('教我 + 价值投资', () => {
    const r = keywordRoute('教我价值投资');
    expect(r[0].intent).toBe('tutorial');
  });

  test('English: "what is PE"', () => {
    const r = keywordRoute('what is PE');
    expect(r[0].intent).toBe('tutorial');
  });

  test('如何 + 财报', () => {
    const r = keywordRoute('如何读财报');
    expect(r[0].intent).toBe('tutorial');
  });

  test('解释 + 概念', () => {
    const r = keywordRoute('解释一下 K 线');
    expect(r[0].intent).toBe('tutorial');
  });
});

// ---------------------------------------------------------------------------
// keywordRoute — compat intents
// ---------------------------------------------------------------------------

describe('keywordRoute — compat (backtest / trade / monitor)', () => {
  test('回测 + 均线策略', () => {
    const r = keywordRoute('用双均线策略回测 000001 过去 5 年');
    expect(r[0].intent).toBe('backtest');
  });

  test('买入 + 100 股 + 限价', () => {
    const r = keywordRoute('买入 100 股 600519 限价 1800');
    expect(r[0].intent).toBe('trade');
  });

  test('跌破 + 提醒', () => {
    const r = keywordRoute('把 600519 加进自选,跌破 1700 提醒我');
    expect(r[0].intent).toBe('monitor');
  });
});

// ---------------------------------------------------------------------------
// keywordRoute — edge cases
// ---------------------------------------------------------------------------

describe('keywordRoute — edge cases', () => {
  test('returns sorted by score desc', () => {
    const r = keywordRoute('找出 PE<20 的科技股');
    for (let i = 1; i < r.length; i++) {
      expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    }
  });

  test('returns all 7 intents even if no match', () => {
    const r = keywordRoute('asdfghjkl qwertyuiop');
    expect(r).toHaveLength(7);
    for (const s of r) {
      expect(s.score).toBe(0);
      expect(s.keywords).toEqual([]);
    }
  });

  test('score is capped at 1.0', () => {
    const r = keywordRoute('找出 筛选 选股 PE<20 PB<3 ROE>15% 科技股 银行股 消费股');
    expect(r[0].score).toBeLessThanOrEqual(1);
  });

  test('multi-intent query surfaces all top intents', () => {
    const r = keywordRoute('对比茅台和五粮液, 然后分析一下基本面');
    const top2 = new Set([r[0].intent, r[1].intent]);
    expect(top2.has('compare') || top2.has('analysis')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ZH_INTENT_LABELS / DESCRIPTIONS
// ---------------------------------------------------------------------------

describe('ZH_INTENT_LABELS / DESCRIPTIONS', () => {
  test('all 7 intents have Chinese labels', () => {
    for (const intent of Object.keys(ZH_INTENT_LABELS)) {
      expect(ZH_INTENT_LABELS[intent as ZhIntent]).toBeTruthy();
    }
  });

  test('all 7 intents have descriptions', () => {
    for (const intent of Object.keys(ZH_INTENT_DESCRIPTIONS)) {
      expect(ZH_INTENT_DESCRIPTIONS[intent as ZhIntent].length).toBeGreaterThan(10);
    }
  });

  test('4 main intents (选股/诊断/对比/教学) are labeled correctly', () => {
    expect(ZH_INTENT_LABELS['stock-selection']).toBe('选股');
    expect(ZH_INTENT_LABELS['analysis']).toBe('诊断');
    expect(ZH_INTENT_LABELS['compare']).toBe('对比');
    expect(ZH_INTENT_LABELS['tutorial']).toBe('教学');
  });
});

// ---------------------------------------------------------------------------
// ZhRouter
// ---------------------------------------------------------------------------

describe('ZhRouter', () => {
  test('rule-only when no LLM configured', async () => {
    const r = new ZhRouter();
    const out = await r.route('找出 PE<20 的科技股');
    expect(out.intent).toBe('stock-selection');
    expect(out.source).toBe('rule');
  });

  test('rule-only with low confidence falls back to analysis default', async () => {
    const r = new ZhRouter();
    const out = await r.route('asdfghjkl qwertyuiop');
    expect(out.intent).toBe('analysis');
    expect(out.confidence).toBe(0.2);
    expect(out.source).toBe('rule');
  });

  test('LLM with valid JSON: uses LLM intent', async () => {
    const llm: LlmCall = async () => JSON.stringify({
      intents: [
        { intent: 'compare', confidence: 0.85 },
        { intent: 'analysis', confidence: 0.3 },
      ],
    });
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('随便什么 query,LLM 会分类');
    expect(out.intent).toBe('compare');
    expect(out.confidence).toBe(0.85);
    expect(out.source).toBe('llm');
  });

  test('LLM with code fences around JSON', async () => {
    const llm: LlmCall = async () => '```json\n{"intents":[{"intent":"tutorial","confidence":0.9}]}\n```';
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('什么都行');
    expect(out.intent).toBe('tutorial');
  });

  test('LLM with invalid JSON falls back to rule', async () => {
    const llm: LlmCall = async () => 'not json at all';
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('找出 PE<20 的科技股');
    // Rule fires, LLM failed → rule wins
    expect(out.intent).toBe('stock-selection');
    expect(out.source).toBe('rule');
  });

  test('LLM with valid JSON but unknown intent dropped → fall back to rule', async () => {
    const llm: LlmCall = async () => JSON.stringify({
      intents: [{ intent: 'unknown-intent', confidence: 0.9 }],
    });
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('对比茅台和五粮液');
    // LLM returned only invalid intent; rule fires
    expect(out.intent).toBe('compare');
    expect(out.source).toBe('rule');
  });

  test('LLM throws → fall back to rule', async () => {
    const llm: LlmCall = async () => { throw new Error('LLM down'); };
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('找出 PE<20 的科技股');
    expect(out.intent).toBe('stock-selection');
    expect(out.source).toBe('rule');
  });

  test('rule confident + LLM fires → mixed (LLM intent wins)', async () => {
    const llm: LlmCall = async () => JSON.stringify({
      intents: [{ intent: 'tutorial', confidence: 0.7 }],
    });
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('什么是 PE');
    // Rule would pick tutorial with high confidence; LLM also picks tutorial
    expect(out.intent).toBe('tutorial');
    expect(out.source).toBe('mixed');
  });

  test('latencyMs is reported and non-negative', async () => {
    const r = new ZhRouter();
    const out = await r.route('找出 PE<20 的科技股');
    expect(out.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test('scores are sorted desc', async () => {
    const r = new ZhRouter();
    const out = await r.route('找出 PE<20 的科技股');
    for (let i = 1; i < out.scores.length; i++) {
      expect(out.scores[i - 1].score).toBeGreaterThanOrEqual(out.scores[i].score);
    }
  });
});

// ---------------------------------------------------------------------------
// routeZh standalone
// ---------------------------------------------------------------------------

describe('routeZh', () => {
  test('standalone function works', async () => {
    const out = await routeZh('对比茅台和五粮液');
    expect(out.intent).toBe('compare');
  });

  test('accepts llmCall option', async () => {
    const llm: LlmCall = async () => JSON.stringify({
      intents: [{ intent: 'stock-selection', confidence: 0.95 }],
    });
    const out = await routeZh('anything', { llmCall: llm });
    expect(out.intent).toBe('stock-selection');
    expect(out.source).toBe('llm');
  });
});

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

describe('safety', () => {
  test('empty query handled (default to analysis)', async () => {
    const r = new ZhRouter();
    const out = await r.route('');
    // Empty string matches no keywords → fallback to analysis
    expect(out.intent).toBe('analysis');
  });

  test('very long query handled', async () => {
    const r = new ZhRouter();
    const long = '找出 PE<20 '.repeat(200);
    expect(async () => r.route(long)).not.toThrow();
  });

  test('special characters do not throw', async () => {
    const r = new ZhRouter();
    expect(async () => r.route('找出 PE<20 !@#$%^&*() 科技股')).not.toThrow();
  });

  test('with LLM that returns prose, falls back to rule', async () => {
    const llm: LlmCall = async () => 'I cannot classify this query because it is too complex for me.';
    const r = new ZhRouter({ llmCall: llm });
    const out = await r.route('找出 PE<20 的科技股');
    expect(out.intent).toBe('stock-selection');
    expect(out.source).toBe('rule');
  });
});
