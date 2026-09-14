/**
 * useInput Hook
 *
 * 对标 Loucode input handling
 * 处理键盘输入和快捷键
 */

import { matchesKey, Key } from '@earendil-works/pi-tui';

export type KeyHandler = (data: string) => void;

// Key types for type safety
type KeyType = Parameters<typeof matchesKey>[1];

/**
 * Input Handler Map
 */
export type InputHandlerMap = {
  [key: string]: KeyHandler;
};

/**
 * useInput Hook 配置
 */
export interface UseInputOptions {
  /** 焦点模式 - 是否只在组件有焦点时处理输入 */
  focusMode?: boolean;
  /** 是否处理普通文本输入 */
  handleTextInput?: boolean;
  /** 是否处理方向键 */
  handleArrowKeys?: boolean;
}

/**
 * Input Hook 返回类型
 */
export interface UseInputResult {
  /** 处理输入 */
  handleInput: (data: string) => void;
  /** 注册的按键处理器 */
  handlers: Map<string, KeyHandler>;
}

/**
 * Input Hook
 *
 * 在 pi-tui 组件中使用输入处理
 *
 * @example
 * ```typescript
 * const { handleInput } = useInput({
 *   onUp: () => navigateUp(),
 *   onDown: () => navigateDown(),
 *   onEnter: () => submit(),
 *   onEscape: () => cancel(),
 * });
 * ```
 */
export function useInput(
  handlers: InputHandlerMap,
  options: UseInputOptions = {},
): UseInputResult {
  const handlerMap = new Map<string, KeyHandler>(Object.entries(handlers));

  const handleInput = (data: string): void => {
    // 检查是否是特殊键
    for (const [key, handler] of handlerMap) {
      if (matchesKey(data, key as unknown as KeyType)) {
        handler(data);
        return;
      }
    }

    // 处理普通文本输入
    if (options.handleTextInput !== false && data.length === 1) {
      handlerMap.get('text')?.(data);
    }
  };

  return {
    handleInput,
    handlers: handlerMap,
  };
}

/**
 * useArrowKeys Hook
 *
 * 专门处理方向键
 */
export function useArrowKeys(
  handlers: {
    up?: () => void;
    down?: () => void;
    left?: () => void;
    right?: () => void;
  },
): { handleInput: (data: string) => void } {
  const handleInput = (data: string): void => {
    if (matchesKey(data, Key.up)) {
      handlers.up?.();
    } else if (matchesKey(data, Key.down)) {
      handlers.down?.();
    } else if (matchesKey(data, Key.left)) {
      handlers.left?.();
    } else if (matchesKey(data, Key.right)) {
      handlers.right?.();
    }
  };

  return { handleInput };
}

/**
 * useEnterEscape Hook
 *
 * 专门处理确认/取消键
 */
export function useEnterEscape(
  handlers: {
    onEnter?: () => void;
    onEscape?: () => void;
    onCtrlC?: () => void;
    onCtrlZ?: () => void;
  },
): { handleInput: (data: string) => void } {
  const handleInput = (data: string): void => {
    if (matchesKey(data, Key.enter)) {
      handlers.onEnter?.();
    } else if (matchesKey(data, Key.escape)) {
      handlers.onEscape?.();
    } else if (matchesKey(data, Key.ctrl('c'))) {
      handlers.onCtrlC?.();
    } else if (matchesKey(data, Key.ctrl('z'))) {
      handlers.onCtrlZ?.();
    }
  };

  return { handleInput };
}
