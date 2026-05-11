/**
 * UpUp Daemon System — Additional Worker Types
 *
 * Monitor, Evolution, and Bridge worker interfaces.
 */

// ============================================================================
// Monitor Worker Types
// ============================================================================

/**
 * Monitor target type
 */
export type MonitorTargetType = 'github_pr' | 'github_issue' | 'cron_job' | 'system';

/**
 * Monitor notification type
 */
export type MonitorNotificationType = 'new_pr' | 'pr_merged' | 'new_issue' | 'cron_triggered' | 'system_alert';

/**
 * Monitor target
 */
export interface MonitorTarget {
  id: string;
  type: MonitorTargetType;
  target: string;
  interval?: number;
  lastState?: string;
}

/**
 * Monitor notification
 */
export interface MonitorNotification {
  targetId: string;
  type: MonitorNotificationType;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

/**
 * Monitor worker config
 */
export interface MonitorWorkerConfig {
  pollInterval: number;
  monitors: MonitorTarget[];
  onNotification?: (notification: MonitorNotification) => void;
}

// ============================================================================
// Evolution Worker Types
// ============================================================================

/**
 * Evolution suggestion type
 */
export type EvolutionSuggestionType = 'performance' | 'quality' | 'style' | 'architecture';

/**
 * Evolution suggestion
 */
export interface EvolutionSuggestion {
  id: string;
  type: EvolutionSuggestionType;
  description: string;
  files: string[];
  confidence: number;
  timestamp: number;
}

/**
 * Evolution worker config
 */
export interface EvolutionWorkerConfig {
  enableSelfImprovement: boolean;
  analysisInterval: number;
  analyzePatterns: string[];
}

// ============================================================================
// Bridge Worker Types
// ============================================================================

/**
 * CCR command type
 */
export type CCRCommandType = 'execute' | 'query' | 'control';

/**
 * CCR command
 */
export interface CCRCommand {
  id: string;
  type: CCRCommandType;
  payload: Record<string, unknown>;
  callback?: string;
}

/**
 * CCR response
 */
export interface CCRResponse {
  commandId: string;
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

/**
 * Bridge worker config
 */
export interface BridgeWorkerConfig {
  ccrUrl: string;
  retryInterval: number;
  authToken?: string;
}

