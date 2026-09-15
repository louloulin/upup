/**
 * useStore Hook
 *
 * 对标 Loucode React hooks for Store integration
 * 提供在 pi-tui 组件中使用 Store 的方式
 */

import type { Store, Listener } from '../state/store';

/**
 * 创建 Store Hook
 *
 * @param store - Store 实例
 * @returns Hook 返回状态和订阅取消函数
 */
export function useStore<T>(
  store: Store<T>,
): {
  state: T;
  subscribe: (listener: Listener) => () => void;
} {
  // 直接返回 store 的方法
  // 在 pi-tui 组件中，订阅应该在组件初始化时进行
  return {
    state: store.getState(),
    subscribe: store.subscribe.bind(store),
  };
}

/**
 * 创建 Selector Hook
 *
 * @param store - Store 实例
 * @param selector - 状态选择器
 * @returns 选择的子状态
 */
export function useStoreSelector<T, S>(
  store: Store<T>,
  selector: (state: T) => S,
): {
  selected: S;
  subscribe: (listener: Listener) => () => void;
} {
  return {
    selected: selector(store.getState()),
    subscribe: store.subscribe.bind(store),
  };
}

/**
 * 创建 Store 订阅 Hook
 *
 * 用于在组件 render 时订阅状态变化
 * 返回当前状态和取消订阅函数
 */
export function useStoreSubscription<T>(
  store: Store<T>,
): {
  state: T;
  unsubscribe: () => void;
} {
  let state = store.getState();
  let listener: Listener | null = null;
  let unsubscribed = false;

  // 创建监听器
  const updateState: Listener = () => {
    state = store.getState();
    // 在 pi-tui 中，状态更新会触发 requestRender
  };

  // 执行订阅
  unsubscribed = false;
  const unsubscribe = store.subscribe(updateState);
  state = store.getState();

  return {
    state,
    unsubscribe: () => {
      if (!unsubscribed) {
        unsubscribed = true;
        unsubscribe();
      }
    },
  };
}
