/**
 * Algo Runner
 *
 * Spec: openspec/changes/top-tier-investment-assistant-v2/specs/algo-trading
 *      → Requirement: Algo Runner
 *
 * Generic orchestrator that takes a ParentOrder, dispatches to the chosen
 * Algo for scheduling, submits child orders to a BrokerAdapter on schedule,
 * aggregates results, and emits progress events to the event bus.
 *
 * Pure-ish: the runner does not own a clock; callers may inject a
 * `now()` function for testing. The runner also does not own scheduling
 * (no setTimeout); instead, it exposes `tick(now)` which the caller
 * invokes periodically. This keeps the runner testable and lets the
 * caller batch multiple parent orders in a single event loop.
 */

import type {
  Algo,
  AlgoKind,
  AlgoProgress,
  AlgoReport,
  ChildOrder,
  ParentOrder,
} from './types.js';
import type { BrokerAdapter, Order } from '../types.js';
import { TwapAlgo } from './twap.js';
// VWAP / POV / IS will be registered as they are implemented in follow-up
// commits; the runner is algorithm-agnostic and accepts any Algo instance.

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const ALGOS: Record<AlgoKind, () => Algo> = {
  twap: () => new TwapAlgo(),
  // Lazy placeholders — will be filled by additional algo implementations.
  vwap: () => new TwapAlgo(), // TODO: replace with VwapAlgo once implemented
  pov: () => new TwapAlgo(),  // TODO: replace with PovAlgo once implemented
  is: () => new TwapAlgo(),   // TODO: replace with IsAlgo once implemented
};

export function getAlgo(kind: AlgoKind): Algo {
  const factory = ALGOS[kind];
  if (!factory) throw new Error(`Unknown algo kind: ${kind}`);
  return factory();
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunnerDeps {
  broker: BrokerAdapter;
  /** Wall clock override (default: () => Date.now()). */
  now?: () => number;
  /** Sleep override (default: real setTimeout). */
  sleep?: (ms: number) => Promise<void>;
  /** Optional event sink (e.g. event bus) for child-fill / progress events. */
  onEvent?: (topic: string, payload: unknown) => void;
}

interface RunnerState {
  parent: ParentOrder;
  algo: Algo;
  schedule: ChildOrder[];
  progress: AlgoProgress;
  notes: string[];
  state: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
}

export class AlgoRunner {
  private readonly state: RunnerState;
  private readonly deps: RunnerDeps & { now: () => number };
  private cancelled = false;

  constructor(parent: ParentOrder, deps: RunnerDeps) {
    const algo = getAlgo(parent.params?.['algo'] as AlgoKind ?? 'twap');
    const schedule = algo.schedule(parent);
    const now = deps.now ?? (() => Date.now());
    this.deps = { ...deps, now };
    this.state = {
      parent,
      algo,
      schedule,
      notes: [],
      state: 'pending',
      progress: {
        parentId: parent.id ?? `parent-${now()}`,
        totalQuantity: parent.quantity,
        filledQuantity: 0,
        childCount: schedule.length,
        filledChildCount: 0,
        averageFillPrice: 0,
        slippageBps: 0,
        totalCommission: 0,
        startedAtMs: now(),
        updatedAtMs: now(),
        state: 'pending',
      },
    };
    if (schedule.length === 0 && parent.quantity > 0) {
      this.state.notes.push('Algo produced empty schedule; check session window / duration');
    }
  }

  get progress(): AlgoProgress { return this.state.progress; }
  get parent(): ParentOrder { return this.state.parent; }
  get currentState(): RunnerState['state'] { return this.state.state; }

  cancel(): void {
    this.cancelled = true;
    this.state.state = 'cancelled';
    this.state.progress.state = 'cancelled';
    this.state.notes.push('Cancelled by user');
    this.emit('trading.algo.cancelled', this.state.progress);
  }

  /**
   * Drive the runner forward in time. Callers typically invoke this in a
   * setInterval loop with the desired cadence (e.g. 1s). Returns true if
   * the runner is still active (more ticks needed), false if done.
   */
  async tick(): Promise<boolean> {
    if (this.cancelled) return false;
    const now = this.deps.now();
    this.state.state = 'running';
    this.state.progress.state = 'running';

    let anySubmitted = false;
    for (const child of this.state.schedule) {
      if (child.order) continue; // already submitted
      if (child.scheduledAtMs > now) break; // future schedule, stop
      await this.submitChild(child);
      anySubmitted = true;
    }

    this.recomputeProgress();
    if (this.allFilled()) {
      this.state.state = 'completed';
      this.state.progress.state = 'completed';
      this.emit('trading.algo.completed', this.finalReport());
      return false;
    }
    if (anySubmitted) this.emit('trading.algo.progress', this.state.progress);
    return true;
  }

  /** Block until the runner is done (or cancelled / failed). */
  async runUntilDone(pollMs = 1_000): Promise<AlgoReport> {
    const sleep = this.deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    while (await this.tick()) {
      await sleep(pollMs);
    }
    return this.finalReport();
  }

  finalReport(): AlgoReport {
    return {
      ...this.state.progress,
      children: [...this.state.schedule],
      notes: [...this.state.notes],
    };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async submitChild(child: ChildOrder): Promise<void> {
    const parent = this.state.parent;
    try {
      const submitted = await this.deps.broker.placeOrder({
        symbol: parent.symbol,
        side: parent.side,
        type: parent.childOrderType ?? 'market',
        quantity: child.quantity,
        ...(parent.childLimitPrice !== undefined
          ? { price: parent.childLimitPrice }
          : {}),
        metadata: {
          algo: this.state.algo.kind,
          parentId: this.state.progress.parentId,
          sequence: child.sequence,
        },
      });
      child.order = submitted;
      // For market orders in sandbox, placeOrder returns a filled order
      // synchronously. For limit orders we treat "filled" as final.
      if (submitted.status === 'filled' || submitted.status === 'partial') {
        child.filledAtMs = this.deps.now();
        child.fillPrice = submitted.avgFillPrice ?? submitted.price ?? 0;
      }
      this.emit('trading.algo.child_filled', { parentId: this.state.progress.parentId, child });
    } catch (err) {
      this.state.notes.push(`Child ${child.sequence} failed: ${(err as Error).message}`);
      this.emit('trading.algo.child_failed', { parentId: this.state.progress.parentId, child, error: (err as Error).message });
    } finally {
      // Mark the child as attempted regardless of success/failure so the
      // runner can detect completion when all eligible children have been
      // processed (and the rest are in the future).
      (child as ChildOrder & { _attempted?: boolean })._attempted = true;
    }
  }

  private allFilled(): boolean {
    if (this.state.schedule.length === 0) return false;
    const now = this.deps.now();
    // Runner is "done" only when the latest scheduled time has passed AND
    // every child has been attempted (success or failure). This avoids
    // spuriously reporting "completed" when no children are past-due yet,
    // and avoids looping forever when broker errors leave children
    // un-attempted.
    const latest = this.state.schedule.reduce((m, c) => Math.max(m, c.scheduledAtMs), 0);
    if (latest > now) return false;
    return this.state.schedule.every(
      c => (c as ChildOrder & { _attempted?: boolean })._attempted === true,
    );
  }

  private recomputeProgress(): void {
    const filled = this.state.schedule.filter(c => c.order?.status === 'filled');
    const filledQty = filled.reduce((acc, c) => acc + c.order!.filledQuantity, 0);
    const filledNotional = filled.reduce(
      (acc, c) => acc + c.order!.filledQuantity * (c.order!.avgFillPrice ?? 0),
      0,
    );
    const commission = filled.reduce((acc, c) => acc + (c.order!.commission ?? 0), 0);
    const avg = filledQty > 0 ? filledNotional / filledQty : 0;
    const ref = this.state.parent.referencePrice;
    const slippageBps = ref && avg > 0
      ? Math.round(((avg - ref) / ref) * 10_000 * (this.state.parent.side === 'buy' ? 1 : -1))
      : 0;
    this.state.progress = {
      ...this.state.progress,
      filledQuantity: filledQty,
      filledChildCount: filled.length,
      averageFillPrice: avg,
      slippageBps,
      totalCommission: commission,
      updatedAtMs: this.deps.now(),
    };
  }

  private emit(topic: string, payload: unknown): void {
    this.deps.onEvent?.(topic, payload);
  }
}

// Re-export the Order type for convenience in callers that consume reports.
export type { Order };
