/**
 * QueryGuard Unit Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { QueryGuard, getQueryGuard, resetQueryGuard } from './query-guard';

// Simple mock function for bun:test
function createMockFn() {
  let called = false;
  let calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    called = true;
    calls.push(args);
  };
  fn.mock = { calls };
  fn.called = () => called;
  return fn;
}

describe('QueryGuard', () => {
  let guard: QueryGuard;

  beforeEach(() => {
    resetQueryGuard();
    guard = new QueryGuard();
  });

  describe('initial state', () => {
    it('should start in idle state', () => {
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should not be active initially', () => {
      expect(guard.isActive).toBe(false);
    });
  });

  describe('reserve()', () => {
    it('should transition from idle to dispatching', () => {
      expect(guard.reserve()).toBe(true);
      expect(guard.getSnapshot()).toBe('dispatching');
    });

    it('should return false if not idle', () => {
      guard.reserve();
      expect(guard.reserve()).toBe(false);
    });
  });

  describe('cancelReservation()', () => {
    it('should transition from dispatching to idle', () => {
      guard.reserve();
      guard.cancelReservation();
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should do nothing if not dispatching', () => {
      guard.cancelReservation();
      expect(guard.getSnapshot()).toBe('idle');
    });
  });

  describe('tryStart()', () => {
    it('should transition from idle to running', () => {
      const gen = guard.tryStart();
      expect(gen).not.toBeNull();
      expect(guard.getSnapshot()).toBe('running');
    });

    it('should transition from dispatching to running', () => {
      guard.reserve();
      const gen = guard.tryStart();
      expect(gen).not.toBeNull();
      expect(guard.getSnapshot()).toBe('running');
    });

    it('should return null if already running', () => {
      guard.tryStart();
      expect(guard.tryStart()).toBeNull();
    });

    it('should increment generation', () => {
      const gen1 = guard.tryStart();
      const gen2 = guard.tryStart();
      expect(gen1).not.toBe(gen2);
    });
  });

  describe('end()', () => {
    it('should transition from running to idle', () => {
      const gen = guard.tryStart()!;
      expect(guard.end(gen)).toBe(true);
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should return false if generation does not match', () => {
      guard.tryStart();
      expect(guard.end(999)).toBe(false);
      expect(guard.getSnapshot()).toBe('running');
    });

    it('should return false if not running', () => {
      expect(guard.end(1)).toBe(false);
    });
  });

  describe('forceEnd()', () => {
    it('should force transition to idle regardless of generation', () => {
      guard.tryStart();
      guard.forceEnd();
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should increment generation', () => {
      const gen1 = guard.tryStart()!;
      guard.forceEnd();
      const gen2 = guard.tryStart()!;
      expect(gen1).not.toBe(gen2);
    });
  });

  describe('isActive', () => {
    it('should be false when idle', () => {
      expect(guard.isActive).toBe(false);
    });

    it('should be true when dispatching', () => {
      guard.reserve();
      expect(guard.isActive).toBe(true);
    });

    it('should be true when running', () => {
      guard.tryStart();
      expect(guard.isActive).toBe(true);
    });
  });

  describe('subscribe()', () => {
    it('should notify listeners on state change', () => {
      const fn = createMockFn();
      guard.subscribe(fn);
      guard.reserve();
      expect(fn.called()).toBe(true);
    });

    it('should return unsubscribe function', () => {
      const fn = createMockFn();
      const unsubscribe = guard.subscribe(fn);
      unsubscribe();
      guard.reserve();
      expect(fn.called()).toBe(false);
    });
  });

  describe('full lifecycle', () => {
    it('should handle idle -> dispatching -> running -> idle', () => {
      expect(guard.getSnapshot()).toBe('idle');

      guard.reserve();
      expect(guard.getSnapshot()).toBe('dispatching');

      const gen = guard.tryStart()!;
      expect(guard.getSnapshot()).toBe('running');

      guard.end(gen);
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should handle idle -> running -> idle (direct)', () => {
      expect(guard.getSnapshot()).toBe('idle');

      const gen = guard.tryStart()!;
      expect(guard.getSnapshot()).toBe('running');

      guard.end(gen);
      expect(guard.getSnapshot()).toBe('idle');
    });

    it('should handle reserve -> cancel -> reserve -> tryStart', () => {
      guard.reserve();
      guard.cancelReservation();
      guard.reserve();
      const gen = guard.tryStart()!;
      expect(guard.getSnapshot()).toBe('running');
    });
  });

  describe('getQueryGuard singleton', () => {
    it('should return same instance', () => {
      const instance1 = getQueryGuard();
      const instance2 = getQueryGuard();
      expect(instance1).toBe(instance2);
    });

    it('should be fresh after reset', () => {
      const instance1 = getQueryGuard();
      resetQueryGuard();
      const instance2 = getQueryGuard();
      expect(instance1).not.toBe(instance2);
    });
  });
});
