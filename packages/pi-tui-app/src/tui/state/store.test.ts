/**
 * Store Unit Tests
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createStore, type Store, combineStores } from './store';

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

describe('Store', () => {
  describe('createStore', () => {
    it('should return initial state', () => {
      const store = createStore({ count: 0 });
      expect(store.getState()).toEqual({ count: 0 });
    });

    it('should update state with setState', () => {
      const store = createStore({ count: 0 });
      store.setState(prev => ({ count: prev.count + 1 }));
      expect(store.getState()).toEqual({ count: 1 });
    });

    it('should notify subscribers on state change', () => {
      const store = createStore({ count: 0 });
      const fn = createMockFn();
      store.subscribe(fn);
      store.setState(prev => ({ count: prev.count + 1 }));
      expect(fn.called()).toBe(true);
    });

    it('should not notify if state unchanged (reference equality)', () => {
      const store = createStore({ count: 0 });
      const fn = createMockFn();
      store.subscribe(fn);
      store.setState(p => p); // 返回同一引用
      expect(fn.called()).toBe(false);
    });

    it('should call onChange callback', () => {
      let callArgs: unknown = null;
      const onChange = (args: { newState: unknown; oldState: unknown }) => {
        callArgs = args;
      };
      const store = createStore({ count: 0 }, onChange);
      store.setState(prev => ({ count: prev.count + 1 }));
      expect(callArgs).toEqual({
        newState: { count: 1 },
        oldState: { count: 0 },
      });
    });

    it('should return unsubscribe function', () => {
      const store = createStore({ count: 0 });
      const fn = createMockFn();
      const unsubscribe = store.subscribe(fn);
      unsubscribe();
      store.setState(prev => ({ count: prev.count + 1 }));
      expect(fn.called()).toBe(false);
    });
  });

  describe('combineStores', () => {
    it('should combine two stores', () => {
      const store1 = createStore({ a: 1 });
      const store2 = createStore({ b: 2 });
      const combined = combineStores(store1, store2, (s1, s2) => ({ ...s1, ...s2 }));

      expect(combined.getState()).toEqual({ a: 1, b: 2 });
    });

    it('should notify on first store change', () => {
      const store1 = createStore({ a: 1 });
      const store2 = createStore({ b: 2 });
      const combined = combineStores(store1, store2, (s1, s2) => ({ ...s1, ...s2 }));

      const fn = createMockFn();
      combined.subscribe(fn);
      store1.setState(prev => ({ a: 10 }));
      expect(fn.called()).toBe(true);
    });

    it('should notify on second store change', () => {
      const store1 = createStore({ a: 1 });
      const store2 = createStore({ b: 2 });
      const combined = combineStores(store1, store2, (s1, s2) => ({ ...s1, ...s2 }));

      const fn = createMockFn();
      combined.subscribe(fn);
      store2.setState(prev => ({ b: 20 }));
      expect(fn.called()).toBe(true);
    });
  });
});
