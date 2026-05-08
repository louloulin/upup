/**
 * Unit tests for Enhanced Rate Limiter
 */

import { describe, expect, test, beforeEach } from 'bun:test';
import {
  EnhancedRateLimiter,
  RateLimitError,
  createRateLimitedFetcher,
  getRateLimiter,
  resetRateLimiter,
} from './rate-limiter.js';

describe('EnhancedRateLimiter', () => {
  let limiter: EnhancedRateLimiter;

  beforeEach(() => {
    limiter = new EnhancedRateLimiter({
      enabled: true,
      defaultInterval: 100,
      maxBackoff: 5000,
      initialBackoff: 100,
      backoffMultiplier: 2,
    });
  });

  describe('Basic operations', () => {
    test('isEnabled returns true by default', () => {
      expect(limiter.isEnabled()).toBe(true);
    });

    test('setEnabled toggles state', () => {
      limiter.setEnabled(false);
      expect(limiter.isEnabled()).toBe(false);
      limiter.setEnabled(true);
      expect(limiter.isEnabled()).toBe(true);
    });

    test('check returns 0 when enabled and first call', async () => {
      const wait = await limiter.check('test-provider');
      expect(wait).toBe(0);
    });

    test('recordSuccess updates state', () => {
      limiter.recordSuccess('test-provider');
      const state = limiter.getStateInfo('test-provider');
      expect(state.lastCall).toBeGreaterThan(0);
    });
  });

  describe('Rate limiting', () => {
    test('records success for provider', () => {
      limiter.recordSuccess('provider1');
      const state = limiter.getStateInfo('provider1');
      expect(state.lastCall).toBeGreaterThan(0);
    });

    test('different providers have separate state', () => {
      limiter.recordSuccess('provider-a');
      limiter.recordSuccess('provider-b');

      const stateA = limiter.getStateInfo('provider-a');
      const stateB = limiter.getStateInfo('provider-b');

      expect(stateA.lastCall).toBeGreaterThan(0);
      expect(stateB.lastCall).toBeGreaterThan(0);
    });
  });

  describe('Backoff', () => {
    test('recordRateLimitError sets backoff', () => {
      limiter.recordRateLimitError('backoff-provider');

      const state = limiter.getStateInfo('backoff-provider');
      expect(state.backoffMs).toBeGreaterThan(0);
    });

    test('recordError increases backoff', () => {
      limiter.recordError('error-provider');

      const state1 = limiter.getStateInfo('error-provider');
      const backoff1 = state1.backoffMs;

      limiter.recordError('error-provider');

      const state2 = limiter.getStateInfo('error-provider');
      const backoff2 = state2.backoffMs;

      expect(backoff2).toBeGreaterThanOrEqual(backoff1);
    });

    test('check respects backoff', async () => {
      limiter.recordRateLimitError('backoff-check');

      const wait = await limiter.check('backoff-check');
      expect(wait).toBeGreaterThan(0);
    });

    test('success clears backoff', async () => {
      limiter.recordRateLimitError('success-clear');

      limiter.recordSuccess('success-clear');

      const state = limiter.getStateInfo('success-clear');
      expect(state.backoffMs).toBe(0);
    });
  });

  describe('Burst limiting', () => {
    test('tracks calls in window', () => {
      for (let i = 0; i < 5; i++) {
        limiter.recordSuccess('burst-provider');
      }

      const state = limiter.getStateInfo('burst-provider');
      expect(state.callsInWindow).toBe(5);
    });
  });

  describe('State management', () => {
    test('getStateInfo returns correct info', () => {
      limiter.recordSuccess('state-provider');

      const state = limiter.getStateInfo('state-provider');

      expect(state.lastCall).toBeGreaterThan(0);
      expect(state.callsInWindow).toBe(1);
      expect(state.backoffMs).toBe(0);
    });

    test('getProviders returns all providers', () => {
      limiter.recordSuccess('provider-a');
      limiter.recordSuccess('provider-b');

      const providers = limiter.getProviders();
      expect(providers).toContain('provider-a');
      expect(providers).toContain('provider-b');
    });

    test('reset clears provider state', () => {
      limiter.recordSuccess('reset-provider');
      limiter.reset('reset-provider');

      const state = limiter.getStateInfo('reset-provider');
      expect(state.lastCall).toBe(0);
      expect(state.callsInWindow).toBe(0);
    });

    test('reset without argument clears all', () => {
      limiter.recordSuccess('all-1');
      limiter.recordSuccess('all-2');
      limiter.reset();

      expect(limiter.getProviders()).toHaveLength(0);
    });
  });

  describe('waitForSlot', () => {
    test('completes without error', async () => {
      limiter.configure({ defaultInterval: 100 });

      // Should not throw
      await limiter.waitForSlot('wait-provider');
      await limiter.waitForSlot('wait-provider');
    });
  });

  describe('Configuration', () => {
    test('configure updates config', () => {
      limiter.configure({ defaultInterval: 500 });
      expect(limiter.isEnabled()).toBe(true); // Still enabled
    });

    test('initialBackoff from config', () => {
      const customLimiter = new EnhancedRateLimiter({
        initialBackoff: 2000,
      });

      customLimiter.recordRateLimitError('custom-backoff');

      const state = customLimiter.getStateInfo('custom-backoff');
      // Allow for slight timing variance (within 100ms)
      expect(state.backoffMs).toBeGreaterThanOrEqual(1900);
    });
  });
});

describe('RateLimitError', () => {
  test('creates error with correct properties', () => {
    const error = new RateLimitError('Rate limited', 'test-provider', 5000, 1234567890);

    expect(error.message).toBe('Rate limited');
    expect(error.provider).toBe('test-provider');
    expect(error.retryAfterMs).toBe(5000);
    expect(error.resetTime).toBe(1234567890);
    expect(error.name).toBe('RateLimitError');
  });
});

describe('Singleton', () => {
  test('getRateLimiter returns same instance', () => {
    resetRateLimiter();
    const limiter1 = getRateLimiter();
    const limiter2 = getRateLimiter();
    expect(limiter1).toBe(limiter2);
  });
});

describe('createRateLimitedFetcher', () => {
  test('creates fetcher function', () => {
    resetRateLimiter();
    const limiter = getRateLimiter();
    const fetcher = createRateLimitedFetcher('test-provider', limiter);

    expect(typeof fetcher).toBe('function');
  });
});

describe('Disabled limiter', () => {
  test('check returns 0 when disabled', async () => {
    const disabledLimiter = new EnhancedRateLimiter({ enabled: false });

    const wait = await disabledLimiter.check('any-provider');
    expect(wait).toBe(0);
  });

  test('waitForSlot returns immediately when disabled', async () => {
    const disabledLimiter = new EnhancedRateLimiter({ enabled: false });

    // Should not throw
    await disabledLimiter.waitForSlot('any-provider');
  });
});
