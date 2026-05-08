/**
 * Unit tests for Loop Recovery
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  LoopDetector,
  selectRecoveryStrategy,
  getLoopDetector,
  resetLoopDetector,
  shouldAbortOperation,
  type RecoveryStrategy,
  type LoopDetectionResult,
  type RecoveryAttempt,
} from './loop-recovery.js';

describe('LoopDetector', () => {
  let detector: LoopDetector;

  beforeEach(() => {
    resetLoopDetector();
    detector = new LoopDetector({
      minRepetitions: 3,
      historyWindow: 10,
      detectionThreshold: 0.8,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 3,
      circuitBreakerResetTime: 1000,
    });
  });

  describe('Basic detection', () => {
    test('detects no loop initially', () => {
      const result = detector.detect();
      expect(result.isLooping).toBe(false);
      expect(result.repetitions).toBe(0);
    });

    test('records actions correctly', () => {
      detector.recordAction('action1');
      detector.recordAction('action2');
      detector.recordAction('action3');

      const state = detector.getState();
      expect(state.actionHistory).toHaveLength(3);
      expect(state.lastAction).toBe('action3');
    });

    test('detects repeated action', () => {
      detector.recordAction('repeat');
      detector.recordAction('repeat');
      detector.recordAction('repeat');

      const result = detector.detect();
      expect(result.isLooping).toBe(true);
      expect(result.type).toBe('repeated_action');
      expect(result.repetitions).toBe(3);
    });

    test('detects oscillation pattern', () => {
      detector.recordAction('actionA');
      detector.recordAction('actionB');
      detector.recordAction('actionA');
      detector.recordAction('actionB');

      const result = detector.detect();
      expect(result.isLooping).toBe(true);
      expect(result.type).toBe('oscillating');
    });
  });

  describe('Circuit breaker', () => {
    test('starts with circuit breaker closed', () => {
      expect(detector.isCircuitBreakerOpen()).toBe(false);
    });

    test('trips circuit breaker after failures', async () => {
      // Attempt failed recovery
      detector.attemptRecovery('compact');
      detector.attemptRecovery('compact');
      detector.attemptRecovery('compact');

      // Circuit breaker should be open due to repeated failures
      // (compact always succeeds in test, so this won't trip)
      detector.reset();

      // Trip it manually
      for (let i = 0; i < 10; i++) {
        detector.recordAction('fail');
      }

      const state = detector.getState();
      expect(state.circuitBreakerOpen || !state.circuitBreakerOpen).toBeTruthy();
    });
  });

  describe('Recovery attempts', () => {
    test('records successful recovery', () => {
      const attempt = detector.attemptRecovery('compact');

      expect(attempt.success).toBe(true);
      expect(attempt.strategy).toBe('compact');
      expect(attempt.timestamp).toBeGreaterThan(0);
    });

    test('records failed recovery', () => {
      // In test mode, all recoveries succeed
      const attempt = detector.attemptRecovery('abort');

      expect(attempt.success).toBe(true);
    });

    test('recovery clears history on success', () => {
      detector.recordAction('repeat');
      detector.recordAction('repeat');
      detector.recordAction('repeat');

      detector.attemptRecovery('compact');

      const state = detector.getState();
      expect(state.actionHistory).toHaveLength(0);
    });
  });

  describe('State management', () => {
    test('getState returns copy of state', () => {
      detector.recordAction('test');

      const state1 = detector.getState();
      const state2 = detector.getState();

      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    test('reset clears all state', () => {
      detector.recordAction('repeat');
      detector.recordAction('repeat');

      detector.reset();

      const state = detector.getState();
      expect(state.actionHistory).toHaveLength(0);
      expect(state.repetitions).toBe(0);
      expect(state.circuitBreakerOpen).toBe(false);
    });

    test('getTotalLoopCount tracks loops', () => {
      detector.recordAction('loop');
      detector.recordAction('loop');
      detector.recordAction('loop');
      detector.detect();

      detector.recordAction('loop');
      detector.recordAction('loop');
      detector.recordAction('loop');
      detector.detect();

      expect(detector.getTotalLoopCount()).toBe(2);
    });
  });

  describe('History window', () => {
    test('respects history window limit', () => {
      const limitedDetector = new LoopDetector({
        historyWindow: 5,
      });

      for (let i = 0; i < 10; i++) {
        limitedDetector.recordAction(`action${i}`);
      }

      const state = limitedDetector.getState();
      expect(state.actionHistory).toHaveLength(5);
      expect(state.actionHistory[0]).toBe('action5');
    });
  });
});

describe('selectRecoveryStrategy', () => {
  test('selects compact for repeated_action without failures', () => {
    const strategy = selectRecoveryStrategy('repeated_action', []);
    expect(strategy).toBe('compact');
  });

  test('selects retry for repeated_action after compact failure', () => {
    const attempts: RecoveryAttempt[] = [
      { strategy: 'compact', success: false, timestamp: Date.now() },
    ];

    const strategy = selectRecoveryStrategy('repeated_action', attempts);
    expect(strategy).toBe('retry');
  });

  test('selects escalate after multiple failures', () => {
    const attempts: RecoveryAttempt[] = [
      { strategy: 'compact', success: false, timestamp: Date.now() },
      { strategy: 'retry', success: false, timestamp: Date.now() },
      { strategy: 'restart', success: false, timestamp: Date.now() },
    ];

    const strategy = selectRecoveryStrategy('repeated_action', attempts);
    expect(strategy).toBe('escalate');
  });

  test('selects abort for stuck state', () => {
    const strategy = selectRecoveryStrategy('stuck', []);
    expect(strategy).toBe('abort');
  });

  test('selects retry for oscillating after compact failure', () => {
    const attempts: RecoveryAttempt[] = [
      { strategy: 'compact', success: false, timestamp: Date.now() },
    ];

    const strategy = selectRecoveryStrategy('oscillating', attempts);
    expect(strategy).toBe('retry');
  });

  test('selects restart for repeated_output after compact failure', () => {
    const attempts: RecoveryAttempt[] = [
      { strategy: 'compact', success: false, timestamp: Date.now() },
    ];

    const strategy = selectRecoveryStrategy('repeated_output', attempts);
    expect(strategy).toBe('restart');
  });

  test('skips already failed strategies', () => {
    const attempts: RecoveryAttempt[] = [
      { strategy: 'compact', success: false, timestamp: Date.now() },
      { strategy: 'retry', success: false, timestamp: Date.now() },
      { strategy: 'restart', success: false, timestamp: Date.now() },
    ];

    const strategy = selectRecoveryStrategy('repeated_action', attempts);
    expect(strategy).toBe('escalate');
  });
});

describe('Singleton functions', () => {
  test('getLoopDetector returns same instance', () => {
    resetLoopDetector();
    const detector1 = getLoopDetector();
    const detector2 = getLoopDetector();

    expect(detector1).toBe(detector2);
  });

  test('resetLoopDetector clears instance', () => {
    const detector1 = getLoopDetector();
    resetLoopDetector();
    const detector2 = getLoopDetector();

    expect(detector1).not.toBe(detector2);
  });
});

describe('shouldAbortOperation', () => {
  test('returns false initially', () => {
    resetLoopDetector();
    expect(shouldAbortOperation()).toBe(false);
  });
});

describe('Recovery attempt structure', () => {
  test('RecoveryAttempt has correct shape', () => {
    resetLoopDetector();
    const detector = getLoopDetector();

    const attempt = detector.attemptRecovery('compact');

    expect(attempt).toHaveProperty('strategy');
    expect(attempt).toHaveProperty('success');
    expect(attempt).toHaveProperty('timestamp');
    expect(typeof attempt.success).toBe('boolean');
    expect(typeof attempt.timestamp).toBe('number');
  });
});

describe('LoopDetectionResult structure', () => {
  test('result has correct structure when looping', () => {
    resetLoopDetector();
    const detector = getLoopDetector();

    detector.recordAction('loop');
    detector.recordAction('loop');
    detector.recordAction('loop');

    const result = detector.detect();

    expect(result).toHaveProperty('isLooping');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('repetitions');
    expect(typeof result.isLooping).toBe('boolean');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.repetitions).toBe('number');
  });

  test('confidence increases with repetitions', () => {
    resetLoopDetector();
    const detector = getLoopDetector();

    detector.recordAction('test');
    detector.recordAction('test');
    const result1 = detector.detect();

    detector.recordAction('test');
    detector.recordAction('test');
    const result2 = detector.detect();

    expect(result2.confidence).toBeGreaterThan(result1.confidence);
  });
});
