/**
 * useSyncStore - React-free sync external store hook
 *
 * 对标 Loucode 的 useSyncExternalStore 模式
 * 用于在非 React 环境中订阅 Store 变化
 */

import type { Listener, Store } from '../state/store';

/**
 * 订阅结果
 */
export interface SyncStoreSnapshot<T> {
  /** 当前状态 */
  value: T;
  /** 状态版本号 */
  version: number;
  /** 订阅状态变化 */
  subscribe: (listener: () => void) => () => void;
}

/**
 * 从 Store 创建可同步快照
 */
export function createSyncSnapshot<T>(store: Store<T>): SyncStoreSnapshot<T> {
  let version = 0;

  return {
    get value() {
      return store.getState();
    },
    get version() {
      return version;
    },
    subscribe(listener: Listener): () => void {
      return store.subscribe(() => {
        version++;
        listener();
      });
    },
  };
}

/**
 * 选择器函数类型
 */
export type Selector<T, R> = (state: T) => R;

/**
 * useSyncStore Hook (非 React 版本)
 *
 * 适用于 pi-tui 组件的状态订阅
 *
 * @example
 * ```typescript
 * // 创建选择器
 * const selectMessages = (state: AppState) => state.messages;
 * const selectLoading = (state: AppState) => state.isLoading;
 *
 * // 在组件中使用
 * class ChatAreaComponent implements Component {
 *   private selector: Selector<AppState, ChatMessage[]>;
 *
 *   constructor(store: AppStateStore) {
 *     this.selector = selectMessages;
 *     // 订阅状态变化
 *     store.subscribe(() => this.invalidate());
 *   }
 *
 *   render(width: number): string[] {
 *     const messages = this.selector(getAppStateStore().getState());
 *     return messages.map(m => m.content);
 *   }
 * }
 * ```
 */
export function useSyncStore<T>(store: Store<T>): T {
  return store.getState();
}

/**
 * 带选择器的 useSyncStore
 */
export function useSyncStoreSelector<T, R>(
  store: Store<T>,
  selector: Selector<T, R>,
  equalityFn: (a: R, b: R) => boolean = Object.is,
): R {
  let currentValue = selector(store.getState());
  let currentSnapshot = currentValue;

  // 创建版本追踪
  let version = 0;
  let snapshotVersion = 0;

  // 订阅版本变化
  const unsubscribe = store.subscribe(() => {
    version++;
  });

  // 返回代理对象，只有在版本变化时才重新计算
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Proxy({} as any, {
    get(_target, prop) {
      // 如果版本变化，重新计算选择器
      if (version !== snapshotVersion) {
        snapshotVersion = version;
        currentSnapshot = selector(store.getState());
      }
      return (currentSnapshot as any)[prop];
    },
    apply(_target, _this, args) {
      if (version !== snapshotVersion) {
        snapshotVersion = version;
        currentSnapshot = selector(store.getState());
      }
      return (currentSnapshot as any)(...args);
    },
  });
}

/**
 * 派生 Store
 *
 * 从现有 Store 创建一个派生 Store，只在选择结果变化时通知
 */
export function createDerivedStore<T, R>(
  source: Store<T>,
  selector: Selector<T, R>,
  equalityFn: (a: R, b: R) => boolean = Object.is,
): Store<R> {
  let currentValue = selector(source.getState());

  return {
    getState: () => currentValue,
    setState: () => {
      // 派生 Store 是只读的
      console.warn('derivedStore.setState is not supported');
    },
    subscribe(listener: Listener): () => void {
      return source.subscribe(() => {
        const newValue = selector(source.getState());
        if (!equalityFn(newValue, currentValue)) {
          currentValue = newValue;
          listener();
        }
      });
    },
  };
}

/**
 * Store 组合器
 *
 * 组合多个 Store，当任一 Store 变化时通知
 */
export function combineStoresWithSelectors<T extends Record<string, unknown>>(
  stores: { [K in keyof T]: Store<T[K]> },
): Store<T> {
  const keys = Object.keys(stores) as (keyof T)[];

  return {
    getState: () => {
      const state = {} as T;
      for (const key of keys) {
        state[key] = stores[key].getState();
      }
      return state;
    },
    setState: () => {
      console.warn('combinedStores.setState is not supported');
    },
    subscribe(listener: Listener): () => void {
      const unsubscribers = keys.map(key =>
        stores[key].subscribe(listener),
      );
      return () => unsubscribers.forEach(unsub => unsub());
    },
  };
}

/**
 * 批量更新 Store
 *
 * 在一个事务中更新多个 Store
 */
export function batchUpdate<T1, T2>(
  store1: Store<T1>,
  store2: Store<T2>,
  update1: (prev: T1) => T1,
  update2: (prev: T2) => T2,
): void {
  // 暂时禁用订阅
  let s1Updated = false;
  let s2Updated = false;
  let listener: Listener | null = null;

  const unsub1 = store1.subscribe(() => {
    s1Updated = true;
    listener?.();
  });
  const unsub2 = store2.subscribe(() => {
    s2Updated = true;
    listener?.();
  });

  // 执行更新
  store1.setState(update1);
  store2.setState(update2);

  // 恢复订阅并通知
  listener = () => {};
  unsub1();
  unsub2();

  if (s1Updated) listener();
  if (s2Updated) listener();
}

/**
 * 稳定的选择器工厂
 *
 * 创建一个稳定的选择器，只有在依赖变化时才会重新创建
 */
export function createSelector<T, R>(
  selector: Selector<T, R>,
): Selector<T, R> {
  let lastInput: T | undefined;
  let lastResult: R | undefined;

  return (state: T): R => {
    if (state === lastInput && lastResult !== undefined) {
      return lastResult;
    }
    lastInput = state;
    lastResult = selector(state);
    return lastResult;
  };
}

/**
 * Store 调试工具
 *
 * 创建一个带调试功能的 Store
 */
export function createDebugStore<T>(
  store: Store<T>,
  name: string,
  logger: { log: (msg: string) => void } = console,
): Store<T> {
  return {
    getState: () => {
      const state = store.getState();
      logger.log(`[${name}] getState`);
      return state;
    },
    setState: (updater) => {
      const prev = store.getState();
      logger.log(`[${name}] setState: ${JSON.stringify(prev)} → ...`);
      store.setState(updater);
      const next = store.getState();
      logger.log(`[${name}] setState: ${JSON.stringify(next)}`);
    },
    subscribe: (listener: Listener) => {
      logger.log(`[${name}] subscribe`);
      return store.subscribe(() => {
        logger.log(`[${name}] notify`);
        listener();
      });
    },
  };
}