/**
 * Telemetry Integration - records tool call events
 * Stub for L4 modularization. Full implementation in Phase 4.
 */

export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  durationMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

export function recordToolCallOk(_record: Omit<ToolCallRecord, 'success'>): void {
  // Stub - real telemetry in Phase 4
}

export function recordToolCallErr(_record: Omit<ToolCallRecord, 'success'> & { error: string }): void {
  // Stub - real telemetry in Phase 4
}

export interface TelemetryEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function recordEvent(_event: TelemetryEvent): void {
  // Stub - real telemetry in Phase 4
}
