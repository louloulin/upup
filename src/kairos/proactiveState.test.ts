import { describe, test, expect, beforeEach } from 'bun:test';
import {
  ProactiveState,
  ProactiveStateError,
  resolveAutonomyMode,
  readProactiveEnv,
  isProactiveSource,
  type ProactiveSnapshot,
} from './proactiveState.js';

describe('ProactiveState — initial state', () => {
  test('starts inactive, unpaused, unblocked, no source, no tick', () => {
    const s = new ProactiveState();
    const snap = s.snapshot();
    expect(snap.active).toBe(false);
    expect(snap.paused).toBe(false);
    expect(snap.contextBlocked).toBe(false);
    expect(snap.nextTickAt).toBeNull();
    expect(snap.source).toBeNull();
    expect(snap.listenerCount).toBe(0);
  });

  test('shouldRun returns false when not active', () => {
    const s = new ProactiveState();
    expect(s.shouldRun()).toBe(false);
  });
});

describe('ProactiveState — activate / deactivate', () => {
  let s: ProactiveState;
  beforeEach(() => {
    s = new ProactiveState();
  });

  test('activate sets active=true, paused=false, source=given', () => {
    s.activate('cli-flag');
    expect(s.isActive()).toBe(true);
    expect(s.isPaused()).toBe(false);
    expect(s.getSource()).toBe('cli-flag');
  });

  test('activate throws when already active', () => {
    s.activate('cli-flag');
    expect(() => s.activate('env-var')).toThrow(ProactiveStateError);
    expect(() => s.activate('env-var')).toThrow(/already active/);
  });

  test('activate throws on unknown source', () => {
    expect(() => s.activate('bogus' as never)).toThrow(/unknown source/);
  });

  test('deactivate is a no-op when not active', () => {
    s.deactivate(); // no throw
    expect(s.isActive()).toBe(false);
  });

  test('deactivate clears active, paused, source, nextTickAt', () => {
    s.activate('cli-flag');
    s.setNextTickAt(1_700_000_000_000);
    s.pause();
    s.deactivate();
    expect(s.isActive()).toBe(false);
    expect(s.isPaused()).toBe(false);
    expect(s.getSource()).toBeNull();
    expect(s.getNextTickAt()).toBeNull();
  });

  test('can re-activate after deactivation', () => {
    s.activate('cli-flag');
    s.deactivate();
    s.activate('user-setting');
    expect(s.getSource()).toBe('user-setting');
  });

  test('activate resets paused to false (re-activation clears stale pause)', () => {
    s.activate('cli-flag');
    s.pause();
    s.deactivate();
    s.activate('cli-flag');
    expect(s.isPaused()).toBe(false);
  });
});

describe('ProactiveState — pause / resume', () => {
  let s: ProactiveState;
  beforeEach(() => {
    s = new ProactiveState();
    s.activate('cli-flag');
  });

  test('pause sets paused=true', () => {
    s.pause();
    expect(s.isPaused()).toBe(true);
    expect(s.shouldRun()).toBe(false);
  });

  test('pause is idempotent (no double-emit)', () => {
    const events: ProactiveSnapshot[] = [];
    s.subscribe((snap) => events.push(snap));
    s.pause();
    s.pause();
    expect(events.length).toBe(1);
  });

  test('pause throws when not active', () => {
    s.deactivate();
    expect(() => s.pause()).toThrow(/cannot pause: not active/);
  });

  test('resume sets paused=false', () => {
    s.pause();
    s.resume();
    expect(s.isPaused()).toBe(false);
    expect(s.shouldRun()).toBe(true);
  });

  test('resume is idempotent', () => {
    s.pause();
    s.resume();
    s.resume();
    expect(s.isPaused()).toBe(false);
  });

  test('resume throws when not active', () => {
    s.pause();
    s.deactivate();
    expect(() => s.resume()).toThrow(/cannot resume: not active/);
  });
});

describe('ProactiveState — contextBlocked', () => {
  let s: ProactiveState;
  beforeEach(() => {
    s = new ProactiveState();
    s.activate('cli-flag');
  });

  test('setContextBlocked gates shouldRun', () => {
    expect(s.shouldRun()).toBe(true);
    s.setContextBlocked(true);
    expect(s.isContextBlocked()).toBe(true);
    expect(s.shouldRun()).toBe(false);
    s.setContextBlocked(false);
    expect(s.shouldRun()).toBe(true);
  });

  test('setContextBlocked is idempotent on same value', () => {
    const events: ProactiveSnapshot[] = [];
    s.subscribe((snap) => events.push(snap));
    s.setContextBlocked(true);
    s.setContextBlocked(true);
    expect(events.length).toBe(1);
  });

  test('setContextBlocked throws on non-boolean', () => {
    expect(() => s.setContextBlocked('yes' as unknown as boolean)).toThrow(/must be boolean/);
  });
});

describe('ProactiveState — nextTickAt', () => {
  let s: ProactiveState;
  beforeEach(() => {
    s = new ProactiveState();
  });

  test('setNextTickAt accepts a finite number', () => {
    s.setNextTickAt(1_700_000_000_000);
    expect(s.getNextTickAt()).toBe(1_700_000_000_000);
  });

  test('setNextTickAt(null) clears', () => {
    s.setNextTickAt(1_700_000_000_000);
    s.setNextTickAt(null);
    expect(s.getNextTickAt()).toBeNull();
  });

  test('setNextTickAt is idempotent on same value', () => {
    const events: ProactiveSnapshot[] = [];
    s.subscribe((snap) => events.push(snap));
    s.setNextTickAt(100);
    s.setNextTickAt(100);
    expect(events.length).toBe(1);
  });

  test('setNextTickAt throws on NaN/Infinity/non-number', () => {
    expect(() => s.setNextTickAt(NaN)).toThrow();
    expect(() => s.setNextTickAt(Infinity)).toThrow();
    expect(() => s.setNextTickAt('soon' as unknown as number)).toThrow();
  });
});

describe('ProactiveState — shouldRun gate', () => {
  test('all three conditions must hold: active + !paused + !contextBlocked', () => {
    const s = new ProactiveState();
    expect(s.shouldRun()).toBe(false);
    s.activate('cli-flag');
    expect(s.shouldRun()).toBe(true);
    s.pause();
    expect(s.shouldRun()).toBe(false);
    s.resume();
    expect(s.shouldRun()).toBe(true);
    s.setContextBlocked(true);
    expect(s.shouldRun()).toBe(false);
    s.setContextBlocked(false);
    expect(s.shouldRun()).toBe(true);
  });
});

describe('ProactiveState — subscribe', () => {
  let s: ProactiveState;
  beforeEach(() => {
    s = new ProactiveState();
  });

  test('subscribe returns an unsubscribe function', () => {
    const cb = () => {};
    const unsub = s.subscribe(cb);
    expect(s.listenerCount()).toBe(1);
    unsub();
    expect(s.listenerCount()).toBe(0);
  });

  test('listener receives snap + prev on every change', () => {
    s.activate('cli-flag');
    const events: Array<{ snap: ProactiveSnapshot; prev: ProactiveSnapshot }> = [];
    s.subscribe((snap, prev) => events.push({ snap, prev }));
    s.pause();
    s.setContextBlocked(true);
    s.setNextTickAt(1_700_000_000_000);
    expect(events.length).toBe(3);
    expect(events[0]!.snap.paused).toBe(true);
    expect(events[0]!.prev.paused).toBe(false);
    expect(events[1]!.snap.contextBlocked).toBe(true);
    expect(events[2]!.snap.nextTickAt).toBe(1_700_000_000_000);
  });

  test('subscribe throws on non-function listener', () => {
    expect(() => s.subscribe('not a fn' as unknown as () => void)).toThrow();
  });

  test('listener that throws does not break subsequent listeners', () => {
    s.activate('cli-flag');
    let goodCalled = 0;
    s.subscribe(() => { throw new Error('boom'); });
    s.subscribe(() => { goodCalled++; });
    // Capture stderr to keep test output clean
    const origWrite = process.stderr.write.bind(process.stderr);
    let captured = '';
    (process.stderr as unknown as { write: (s: string) => boolean }).write = (s: string) => {
      captured += s;
      return true;
    };
    try {
      s.pause();
    } finally {
      (process.stderr as unknown as { write: typeof origWrite }).write = origWrite;
    }
    expect(goodCalled).toBe(1);
    expect(captured).toContain('boom');
  });

  test('listener that unsubscribes during dispatch is skipped on subsequent emits', () => {
    s.activate('cli-flag');
    let count = 0;
    let unsub: (() => void) | null = null;
    unsub = s.subscribe(() => {
      count++;
      if (unsub) unsub();
    });
    s.pause();
    s.resume();
    expect(count).toBe(1);
  });
});

describe('ProactiveState — snapshot', () => {
  test('snapshot is a value-copy (mutations to caller do not affect state)', () => {
    const s = new ProactiveState();
    s.activate('cli-flag');
    const snap = s.snapshot();
    snap.active = false; // mutating copy
    expect(s.isActive()).toBe(true); // state unchanged
  });

  test('listenerCount in snapshot reflects current count', () => {
    const s = new ProactiveState();
    expect(s.snapshot().listenerCount).toBe(0);
    const u1 = s.subscribe(() => {});
    expect(s.snapshot().listenerCount).toBe(1);
    const u2 = s.subscribe(() => {});
    expect(s.snapshot().listenerCount).toBe(2);
    u1();
    expect(s.snapshot().listenerCount).toBe(1);
    u2();
    expect(s.snapshot().listenerCount).toBe(0);
  });
});

describe('resolveAutonomyMode', () => {
  test('assistantEnabled=false → disabled (no matter what else)', () => {
    expect(resolveAutonomyMode({ assistantEnabled: false, proactiveFlag: true, proactiveEnv: 'true' })).toBe('disabled');
    expect(resolveAutonomyMode({ assistantEnabled: false, proactiveFlag: null, proactiveEnv: null })).toBe('disabled');
  });

  test('env=true beats user flag', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: false, proactiveEnv: 'true' })).toBe('proactive');
  });

  test('env=false beats user flag', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: true, proactiveEnv: 'false' })).toBe('passive');
  });

  test('env accepts common truthy variants', () => {
    for (const v of ['true', 'TRUE', 'True', '1', 'yes', 'YES', 'on', 'ON']) {
      expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: null, proactiveEnv: v })).toBe('proactive');
    }
  });

  test('env accepts common falsy variants', () => {
    for (const v of ['false', 'FALSE', 'False', '0', 'no', 'NO', 'off', 'OFF']) {
      expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: null, proactiveEnv: v })).toBe('passive');
    }
  });

  test('user flag true when env unset → proactive', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: true, proactiveEnv: null })).toBe('proactive');
  });

  test('user flag false when env unset → passive', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: false, proactiveEnv: null })).toBe('passive');
  });

  test('no flag, no env → manual', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: null, proactiveEnv: null })).toBe('manual');
  });

  test('unrecognized env values fall through to flag/default', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: true, proactiveEnv: 'maybe' })).toBe('proactive');
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: false, proactiveEnv: 'maybe' })).toBe('passive');
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: null, proactiveEnv: 'maybe' })).toBe('manual');
  });

  test('env value with whitespace is trimmed', () => {
    expect(resolveAutonomyMode({ assistantEnabled: true, proactiveFlag: null, proactiveEnv: '  true  ' })).toBe('proactive');
  });
});

describe('readProactiveEnv', () => {
  test('returns null when env var unset', () => {
    const saved = process.env.UPUP_PROACTIVE;
    delete process.env.UPUP_PROACTIVE;
    try {
      expect(readProactiveEnv()).toBeNull();
    } finally {
      if (saved !== undefined) process.env.UPUP_PROACTIVE = saved;
    }
  });

  test('returns "true" for truthy values', () => {
    for (const v of ['true', 'TRUE', '1', 'yes', 'on']) {
      process.env.UPUP_PROACTIVE = v;
      expect(readProactiveEnv()).toBe('true');
    }
  });

  test('returns "false" for falsy values', () => {
    for (const v of ['false', 'FALSE', '0', 'no', 'off']) {
      process.env.UPUP_PROACTIVE = v;
      expect(readProactiveEnv()).toBe('false');
    }
  });

  test('returns null for unrecognized values', () => {
    process.env.UPUP_PROACTIVE = 'maybe';
    expect(readProactiveEnv()).toBeNull();
  });

  test('accepts custom env key', () => {
    process.env.MY_TEST_PROACTIVE = 'true';
    try {
      expect(readProactiveEnv('MY_TEST_PROACTIVE')).toBe('true');
    } finally {
      delete process.env.MY_TEST_PROACTIVE;
    }
  });
});

describe('isProactiveSource', () => {
  test('accepts known sources', () => {
    for (const s of ['cli-flag', 'env-var', 'user-setting', 'feature-gate', 'system-default', 'runtime']) {
      expect(isProactiveSource(s)).toBe(true);
    }
  });

  test('rejects unknown', () => {
    expect(isProactiveSource('unknown')).toBe(false);
    expect(isProactiveSource('')).toBe(false);
  });
});
