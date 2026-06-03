/**
 * KAIROS - proactive runtime for UpUp.
 *
 * Spec: openspec/changes/top-tier-investment-assistant/specs/kairos-mode
 *      openspec/changes/top-tier-investment-assistant/specs/event-bus
 */

export {
  createProactiveScanner,
  type ProactiveScanner,
  type ProactiveDeps,
  type MarketSnapshot,
  type ScanResult,
  type IdleTracker,
} from './proactive.js';

export {
  DEFAULT_PROACTIVE_CONFIG,
  type Opportunity,
  type OpportunityKind,
  type ProactiveConfig,
} from './types.js';
