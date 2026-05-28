/**
 * TUI State Store
 *
 * 基于 Loucode store.ts 的简单状态管理模式
 * 提供 subscribe/setState/getState 接口
 */

export type Listener = () => void;

export type Store<T> = {
  /** 获取当前状态 */
  getState: () => T;
  /** 更新状态 (函数式更新) */
  setState: (updater: (prev: T) => T) => void;
  /** 订阅状态变化，返回取消订阅函数 */
  subscribe: (listener: Listener) => () => void;
  /** 获取初始状态 (用于 SSR hydration) */
  getServerState?: () => T;
};

/**
 * 创建状态存储
 *
 * @param initialState 初始状态
 * @param onChange 状态变化回调
 */
export function createStore<T>(
  initialState: T,
  onChange?: (args: { newState: T; oldState: T }) => void,
): Store<T> {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,

    setState: (updater: (prev: T) => T) => {
      const prev = state;
      const next = updater(prev);

      // 引用相等检查，避免无效更新触发重渲染
      if (Object.is(next, prev)) return;

      state = next;
      onChange?.({ newState: next, oldState: prev });

      // 通知所有订阅者
      listeners.forEach(listener => listener());
    },

    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * 组合多个 Store
 * 当任一 Store 变化时，所有订阅者都会收到通知
 */
export function combineStores<T1, T2>(
  store1: Store<T1>,
  store2: Store<T2>,
  selector: (s1: T1, s2: T2) => T1 | T2,
): Store<T1 | T2> {
  const listeners = new Set<Listener>();

  const unsub1 = store1.subscribe(() => listeners.forEach(l => l()));
  const unsub2 = store2.subscribe(() => listeners.forEach(l => l()));

  return {
    getState: () => selector(store1.getState(), store2.getState()),
    setState: (updater) => {
      // 组合 Store 是只读的
      console.warn('combinedStore.setState is not supported');
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
