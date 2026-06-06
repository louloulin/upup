/**
 * KAIROS shared types.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

export type OpportunityKind =
  | 'technical-breakout'
  | 'valuation-rerating'
  | 'sentiment-shift'
  | 'capital-flow-anomaly'
  | 'stale-dossier';

export interface Opportunity {
  symbol: string;
  kind: OpportunityKind;
  /** 0..1 confidence score, used to rank opportunities in the digest. */
  confidence: number;
  /** Human-readable headline surfaced in the digest. */
  headline: string;
  /** Optional supporting data points (e.g. indicators, ratios, flow %). */
  data?: Record<string, unknown>;
  /** Source detector name (e.g. 'breakout-detector', 'flow-detector'). */
  source: string;
  detectedAt: number;
}

export interface ProactiveConfig {
  /** Maximum opportunities to emit per scan. Default 10. */
  maxPerScan?: number;
  /** Minimum confidence to emit. Default 0.5. */
  minConfidence?: number;
  /** Idle threshold in ms. Default 1h. */
  idleThresholdMs?: number;
  /** Topic prefix for emitted events. Default 'kairos.opportunity'. */
  topicPrefix?: string;
}

export const DEFAULT_PROACTIVE_CONFIG = {
  maxPerScan: 10,
  minConfidence: 0.5,
  idleThresholdMs: 60 * 60 * 1000,
  topicPrefix: 'kairos.opportunity',
} as const;
