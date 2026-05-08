/**
 * Watchlist Tools Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  addEntry,
  removeEntry,
  getEntries,
  getEntry,
  addAlert,
  checkAlerts,
  clearAlert,
  setDataPath,
  removeEntry as removeWatchlistEntry,
} from './watchlist-tools.js';

const TEST_FILE = '/tmp/dexter-test-watchlist.json';

function freshModule() {
  setDataPath(TEST_FILE);
  // Clear in-memory cache by reading fresh
}

describe('Watchlist Core', () => {
  beforeEach(() => {
    freshModule();
  });

  it('adds a symbol to watchlist', () => {
    const result = addEntry('AAPL', 'Watching for earnings', ['tech', 'earnings']);
    expect(result.success).toBe(true);
    expect(result.entry?.symbol).toBe('AAPL');
    expect(result.entry?.tags).toContain('tech');
  });

  it('prevents duplicate symbols', () => {
    addEntry('TSLA');
    const result = addEntry('TSLA');
    expect(result.success).toBe(false);
    expect(result.message).toContain('already');
  });

  it('removes a symbol from watchlist', () => {
    addEntry('MSFT');
    const result = removeWatchlistEntry('MSFT');
    expect(result.success).toBe(true);
    expect(getEntry('MSFT')).toBeUndefined();
  });

  it('filters entries by tag', () => {
    addEntry('AAPL', undefined, ['tech']);
    addEntry('JPM', undefined, ['finance']);
    addEntry('GOOG', undefined, ['tech']);
    const entries = getEntries();
    const techEntries = Object.values(entries).filter(e => e.tags?.includes('tech'));
    expect(techEntries.length).toBe(2);
  });

  it('returns undefined for non-existent symbol', () => {
    expect(getEntry('NONEXISTENT')).toBeUndefined();
  });
});

describe('Watchlist Alerts', () => {
  beforeEach(() => {
    freshModule();
  });

  it('adds an alert to a watchlist entry', () => {
    addEntry('NVDA');
    const result = addAlert('NVDA', 'above', 150);
    expect(result.success).toBe(true);
    expect(result.alert?.type).toBe('above');
    expect(result.alert?.value).toBe(150);
  });

  it('fails to add alert for non-existent symbol', () => {
    const result = addAlert('NONEXISTENT', 'below', 100);
    expect(result.success).toBe(false);
  });

  it('triggers above alert when price exceeds threshold', () => {
    addEntry('AMD');
    addAlert('AMD', 'above', 120);
    const triggered = checkAlerts({ AMD: 125 });
    expect(triggered.length).toBe(1);
    expect(triggered[0].symbol).toBe('AMD');
    expect(triggered[0].currentPrice).toBe(125);
  });

  it('triggers below alert when price drops below threshold', () => {
    addEntry('INTC');
    addAlert('INTC', 'below', 30);
    const triggered = checkAlerts({ INTC: 28 });
    expect(triggered.length).toBe(1);
    expect(triggered[0].alert.type).toBe('below');
  });

  it('does not re-trigger already triggered alert', () => {
    addEntry('SPY');
    addAlert('SPY', 'above', 400);
    checkAlerts({ SPY: 410 }); // First trigger
    const triggered2 = checkAlerts({ SPY: 420 }); // Should not trigger again
    expect(triggered2.length).toBe(0);
  });

  it('clears an alert by index', () => {
    addEntry('QQQ');
    addAlert('QQQ', 'above', 380);
    addAlert('QQQ', 'below', 350);
    const result = clearAlert('QQQ', 0);
    expect(result.success).toBe(true);
    const entry = getEntry('QQQ');
    expect(entry?.alerts.length).toBe(1);
    expect(entry?.alerts[0].type).toBe('below');
  });

  it('does not trigger alert when price does not cross threshold', () => {
    addEntry('META');
    addAlert('META', 'above', 500);
    const triggered = checkAlerts({ META: 480 });
    expect(triggered.length).toBe(0);
  });
});

describe('Watchlist Cases', () => {
  it('handles Chinese stock symbols', () => {
    freshModule();
    const result = addEntry('600519', undefined, ['liquor', 'a-share']);
    expect(result.success).toBe(true);
    expect(result.entry?.symbol).toBe('600519');
  });

  it('handles lowercase symbols (normalizes to uppercase)', () => {
    freshModule();
    const result = addEntry('amzn');
    expect(result.success).toBe(true);
    expect(result.entry?.symbol).toBe('AMZN');
  });
});
