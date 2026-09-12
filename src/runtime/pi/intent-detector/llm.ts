/**
 * LLM-driven intent classifier.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/intent-detector
 *      (Requirement: LLM-Driven Intent Classification, Few-Shot Examples)
 *
 * The LLM is injected so tests can supply a deterministic mock. In production
 * the factory wires it to `callLlm` from the Pi model runtime. The classifier
 * builds a system prompt that lists the 5 intents, embeds the few-shot
 * examples, and asks the LLM for a JSON object with intents + confidences.
 */

import {
  ALL_INTENTS,
  INTENT_DESCRIPTIONS,
  type FewShotExample,
  type Intent,
  type IntentResult,
  type IntentScore,
  type LlmCall,
} from './types.js';

const SYSTEM_PROMPT_HEADER = [
  'You are an investment-assistant intent classifier.',
  'Classify the user query into one or more of the following intents:',
  ...ALL_INTENTS.map((i) => `- ${i}: ${INTENT_DESCRIPTIONS[i]}`),
  '',
  'Return ONLY a JSON object of the form:',
  '{"intents": [{"intent": "<intent>", "confidence": <0..1>}, ...]}',
  'Sort by confidence desc. The first entry is the primary intent.',
  'Do not include any prose, markdown, or explanation outside the JSON.',
].join('\n');

const DEFAULT_FEW_SHOT: FewShotExample[] = [
  { query: '分析一下 600519 该不该买', intents: ['analysis', 'trade'] },
  { query: '帮我找出 PE < 10 的银行股', intents: ['stock-selection'] },
  { query: '用双均线策略回测 000001 过去 5 年', intents: ['backtest'] },
  { query: '买入 100 股 600519 限价 1800', intents: ['trade'] },
  { query: '把 600519 加进自选,跌破 1700 提醒我', intents: ['monitor'] },
  { query: '看一下苹果最近的财报和估值', intents: ['analysis'] },
  { query: 'screen for low P/B value stocks', intents: ['stock-selection'] },
  { query: 'backtest a 20/50 day MA crossover on SPY', intents: ['backtest'] },
  { query: 'place a stop-loss at 95 for my AAPL position', intents: ['trade', 'monitor'] },
  { query: 'notify me when TSLA breaks 250', intents: ['monitor'] },
];

function buildSystemPrompt(examples: readonly FewShotExample[]): string {
  if (examples.length === 0) return SYSTEM_PROMPT_HEADER;
  const lines = [SYSTEM_PROMPT_HEADER, '', 'Examples:'];
  for (const ex of examples) {
    lines.push(`Query: ${ex.query}`);
    lines.push(`Intents: ${ex.intents.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}

/** Best-effort JSON extraction: strip ```json fences if the LLM added them. */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const body = fenced ? fenced[1]! : trimmed;
  return JSON.parse(body);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeScores(raw: unknown): IntentScore[] {
  if (!raw || typeof raw !== 'object') return [];
  const obj = raw as { intents?: unknown };
  if (!Array.isArray(obj.intents)) return [];
  const out: IntentScore[] = [];
  for (const entry of obj.intents) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as { intent?: unknown; confidence?: unknown };
    if (typeof e.intent !== 'string') continue;
    if (!ALL_INTENTS.includes(e.intent as Intent)) continue;
    const conf = typeof e.confidence === 'number' ? e.confidence : 0.5;
    out.push({ intent: e.intent as Intent, confidence: clamp01(conf) });
  }
  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

export interface LlmClassifierOptions {
  /** Callable that hits the LLM. Required. */
  llmCall: LlmCall;
  /** Override the few-shot examples. */
  examples?: readonly FewShotExample[];
  /** Optional clock for latency reporting. */
  now?: () => number;
  /** Fallback if LLM response cannot be parsed. Default 'analysis'. */
  fallbackIntent?: Intent;
}

export function createLlmClassifier(opts: LlmClassifierOptions) {
  if (!opts.llmCall) {
    throw new Error('createLlmClassifier requires opts.llmCall');
  }
  const examples: FewShotExample[] = [...(opts.examples ?? DEFAULT_FEW_SHOT)];
  const now = opts.now ?? (() => Date.now());
  const fallback: Intent = opts.fallbackIntent ?? 'analysis';
  let systemPrompt = buildSystemPrompt(examples);

  return {
    describe(): string {
      return `llm classifier (${examples.length} examples)`;
    },
    async classify(query: string): Promise<IntentResult> {
      const t0 = now();
      let scores: IntentScore[] = [];
      try {
        const raw = await opts.llmCall(systemPrompt, query);
        const parsed = extractJson(raw);
        scores = normalizeScores(parsed);
      } catch {
        // Swallow parse / network errors; fall through to fallback.
      }
      if (scores.length === 0) {
        scores = [{ intent: fallback, confidence: 0.4 }];
      }
      return {
        query,
        scores,
        mode: 'llm',
        latencyMs: now() - t0,
      };
    },
    addExample(example: FewShotExample): void {
      examples.push(example);
      systemPrompt = buildSystemPrompt(examples);
    },
    listExamples(): readonly FewShotExample[] {
      return examples;
    },
  };
}

export const _internal = {
  SYSTEM_PROMPT_HEADER,
  DEFAULT_FEW_SHOT,
  buildSystemPrompt,
  extractJson,
  normalizeScores,
};
