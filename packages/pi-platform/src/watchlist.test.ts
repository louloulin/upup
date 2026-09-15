import { describe, expect, test } from 'bun:test';
import { addPlatformWatchlistAlert, addPlatformWatchlistEntry, checkPlatformWatchlistAlerts, clearPlatformWatchlistAlert, createInitialPlatformWatchlistState, listPlatformWatchlistEntries, parsePlatformWatchlistState, removePlatformWatchlistEntry } from './watchlist';

describe('Pi platform watchlist state', () => {
  test('keeps entries and alerts immutable and session serializable', () => {
    let state = createInitialPlatformWatchlistState('1');
    const added = addPlatformWatchlistEntry(state, { symbol: 'aapl', tags: ['tech', 'tech'] }, '2');
    state = added.state;
    expect(added).toMatchObject({ added: true, symbol: 'AAPL' });
    const alert = addPlatformWatchlistAlert(state, { symbol: 'AAPL', type: 'above', value: 200 }, '3');
    state = alert.state;
    expect(listPlatformWatchlistEntries(parsePlatformWatchlistState(state), 'tech')).toHaveLength(1);
    const checked = checkPlatformWatchlistAlerts(state, { AAPL: 201 }, '4');
    expect(checked.triggered).toHaveLength(1);
    expect(checked.state.entries.AAPL.alerts[0].triggered).toBe(true);
    const cleared = clearPlatformWatchlistAlert(checked.state, { symbol: 'AAPL', alertIndex: 0 }, '5');
    expect(cleared.cleared).toBe(true);
    expect(removePlatformWatchlistEntry(cleared.state, 'AAPL', '6').removed).toBe(true);
  });

  test('fails closed for malformed state and unknown symbols', () => {
    expect(parsePlatformWatchlistState({ schema: 99 })).toEqual(createInitialPlatformWatchlistState());
    const state = createInitialPlatformWatchlistState('1');
    expect(addPlatformWatchlistAlert(state, { symbol: 'AAPL', type: 'above', value: 1 }, '2').added).toBe(false);
    expect(() => addPlatformWatchlistEntry(state, { symbol: 'bad symbol' }, '2')).toThrow();
  });
});
