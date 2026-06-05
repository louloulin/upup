/**
 * KAIROS — proactive runtime for UpUp.
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
} from "./proactive.js";

export {
  createPositionMonitor,
  type Position,
  type PositionAlert,
  type PositionMonitorDeps,
  type PositionMonitorConfig,
  type MonitorResult,
  type QuoteProvider,
} from "./position-monitor.js";

export {
  createEventScanner,
  type EventScanner,
  type EventScannerDeps,
  type ScannerConfig,
  type ScanEvent,
  type ScanReport,
  type ScanSymbol,
  type ScannerEventKind,
  type ScannerSession,
} from "./scanner.js";

export {
  DEFAULT_PROACTIVE_CONFIG,
  type Opportunity,
  type OpportunityKind,
  type ProactiveConfig,
} from "./types.js";

export {
  createEarningsTrigger,
  daysUntil,
  type EarningsTrigger,
  type EarningsTriggerDeps,
  type EarningsTriggerConfig,
  type EarningsTriggerResult,
  type EarningsUpcomingEvent,
  type EarningsCalendarEntry,
  type EarningsCalendarFetcher,
} from "./earnings-trigger.js";

export { _internal as _positionMonitorInternal } from "./position-monitor.js";
export { _internal as _scannerInternal } from "./scanner.js";
