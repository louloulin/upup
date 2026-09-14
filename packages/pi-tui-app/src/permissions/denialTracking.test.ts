/**
 * Denial Tracking Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import {
  DenialTracker,
  getDenialTracker,
  trackDenial,
  trackSuccess,
  getDenialStats,
  DENIAL_LIMITS,
} from './denialTracking'

describe('DenialTracker', () => {
  let tracker: DenialTracker

  beforeEach(() => {
    tracker = new DenialTracker({
      consecutive: 3,
      total: 10,
      timeWindowMs: 60000,
    })
  })

  describe('recordDenial', () => {
    it('should increment consecutive denials', () => {
      tracker.recordDenial('Bash')
      expect(tracker.getState().consecutiveDenials).toBe(1)
      tracker.recordDenial('Bash')
      expect(tracker.getState().consecutiveDenials).toBe(2)
    })

    it('should track recent denials', () => {
      tracker.recordDenial('Bash', 'rm -rf /', 'dangerous')
      const state = tracker.getState()
      expect(state.recentDenials.length).toBe(1)
      expect(state.recentDenials[0].toolName).toBe('Bash')
      expect(state.recentDenials[0].content).toBe('rm -rf /')
    })

    it('should update last denial time', () => {
      tracker.recordDenial('Bash')
      expect(tracker.getState().lastDenialTime).not.toBeNull()
    })
  })

  describe('recordSuccess', () => {
    it('should reset consecutive denials', () => {
      tracker.recordDenial('Bash')
      tracker.recordDenial('Bash')
      tracker.recordSuccess('Bash')
      expect(tracker.getState().consecutiveDenials).toBe(0)
    })

    it('should track successes', () => {
      tracker.recordSuccess('Bash')
      expect(tracker.getState().totalSuccesses).toBe(1)
    })
  })

  describe('shouldFallbackToPrompting', () => {
    it('should trigger after consecutive limit', () => {
      for (let i = 0; i < 3; i++) {
        tracker.recordDenial('Bash')
      }
      expect(tracker.shouldFallbackToPrompting()).toBe(true)
    })

    it('should not trigger before limit', () => {
      tracker.recordDenial('Bash')
      tracker.recordDenial('Bash')
      expect(tracker.shouldFallbackToPrompting()).toBe(false)
    })

    it('should not trigger after consecutive reset with success', () => {
      // When consecutive denials hit the limit
      for (let i = 0; i < 3; i++) {
        tracker.recordDenial('Bash')
      }
      expect(tracker.shouldFallbackToPrompting()).toBe(true)

      // Success resets consecutive counter
      tracker.recordSuccess('Bash')
      expect(tracker.shouldFallbackToPrompting()).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should calculate denial rate', () => {
      tracker.recordDenial('Bash')
      tracker.recordSuccess('Bash')
      tracker.recordSuccess('Bash')

      const stats = tracker.getStats()
      expect(stats.denialRate).toBeCloseTo(0.333, 2)
    })

    it('should track all counts', () => {
      tracker.recordDenial('Bash')
      tracker.recordDenial('Bash')
      tracker.recordSuccess('Bash')

      const stats = tracker.getStats()
      expect(stats.consecutiveDenials).toBe(0)
      expect(stats.totalDenials).toBe(2)
      expect(stats.totalSuccesses).toBe(1)
    })
  })

  describe('reset', () => {
    it('should clear all state', () => {
      tracker.recordDenial('Bash')
      tracker.recordSuccess('Bash')
      tracker.reset()

      const state = tracker.getState()
      expect(state.consecutiveDenials).toBe(0)
      expect(state.totalDenials).toBe(0)
      expect(state.totalSuccesses).toBe(0)
    })
  })

  describe('serialization', () => {
    it('should serialize and deserialize', () => {
      tracker.recordDenial('Bash', 'test command')
      const serialized = tracker.serialize()

      const newTracker = new DenialTracker()
      newTracker.deserialize(serialized)

      expect(newTracker.getState().totalDenials).toBe(1)
    })
  })

  describe('listeners', () => {
    it('should notify on state change', () => {
      let notified = false
      tracker.addListener(() => {
        notified = true
      })
      tracker.recordDenial('Bash')
      expect(notified).toBe(true)
    })

    it('should return unsubscribe function', () => {
      let callCount = 0
      const unsubscribe = tracker.addListener(() => {
        callCount++
      })

      tracker.recordDenial('Bash')
      unsubscribe()
      tracker.recordDenial('Bash')

      expect(callCount).toBe(1)
    })
  })
})

describe('Global DenialTracker', () => {
  beforeEach(() => {
    // Reset global tracker between tests
    const global = getDenialTracker()
    global.reset()
  })

  describe('trackDenial', () => {
    it('should record denial to global tracker', () => {
      trackDenial('Bash', 'dangerous command')
      const stats = getDenialStats()
      expect(stats.totalDenials).toBe(1)
    })
  })

  describe('trackSuccess', () => {
    it('should record success to global tracker', () => {
      trackSuccess('Bash')
      const stats = getDenialStats()
      expect(stats.totalSuccesses).toBe(1)
    })
  })
})

describe('DENIAL_LIMITS', () => {
  it('should have reasonable defaults', () => {
    expect(DENIAL_LIMITS.consecutive).toBe(5)
    expect(DENIAL_LIMITS.total).toBe(50)
    expect(DENIAL_LIMITS.timeWindowMs).toBe(5 * 60 * 1000)
  })
})