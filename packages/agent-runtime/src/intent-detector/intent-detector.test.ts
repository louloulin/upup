/**
 * Tests for the intent detector (legacy + LLM).
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/intent-detector
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createIntentDetector, loadFewShotExamples } from './index.js';
import { createLegacyClassifier, _internal as legacyInternal } from './legacy.js';
import { createLlmClassifier, _internal as llmInternal } from './llm.js';
import type { LlmCall } from './types.js';

const FIXED_NOW = 1_700_000_000_000;

describe('legacy classifier', () => {
  const c = createLegacyClassifier({ now: () => FIXED_NOW });

  test('"买入 100 股 600519" classifies as trade', () => {
    const r = c.classify('买入 100 股 600519');
    expect(r.mode).toBe('legacy');
    expect(r.scores[0]!.intent).toBe('trade');
  });

  test('"分析一下 600519 该不该买" surfaces analysis', () => {
    const r = c.classify('分析一下 600519 该不该买');
    const intents = r.scores.map((s) => s.intent);
    expect(intents).toContain('analysis');
  });

  test('"用双均线策略回测 000001 过去 5 年" classifies as backtest', () => {
    const r = c.classify('用双均线策略回测 000001 过去 5 年');
    expect(r.scores[0]!.intent).toBe('backtest');
  });

  test('"把 600519 加进自选,跌破 1700 提醒我" classifies as monitor', () => {
    const r = c.classify('把 600519 加进自选,跌破 1700 提醒我');
    expect(r.scores[0]!.intent).toBe('monitor');
  });

  test('"找出 PE < 10 的银行股" classifies as stock-selection', () => {
    const r = c.classify('找出 PE < 10 的银行股');
    expect(r.scores[0]!.intent).toBe('stock-selection');
  });

  test('English "screen for low P/B value stocks" classifies as stock-selection', () => {
    const r = c.classify('screen for low P/B value stocks');
    expect(r.scores[0]!.intent).toBe('stock-selection');
  });

  test('unrelated query falls back to analysis with low confidence', () => {
    const r = c.classify('hello world');
    expect(r.scores).toHaveLength(1);
    expect(r.scores[0]!.intent).toBe('analysis');
    expect(r.scores[0]!.confidence).toBeLessThan(0.5);
  });

  test('result is sorted by confidence desc', () => {
    const r = c.classify('分析一下 600519 该不该买,顺便回测一下,加进自选');
    for (let i = 1; i < r.scores.length; i++) {
      expect(r.scores[i - 1]!.confidence).toBeGreaterThanOrEqual(r.scores[i]!.confidence);
    }
  });

  test('latencyMs is non-negative and reports mode', () => {
    const r = c.classify('test');
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(r.mode).toBe('legacy');
  });
});

describe('LLM classifier', () => {
  function makeFakeLlm(response: string | ((sys: string, q: string) => string)): {
    call: LlmCall;
    received: { system: string; user: string }[];
  } {
    const received: { system: string; user: string }[] = [];
    const call: LlmCall = async (system, user) => {
      received.push({ system, user });
      if (typeof response === 'string') return response;
      return response(system, user);
    };
    return { call, received };
  }

  test('parses valid JSON response with multiple intents', async () => {
    const { call } = makeFakeLlm(
      '{"intents":[{"intent":"analysis","confidence":0.8},{"intent":"trade","confidence":0.6}]}',
    );
    const c = createLlmClassifier({ llmCall: call });
    const r = await c.classify('分析一下 600519 该不该买');
    expect(r.mode).toBe('llm');
    expect(r.scores[0]!.intent).toBe('analysis');
    expect(r.scores[0]!.confidence).toBeCloseTo(0.8);
    expect(r.scores[1]!.intent).toBe('trade');
  });

  test('strips ```json fences', async () => {
    const { call } = makeFakeLlm('```json\n{"intents":[{"intent":"backtest","confidence":0.9}]}\n```');
    const c = createLlmClassifier({ llmCall: call });
    const r = await c.classify('anything');
    expect(r.scores[0]!.intent).toBe('backtest');
  });

  test('falls back when JSON is invalid', async () => {
    const { call } = makeFakeLlm('not json');
    const c = createLlmClassifier({ llmCall: call, fallbackIntent: 'analysis' });
    const r = await c.classify('anything');
    expect(r.scores).toHaveLength(1);
    expect(r.scores[0]!.intent).toBe('analysis');
    expect(r.scores[0]!.confidence).toBe(0.4);
  });

  test('falls back when LLM call throws', async () => {
    const call: LlmCall = async () => {
      throw new Error('network down');
    };
    const c = createLlmClassifier({ llmCall: call });
    const r = await c.classify('anything');
    expect(r.scores[0]!.intent).toBe('analysis');
  });

  test('drops unknown intents from response', async () => {
    const { call } = makeFakeLlm(
      '{"intents":[{"intent":"analysis","confidence":0.7},{"intent":"gamble","confidence":0.99}]}',
    );
    const c = createLlmClassifier({ llmCall: call });
    const r = await c.classify('x');
    expect(r.scores.map((s) => s.intent)).toEqual(['analysis']);
  });

  test('clamps out-of-range confidences to [0, 1]', async () => {
    const { call } = makeFakeLlm(
      '{"intents":[{"intent":"analysis","confidence":1.7},{"intent":"trade","confidence":-0.4}]}',
    );
    const c = createLlmClassifier({ llmCall: call });
    const r = await c.classify('x');
    expect(r.scores[0]!.confidence).toBeLessThanOrEqual(1);
    expect(r.scores[1]!.confidence).toBeGreaterThanOrEqual(0);
  });

  test('system prompt embeds the few-shot examples', async () => {
    const { call, received } = makeFakeLlm('{"intents":[{"intent":"analysis","confidence":0.5}]}');
    const c = createLlmClassifier({ llmCall: call });
    await c.classify('test');
    expect(received[0]!.system).toMatch(/Examples:/);
    expect(received[0]!.system).toMatch(/分析一下 600519/);
  });

  test('addExample() extends the few-shot set and uses it on next call', async () => {
    const { call, received } = makeFakeLlm('{"intents":[{"intent":"trade","confidence":0.5}]}');
    const c = createLlmClassifier({ llmCall: call });
    const initial = c.listExamples().length;
    c.addExample({ query: 'custom query', intents: ['monitor'] });
    expect(c.listExamples().length).toBe(initial + 1);
    await c.classify('foo');
    expect(received[0]!.system).toMatch(/custom query/);
  });

  test('throws if llmCall is not provided', () => {
    expect(() => createLlmClassifier({ llmCall: undefined as unknown as LlmCall })).toThrow();
  });

  test('latency is measured', async () => {
    const { call } = makeFakeLlm('{"intents":[{"intent":"analysis","confidence":0.5}]}');
    const c = createLlmClassifier({ llmCall: call, now: () => FIXED_NOW });
    const r = await c.classify('x');
    expect(r.latencyMs).toBe(0);
  });
});

describe('factory (createIntentDetector)', () => {
  const originalMode = process.env.UPUP_INTENT_MODE;

  beforeEach(() => {
    delete process.env.UPUP_INTENT_MODE;
  });

  afterEach(() => {
    if (originalMode === undefined) {
      delete process.env.UPUP_INTENT_MODE;
    } else {
      process.env.UPUP_INTENT_MODE = originalMode;
    }
  });

  test('UPUP_INTENT_MODE=legacy uses legacy classifier', async () => {
    process.env.UPUP_INTENT_MODE = 'legacy';
    const d = createIntentDetector();
    const r = await d.classify('买入 100');
    expect(r.mode).toBe('legacy');
  });

  test('default (no env) requires llmCall and throws if missing', () => {
    expect(() => createIntentDetector()).toThrow(/llmCall/);
  });

  test('default (no env) uses LLM classifier when llmCall provided', async () => {
    const d = createIntentDetector({
      llmCall: async () => '{"intents":[{"intent":"analysis","confidence":0.5}]}',
    });
    const r = await d.classify('x');
    expect(r.mode).toBe('llm');
  });

  test('forceMode overrides env', async () => {
    process.env.UPUP_INTENT_MODE = 'legacy';
    const d = createIntentDetector({
      forceMode: 'llm',
      llmCall: async () => '{"intents":[{"intent":"analysis","confidence":0.5}]}',
    });
    const r = await d.classify('x');
    expect(r.mode).toBe('llm');
  });

  test('loadFewShotExamples returns at least 4 examples from examples.json', () => {
    const examples = loadFewShotExamples();
    expect(examples.length).toBeGreaterThanOrEqual(4);
    const intents = new Set(examples.flatMap((e) => e.intents));
    expect(intents.size).toBeGreaterThanOrEqual(4);
  });
});

describe('internal helpers', () => {
  test('legacy: classifyWithRules respects fallback when no match', () => {
    const scores = legacyInternal.classifyWithRules('nothing', legacyInternal.RULES, 'monitor');
    expect(scores[0]!.intent).toBe('monitor');
  });

  test('llm: extractJson strips code fences', () => {
    const parsed = llmInternal.extractJson('```json\n{"x":1}\n```') as { x: number };
    expect(parsed.x).toBe(1);
  });

  test('llm: extractJson parses plain JSON', () => {
    const parsed = llmInternal.extractJson('{"x":2}') as { x: number };
    expect(parsed.x).toBe(2);
  });

  test('llm: normalizeScores returns empty for malformed payloads', () => {
    expect(llmInternal.normalizeScores(null)).toEqual([]);
    expect(llmInternal.normalizeScores({})).toEqual([]);
    expect(llmInternal.normalizeScores({ intents: 'oops' })).toEqual([]);
  });

  test('llm: normalizeScores drops unknown intents', () => {
    const out = llmInternal.normalizeScores({
      intents: [
        { intent: 'analysis', confidence: 0.7 },
        { intent: 'gamble', confidence: 0.99 },
      ],
    });
    expect(out.map((s) => s.intent)).toEqual(['analysis']);
  });
});
