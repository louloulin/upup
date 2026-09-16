/**
 * Tests for `session-providers-store.ts`.
 *
 * Covers basic CRUD, dispose semantics, replace vs preserve options, and
 * isolation between concurrent sessions.
 */
import { afterEach, describe, expect, test } from 'bun:test';
import {
  __resetSessionProvidersForTests,
  clearSessionProviders,
  getSessionProviders,
  listSessionProvidersKeys,
  setSessionProviders,
} from './session-providers-store';

afterEach(() => {
  __resetSessionProvidersForTests();
});

describe('session-providers-store', () => {
  test('set + get roundtrip', () => {
    const providers = { marketData: { fetcher: () => 'yahoo' } };
    setSessionProviders('session-1', providers);
    expect(getSessionProviders('session-1')).toBe(providers);
  });

  test('clear removes entry', () => {
    setSessionProviders('session-1', { foo: 1 });
    expect(getSessionProviders('session-1')).toEqual({ foo: 1 });
    clearSessionProviders('session-1');
    expect(getSessionProviders('session-1')).toBeUndefined();
  });

  test('dispose replaces with previous entry by default', () => {
    const prev = { tool: 'a' };
    const next = { tool: 'b' };
    setSessionProviders('s', prev);
    const dispose = setSessionProviders('s', next);
    expect(getSessionProviders('s')).toBe(next);
    dispose();
    expect(getSessionProviders('s')).toBe(prev);
  });

  test('dispose with replace:false deletes without restoring previous', () => {
    const prev = { tool: 'a' };
    const next = { tool: 'b' };
    setSessionProviders('s', prev);
    const dispose = setSessionProviders('s', next, { replace: false });
    dispose();
    expect(getSessionProviders('s')).toBeUndefined();
  });

  test('isolates concurrent sessions', () => {
    setSessionProviders('a', { market: 'cn' });
    setSessionProviders('b', { market: 'us' });
    expect(getSessionProviders('a')).toEqual({ market: 'cn' });
    expect(getSessionProviders('b')).toEqual({ market: 'us' });
  });

  test('listSessionProvidersKeys returns all session ids', () => {
    setSessionProviders('a', {});
    setSessionProviders('b', {});
    expect(new Set(listSessionProvidersKeys())).toEqual(new Set(['a', 'b']));
  });

  test('throws on empty sessionId for set', () => {
    expect(() => setSessionProviders('', {})).toThrow('non-empty sessionId');
  });

  test('get on empty sessionId returns undefined', () => {
    expect(getSessionProviders('')).toBeUndefined();
  });

  test('generic typing flows through', () => {
    interface QuoteProviders { readonly quoteFetcher: () => string }
    setSessionProviders<QuoteProviders>('typed', { quoteFetcher: () => 'AAPL' });
    const result = getSessionProviders<QuoteProviders>('typed');
    expect(result?.quoteFetcher()).toBe('AAPL');
  });

  test('dispose is idempotent', () => {
    const dispose = setSessionProviders('idem', { v: 1 });
    dispose();
    expect(() => dispose()).not.toThrow();
  });
});
