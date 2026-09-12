/**
 * 中文投资意图路由 — 同花顺"问财"对标。
 *
 * Public surface:
 *   - `ZhIntent`            : 4 大类 (选股/诊断/对比/教学) + 2 backward-compat (回测/交易/监控)
 *   - `ZH_INTENT_LABELS`    : 中文标签
 *   - `ZH_INTENT_DESCRIPTIONS` : 详细描述
 *   - `ZhRouter`            : orchestrator (LLM 优先 + 中文关键词 fallback)
 *   - `routeZh`             : standalone helper
 *   - `keywordRoute`        : 纯关键词 fallback(无 LLM)
 *
 * Design:
 *   - 4 大类映射:
 *       选股  → stock-selection
 *       诊断  → analysis
 *       对比  → compare   (NEW)
 *       教学  → tutorial  (NEW)
 *   - 保留 backtest / trade / monitor 兼容(同花顺问财也覆盖)
 *   - LLM 失败 / 无 LLM / LLM 输出不规范 → 关键词 fallback
 *   - 关键词表为 curated set,双语 (中文 + 英文)
 */
import type { LlmCall, Intent } from './types.js';

export type { LlmCall };

export type ZhIntent = Intent;
export const ZH_INTENT_LABELS: Record<ZhIntent, string> = {
  'stock-selection': '选股',
  'analysis': '诊断',
  'backtest': '回测',
  'trade': '交易',
  'monitor': '监控',
  'compare': '对比',
  'tutorial': '教学',
};

export const ZH_INTENT_DESCRIPTIONS: Record<ZhIntent, string> = {
  'stock-selection': '根据条件筛选/挑选股票,例如 "找出 PE<20 的科技股"、"低估值高分红蓝筹"',
  'analysis': '对单只股票或行业做深度分析/诊断,例如 "分析 600519 的基本面"、"诊断 AAPL 估值"',
  'backtest': '用历史数据回测一个交易策略,例如 "双均线策略回测 000001 过去 5 年"',
  'trade': '执行交易/下单/撤单/管仓位,例如 "买入 100 股 600519 限价 1800"',
  'monitor': '跟踪价格/设提醒/监控持仓/自选股,例如 "跌破 1700 提醒我"',
  'compare': '横向对比多只股票或多维度,例如 "对比茅台和五粮液"、"AAPL vs MSFT 哪个更好"',
  'tutorial': '解释概念/教学方法/回答定义性问题,例如 "什么是 PE"、"如何看财报"、"教我价值投资"',
};

// ---------------------------------------------------------------------------
// Chinese + English keyword patterns
// ---------------------------------------------------------------------------

const KEYWORD_PATTERNS: Record<ZhIntent, Array<RegExp | { re: RegExp; weight: number }>> = {
  'stock-selection': [
    /找出|找一找|筛选|筛|挑|选股|选\s*股|帮我选|帮我找|有哪些/i,
    /PE\s*[<≤>≥]|PB\s*[<≤>≥]|ROE\s*[<≤>≥]|估值.*?(低|高|合理)/i,
    /低估值|高估值|高分红|高股息|高增长|高ROE|低PE|低PB/i,
    /科技股|银行股|消费股|医药股|新能源|蓝筹|白马|题材股/i,
    /find\s*stocks?|screen|screener|pick\s*stocks?|which\s*stocks?/i,
  ],
  'analysis': [
    /分析一下|分析|诊断|研究|解读|看一下.*?怎么样|怎么看/i,
    /基本面|技术面|财务|财报|业绩|估值|盈利|营收/i,
    /analyze|analysis|deep[\s-]?dive|fundamentals?|valuation/i,
  ],
  'backtest': [
    /回测|历史回测|策略.*?回测|回测.*?策略|用.*?回测/i,
    /backtest|back[\s-]?test|historical\s*simulation/i,
    /均线策略|双均线|海龟|价值投资.*?回测/i,
  ],
  'trade': [
    /买入|卖出|加仓|减仓|建仓|平仓|下单|撤单|挂单|限价|市价/i,
    /buy|sell|place\s*order|cancel\s*order|market\s*order|limit\s*order/i,
    /\d+\s*股/i, // "100 股"
    /仓位|持仓|止损|止盈/i,
  ],
  'monitor': [
    /提醒|预警|监控|跟踪|加入自选|加入.*?关注|跌破|涨破|突破/i,
    /alert|notify|watchlist|monitor|track|price\s*alert/i,
  ],
  'compare': [
    /对比|比较|比一下|A\s*vs\s*B|和.*?比|哪个.*?更好|谁.*?更好/i,
    /差异|区别|优劣势|孰优孰劣|对比表|横向比/i,
    /compare|comparison|versus|vs\.?/i,
  ],
  'tutorial': [
    { re: /^什么是|^怎么.*?$|^如何.*?$|^教我|^解释.*?$|^解释一下/i, weight: 2 },
    /入门|基础|概念|原理|定义|教程|指南|什么是/i,
    /what\s*is|how\s*to|explain|tutorial|teach\s*me|learn/i,
    /^.{0,8}(PE|PB|ROE|均线|K线|财报|估值).{0,8}(是什么|怎么|如何|解释).*?$/i,
  ],
};

/** Pure rule-based Chinese intent routing. Returns scores for all 4 main intents + compat. */
export function keywordRoute(query: string): Array<{ intent: ZhIntent; score: number; keywords: string[] }> {
  const scores: Record<ZhIntent, { score: number; keywords: string[] }> = {
    'stock-selection': { score: 0, keywords: [] },
    'analysis': { score: 0, keywords: [] },
    'backtest': { score: 0, keywords: [] },
    'trade': { score: 0, keywords: [] },
    'monitor': { score: 0, keywords: [] },
    'compare': { score: 0, keywords: [] },
    'tutorial': { score: 0, keywords: [] },
  };
  for (const intent of Object.keys(KEYWORD_PATTERNS) as ZhIntent[]) {
    for (const pat of KEYWORD_PATTERNS[intent]) {
      const re = pat instanceof RegExp ? pat : pat.re;
      const weight = pat instanceof RegExp ? 1 : pat.weight;
      const m = query.match(re);
      if (m) {
        scores[intent].score += weight;
        scores[intent].keywords.push(m[0]);
      }
    }
    // Normalize to 0..1 (max ~3 weighted matches = 1.0)
    scores[intent].score = Math.min(1, scores[intent].score / 3);
  }
  return (Object.keys(scores) as ZhIntent[])
    .map((intent) => ({ intent, score: scores[intent].score, keywords: scores[intent].keywords }))
    .sort((a, b) => b.score - a.score);
}

export interface ZhRouteResult {
  query: string;
  /** Primary intent (highest score). */
  intent: ZhIntent;
  /** 0..1 confidence. */
  confidence: number;
  /** All candidate intents with scores, sorted desc. */
  scores: Array<{ intent: ZhIntent; score: number; keywords: string[] }>;
  /** Which detector path produced the result. */
  source: 'rule' | 'llm' | 'mixed';
  /** Latency in ms. */
  latencyMs: number;
}

const ZH_SYSTEM_PROMPT = [
  '你是一个中文投资助手的意图分类器。',
  '把用户 query 归类到以下意图之一(可多选):',
  ...Object.keys(ZH_INTENT_DESCRIPTIONS).map((k) => `- ${k} (${ZH_INTENT_LABELS[k as ZhIntent]}): ${ZH_INTENT_DESCRIPTIONS[k as ZhIntent]}`),
  '',
  '只返回 JSON,格式:',
  '{"intents": [{"intent": "<intent>", "confidence": <0..1>}, ...]}',
  '按 confidence 降序排,第一个是主意图。',
  '不要输出任何散文、Markdown 或 JSON 之外的解释。',
].join('\n');

interface LlmIntent {
  intent: string;
  confidence: number;
}

function parseLlmIntents(raw: string, valid: Set<string>): LlmIntent[] {
  // Strip code fences
  let text = raw.trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  // Find JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (!objMatch) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(objMatch[0]); } catch { return []; }
  if (typeof parsed !== 'object' || parsed === null) return [];
  const obj = parsed as { intents?: unknown };
  if (!Array.isArray(obj.intents)) return [];
  const out: LlmIntent[] = [];
  for (const item of obj.intents) {
    if (typeof item !== 'object' || item === null) continue;
    const i = item as { intent?: unknown; confidence?: unknown };
    if (typeof i.intent !== 'string' || typeof i.confidence !== 'number') continue;
    if (!valid.has(i.intent)) continue;
    const conf = Math.max(0, Math.min(1, i.confidence));
    out.push({ intent: i.intent, confidence: conf });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

export interface ZhRouterOptions {
  /** Override LLM call (used by tests and CLI startup). */
  llmCall?: LlmCall;
  /** Min keyword confidence to consider rule-based result strong enough. */
  ruleThreshold?: number;
}

export class ZhRouter {
  private llmCall?: LlmCall;
  private ruleThreshold: number;
  private readonly validIntents: Set<string>;

  constructor(opts: ZhRouterOptions = {}) {
    this.llmCall = opts.llmCall;
    this.ruleThreshold = opts.ruleThreshold ?? 0.34;
    this.validIntents = new Set(Object.keys(ZH_INTENT_DESCRIPTIONS));
  }

  /** Route a Chinese query to one of the 4 main intents (or compat). */
  async route(query: string): Promise<ZhRouteResult> {
    const t0 = Date.now();
    const ruleScores = keywordRoute(query);
    const top = ruleScores[0];
    const ruleConfident = top && top.score >= this.ruleThreshold;

    // Try LLM if available
    if (this.llmCall) {
      try {
        const raw = await this.llmCall(ZH_SYSTEM_PROMPT, query);
        const llmIntents = parseLlmIntents(raw, this.validIntents);
        if (llmIntents.length > 0) {
          // Merge: if rule is confident, blend; otherwise LLM wins
          const llmTop = llmIntents[0];
          if (ruleConfident) {
            // Mixed: prefer LLM intent, augment with rule keywords
            const blended = this.merge(ruleScores, llmIntents);
            return {
              query,
              intent: llmTop.intent as ZhIntent,
              confidence: llmTop.confidence,
              scores: blended,
              source: 'mixed',
              latencyMs: Date.now() - t0,
            };
          }
          return {
            query,
            intent: llmTop.intent as ZhIntent,
            confidence: llmTop.confidence,
            scores: llmIntents.map((i) => ({ intent: i.intent as ZhIntent, score: i.confidence, keywords: [] })),
            source: 'llm',
            latencyMs: Date.now() - t0,
          };
        }
      } catch {
        // fall through to rule
      }
    }
    // Rule-based result
    if (!top || top.score === 0) {
      // No rule matched → default to analysis
      return {
        query,
        intent: 'analysis',
        confidence: 0.2,
        scores: ruleScores,
        source: 'rule',
        latencyMs: Date.now() - t0,
      };
    }
    return {
      query,
      intent: top.intent,
      confidence: top.score,
      scores: ruleScores,
      source: 'rule',
      latencyMs: Date.now() - t0,
    };
  }

  private merge(
    ruleScores: Array<{ intent: ZhIntent; score: number; keywords: string[] }>,
    llmIntents: LlmIntent[],
  ): Array<{ intent: ZhIntent; score: number; keywords: string[] }> {
    const out = new Map<ZhIntent, { score: number; keywords: string[] }>();
    for (const r of ruleScores) {
      out.set(r.intent, { score: r.score, keywords: [...r.keywords] });
    }
    for (const l of llmIntents) {
      const existing = out.get(l.intent as ZhIntent) ?? { score: 0, keywords: [] };
      // Blend: average of LLM and rule score, then take max
      existing.score = Math.max(existing.score, l.confidence);
      out.set(l.intent as ZhIntent, existing);
    }
    return [...out.entries()]
      .map(([intent, v]) => ({ intent, ...v }))
      .sort((a, b) => b.score - a.score);
  }
}

/** Standalone helper. */
export async function routeZh(query: string, opts: ZhRouterOptions = {}): Promise<ZhRouteResult> {
  return new ZhRouter(opts).route(query);
}
