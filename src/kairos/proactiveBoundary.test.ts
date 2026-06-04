/**
 * Boundary tests for ProactiveState — state transition edges.
 *
 * Distinct from proactiveState.test.ts (which covers the happy paths
 * and basic methods). Boundary tests focus on:
 *   - Invalid input rejection
 *   - Illegal state transitions
 *   - Idempotency guarantees
 *   - Snapshot/copy semantics
 *   - Listener-during-dispatch safety
 */
import { describe, test, expect } from 'bun:test';
import {
  ProactiveState,
  ProactiveStateError,
  isProactiveSource,
} from './proactiveState.js';

describe('boundary — illegal state transitions', () => {
  test('activate twice throws with the existing source in the message', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    try {
      s.activate('user-setting');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ProactiveStateError);
      expect((err as Error).message).toContain('cli-flag');
    }
  });

  test('pause without activate throws', () => {
    const s = new ProactiveState();
    expect(() => s.pause()).toThrow(ProactiveStateError);
    expect(() => s.pause()).toThrow(/cannot pause: not active/);
  });

  test('resume without activate throws', () => {
    const s = new ProactiveState();
    expect(() => s.resume()).toThrow(/cannot resume: not active/);
  });

  test('pause then deactivate then resume throws', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.pause();
    s.deactivate();
    expect(() => s.resume()).toThrow(/cannot resume: not active/);
  });

  test('deactivate while paused is allowed (deactivation is a hard reset)', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.pause();
    s.deactivate();
    expect(s.isActive()).toBe(false);
    expect(s.isPaused()).toBe(false);
  });
});

describe('boundary — idempotency', () => {
  test('pause-pause emits one event, not two', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    let n = 0;
    s.subscribe(() => n++);
    s.pause();
    s.pause();
    expect(n).toBe(1);
  });

  test('resume-resume emits only one event', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.pause();
    let n = 0;
    s.subscribe(() => n++);
    s.resume();
    s.resume();
    expect(n).toBe(1);
  });

  test('setContextBlocked same value emits no event', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.setContextBlocked(true);
    let n = 0;
    s.subscribe(() => n++);
    s.setContextBlocked(true);
    expect(n).toBe(0);
  });

  test('setNextTickAt same value emits no event', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.setNextTickAt(100);
    let n = 0;
    s.subscribe(() => n++);
    s.setNextTickAt(100);
    expect(n).toBe(0);
  });
});

describe('boundary — input validation', () => {
  test('activate with unknown source throws ProactiveStateError', () => {
    const s = new ProactiveState();
    expect(() => s.activate('not-a-source' as never)).toThrow(ProactiveStateError);
  });

  test('setContextBlocked with truthy non-boolean throws', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    for (const bad of ['yes', 1, null, undefined, {}, []]) {
      expect(() => s.setContextBlocked(bad as unknown as boolean)).toThrow(ProactiveStateError);
    }
  });

  test('setNextTickAt with NaN / Infinity / non-number throws', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    expect(() => s.setNextTickAt(NaN)).toThrow(ProactiveStateError);
    expect(() => s.setNextTickAt(Infinity)).toThrow(ProactiveStateError);
    expect(() => s.setNextTickAt('soon' as unknown as number)).toThrow(ProactiveStateError);
  });

  test('subscribe with non-function throws', () => {
    const s = new ProactiveState();
    for (const bad of [null, undefined, 'fn', 42, {}]) {
      expect(() => s.subscribe(bad as unknown as () => void)).toThrow(ProactiveStateError);
    }
  });
});

describe('boundary — snapshot copy semantics', () => {
  test('mutating snapshot does not affect state', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    s.setNextTickAt(1_700_000_000_000);
    const snap = s.snapshot();
    // Try to mutate
    (snap as { active: boolean }).active = false;
    (snap as { source: string }).source = 'mutated';
    (snap as { nextTickAt: number | null }).nextTickAt = null;
    // State unchanged
    expect(s.isActive()).toBe(true);
    expect(s.getSource()).toBe('cli-flag');
    expect(s.getNextTickAt()).toBe(1_700_000_000_000);
  });

  test('listenerCount is the live count, not snapshotted at subscribe-time', () => {
    const s = new ProactiveState();
    const snap1 = s.snapshot();
    expect(snap1.listenerCount).toBe(0);
    s.subscribe(() => {});
    // snap1 still says 0 (it's a copy)
    expect(snap1.listenerCount).toBe(0);
    expect(s.snapshot().listenerCount).toBe(1);
  });
});

describe('boundary — listener-during-dispatch', () => {
  test('listener that calls activate during a state-change event runs in fresh event loop tick', () => {
    // Listener calls deactivate on the FIRST emit (activate), then re-activates
    // on the SECOND emit (deactivate). The state machine should not corrupt.
    const s = new ProactiveState();
    let phase = 0;
    s.subscribe((snap) => {
      phase++;
      if (phase === 1) {
        // First emit: activate happened. We can safely deactivate now.
        s.deactivate();
      } else if (phase === 2) {
        // Second emit: deactivate happened. Re-activate.
        s.activate('cli-flag');
      }
    });
    s.activate('cli-flag');
    // After all events, state should be active + cli-flag
    expect(s.isActive()).toBe(true);
    expect(s.getSource()).toBe('cli-flag');
  });

  test('listener that throws does not prevent other listeners from running', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    let count = 0;
    s.subscribe(() => { throw new Error('listener 1 boom'); });
    s.subscribe(() => { count++; });
    // Suppress stderr noise during the test
    const origWrite = process.stderr.write.bind(process.stderr);
    (process.stderr as unknown as { write: (s: string) => boolean }).write = () => true;
    try {
      s.pause();
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(count).toBe(1);
  });
});

describe('boundary — isProactiveSource', () => {
  test('all 6 known sources return true', () => {
    const all = ['cli-flag', 'env-var', 'user-setting', 'feature-gate', 'system-default', 'runtime'];
    for (const s of all) {
      expect(isProactiveSource(s)).toBe(true);
    }
  });

  test('rejects case variations, whitespace, and unknown strings', () => {
    for (const s of ['CLI-FLAG', 'cli_flag', ' cli-flag ', '', 'cli-flagx', 'user-Setting']) {
      expect(isProactiveSource(s)).toBe(false);
    }
  });
});
