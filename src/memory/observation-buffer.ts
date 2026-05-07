/**
 * Memory Observation Buffer - Captures observations after tool calls
 *
 * Based on Claude Code's PostToolUse hook pattern:
 * - After each tool completes, capture observation (tool name, args, result)
 * - Accumulate observations over the session
 * - Extract memories from accumulated observations (not every tool call)
 *
 * This is the first phase of the 2-phase extraction:
 * Phase 1: Capture observations (this module)
 * Phase 2: Extract memories from observations (extraction.ts)
 */

import { info } from '../utils/logging/logger.js';

/**
 * An observation captured after a tool call completes
 */
export interface ToolObservation {
  timestamp: number;
  toolName: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
}

/**
 * Memory Observation Buffer
 *
 * Accumulates tool call observations for later memory extraction.
 */
export class ObservationBuffer {
  private observations: ToolObservation[] = [];
  private readonly maxObservations: number;

  constructor(maxObservations = 20) {
    this.maxObservations = maxObservations;
  }

  /**
   * Record an observation after a tool call completes
   */
  recordObservation(observation: ToolObservation): void {
    this.observations.push(observation);

    // Trim if exceeds max
    if (this.observations.length > this.maxObservations) {
      this.observations = this.observations.slice(-this.maxObservations);
    }

    info('memory', `Observation recorded: ${observation.toolName} (${this.observations.length}/${this.maxObservations})`);
  }

  /**
   * Get all accumulated observations
   */
  getObservations(): ToolObservation[] {
    return [...this.observations];
  }

  /**
   * Get observation count
   */
  getCount(): number {
    return this.observations.length;
  }

  /**
   * Check if buffer is full enough for extraction
   */
  shouldExtract(minObservations = 5): boolean {
    return this.observations.length >= minObservations;
  }

  /**
   * Clear observations after extraction
   */
  clear(): void {
    this.observations = [];
    info('memory', 'Observation buffer cleared');
  }

  /**
   * Convert observations to message format for LLM extraction
   */
  toMessages(): { role: string; content: string }[] {
    return this.observations.map(obs => ({
      role: 'observation' as const,
      content: `Tool: ${obs.toolName}
Args: ${JSON.stringify(obs.args, null, 2)}
Result: ${obs.result.slice(0, 500)}${obs.result.length > 500 ? '...' : ''}
Success: ${obs.success}`,
    }));
  }
}

// Singleton instance for session-wide observation buffer
let observationBuffer: ObservationBuffer | null = null;

export function getObservationBuffer(): ObservationBuffer {
  if (!observationBuffer) {
    observationBuffer = new ObservationBuffer();
  }
  return observationBuffer;
}

export function resetObservationBuffer(): void {
  observationBuffer = null;
}
