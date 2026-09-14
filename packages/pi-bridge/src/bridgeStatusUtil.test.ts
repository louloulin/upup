import { describe, test, expect, beforeEach } from 'bun:test';
import {
  canTransition,
  nextStates,
  BridgeStatusTracker,
  abbreviateActivity,
  timestamp,
  TOOL_DISPLAY_EXPIRY_MS,
} from './bridgeStatusUtil.js';

describe('bridgeStatusUtil — canTransition', () => {
  test('same-state is always allowed (idempotent)', () => {
    expect(canTransition('idle', 'idle')).toBe(true);
    expect(canTransition('attached', 'attached')).toBe(true);
    expect(canTransition('failed', 'failed')).toBe(true);
  });

  test('idle can go to attached/reconnecting/failed', () => {
    expect(canTransition('idle', 'attached')).toBe(true);
    expect(canTransition('idle', 'reconnecting')).toBe(true);
    expect(canTransition('idle', 'failed')).toBe(true);
  });

  test('idle cannot jump directly to titled', () => {
    expect(canTransition('idle', 'titled')).toBe(false);
  });

  test('attached can go to titled/reconnecting/failed/idle', () => {
    expect(canTransition('attached', 'titled')).toBe(true);
    expect(canTransition('attached', 'reconnecting')).toBe(true);
    expect(canTransition('attached', 'failed')).toBe(true);
    expect(canTransition('attached', 'idle')).toBe(true);
  });

  test('titled can go to reconnecting/failed/idle/attached (back to attached for follow-up)', () => {
    expect(canTransition('titled', 'reconnecting')).toBe(true);
    expect(canTransition('titled', 'failed')).toBe(true);
    expect(canTransition('titled', 'idle')).toBe(true);
    expect(canTransition('titled', 'attached')).toBe(true);
  });

  test('reconnecting can recover to attached or fail to failed/idle', () => {
    expect(canTransition('reconnecting', 'attached')).toBe(true);
    expect(canTransition('reconnecting', 'failed')).toBe(true);
    expect(canTransition('reconnecting', 'idle')).toBe(true);
  });

  test('reconnecting cannot skip to titled (must re-attach first)', () => {
    expect(canTransition('reconnecting', 'titled')).toBe(false);
  });

  test('failed can only recover to idle (terminal otherwise)', () => {
    expect(canTransition('failed', 'idle')).toBe(true);
    expect(canTransition('failed', 'attached')).toBe(false);
    expect(canTransition('failed', 'titled')).toBe(false);
    expect(canTransition('failed', 'reconnecting')).toBe(false);
  });
});

describe('bridgeStatusUtil — nextStates', () => {
  test('lists the right transitions per state', () => {
    expect(nextStates('idle')).toEqual(['attached', 'reconnecting', 'failed']);
    expect(nextStates('attached')).toEqual(['titled', 'reconnecting', 'failed', 'idle']);
    expect(nextStates('failed')).toEqual(['idle']);
  });
});

describe('bridgeStatusUtil — BridgeStatusTracker', () => {
  let tracker: BridgeStatusTracker;

  beforeEach(() => {
    tracker = new BridgeStatusTracker();
  });

  test('initial state is idle', () => {
    expect(tracker.state).toBe('idle');
    expect(tracker.lastToolStartAt).toBe(0);
  });

  test('valid transition updates state and timestamp', () => {
    const t0 = tracker.lastTransitionAt;
    tracker.transition('attached');
    expect(tracker.state).toBe('attached');
    expect(tracker.lastTransitionAt).toBeGreaterThanOrEqual(t0);
  });

  test('invalid transition throws', () => {
    expect(() => tracker.transition('titled')).toThrow(/invalid transition idle → titled/);
    expect(tracker.state).toBe('idle');
  });

  test('failed → attached throws, failed → idle works', () => {
    tracker.transition('failed');
    expect(() => tracker.transition('attached')).toThrow();
    tracker.transition('idle');
    expect(tracker.state).toBe('idle');
  });

  test('markToolStart sets lastToolStartAt', () => {
    expect(tracker.lastToolStartAt).toBe(0);
    tracker.markToolStart();
    expect(tracker.lastToolStartAt).toBeGreaterThan(0);
    expect(tracker.isToolDisplayActive()).toBe(true);
  });

  test('toolDisplayAgeMs is 0 before any tool starts', () => {
    expect(tracker.toolDisplayAgeMs()).toBe(0);
  });

  test('toolDisplayAgeMs returns delta after markToolStart', () => {
    tracker.markToolStart();
    // Just a quick check; exact value depends on timing
    const age = tracker.toolDisplayAgeMs();
    expect(age).toBeGreaterThanOrEqual(0);
    expect(age).toBeLessThan(TOOL_DISPLAY_EXPIRY_MS);
  });

  test('snapshot reflects current state', () => {
    tracker.transition('attached');
    tracker.transition('titled');
    tracker.markToolStart();
    const snap = tracker.snapshot();
    expect(snap.state).toBe('titled');
    expect(snap.lastToolStartAt).toBeGreaterThan(0);
    expect(snap.toolDisplayActive).toBe(true);
  });

  test('reset() goes back to idle and clears tool state', () => {
    tracker.transition('attached');
    tracker.transition('titled');
    tracker.markToolStart();
    tracker.reset();
    expect(tracker.state).toBe('idle');
    expect(tracker.lastToolStartAt).toBe(0);
  });
});

describe('bridgeStatusUtil — abbreviateActivity', () => {
  test('returns original if shorter than maxWidth', () => {
    expect(abbreviateActivity('short', 30)).toBe('short');
  });

  test('returns original if exactly maxWidth', () => {
    expect(abbreviateActivity('12345', 5)).toBe('12345');
  });

  test('truncates with ellipsis when longer than maxWidth', () => {
    const result = abbreviateActivity('this is a long activity summary', 10);
    expect(result.length).toBe(10);
    expect(result.endsWith('\u2026')).toBe(true);
  });

  test('handles edge case maxWidth=0', () => {
    expect(abbreviateActivity('hello', 0)).toBe('');
  });

  test('handles edge case maxWidth=1', () => {
    expect(abbreviateActivity('hello', 1)).toBe('h');
  });

  test('default maxWidth is 30', () => {
    const long = 'x'.repeat(100);
    const result = abbreviateActivity(long);
    expect(result.length).toBe(30);
  });
});

describe('bridgeStatusUtil — timestamp', () => {
  test('returns HH:MM:SS format', () => {
    const ts = timestamp();
    expect(ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});
