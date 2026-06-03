/**
 * Intent Detector shared types.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/intent-detector
 */

export type Intent =
  | 'stock-selection'
  | 'analysis'
  | 'backtest'
  | 'trade'
  | 'monitor';

export const ALL_INTENTS: readonly Intent[] = [
  'stock-selection',
  'analysis',
  'backtest',
  'trade',
  'monitor',
] as const;

export interface IntentScore {
  intent: Intent;
  /** 0..1 confidence. */
  confidence: number;
}

export interface IntentResult {
  query: string;
  /** Ranked, non-empty. Top score is the primary intent. */
  scores: IntentScore[];
  /** Detector mode that produced the result (debugging / observability). */
  mode: 'legacy' | 'llm';
  /** Latency in ms. */
  latencyMs: number;
}

export interface FewShotExample {
  query: string;
  intents: Intent[];
}

export interface LlmCall {
  (systemPrompt: string, userPrompt: string): Promise<string>;
}

export interface IntentDetector {
  classify(query: string): Promise<IntentResult>;
  /** Add a confirmed example to the few-shot set (no-op for legacy). */
  addExample?(example: FewShotExample): void;
  /** Returns the few-shot examples currently in use. */
  listExamples?(): readonly FewShotExample[];
}

export const INTENT_DESCRIPTIONS: Record<Intent, string> = {
  'stock-selection': 'Find / screen / pick stocks matching criteria (e.g., 找出低 PE 的银行股).',
  'analysis': 'Deep-dive analysis of a specific symbol or sector (e.g., 分析 600519).',
  'backtest': 'Run a historical backtest of a strategy (e.g., 用均线策略回测 000001).',
  'trade': 'Execute a trade, place or cancel an order, manage positions.',
  'monitor': 'Track / watch prices, set alerts, monitor positions or watchlist.',
};
